'use strict'
const store = require('app-store-scraper');
const { WebClient } = require('@slack/client');
const mongoose = require('mongoose');
const SlackBot = require('slackbots');
// An access token (from your Slack app or custom integration - xoxp, xoxb, or xoxa)
const SlackToken = 'insert slack token here';
const StubHubStoreId = 366562751;
const IconEmoji = ':poop:';


/*
These are the buckets
*/
var Review;
var cs = ['customer', 'service'];
var sell = ['sold'];
var buy = ['american express', 'buy', 'Buy', 'price changes', 'cc', 'payment', 'visa'];
var fees = ['fee', 'Fee', 'fees', 'Fees', 'fe', 'money', 'cost'];
var orders = ['order', 'orders', 'flash', 'pdf', 'print', 'email', 'my tickets', 'My Tickets', 'download', 'Download', 'accept', 'ticketmaster', 'Ticketmaster'];
var Subscribers = {
	cs: {
		email: 'rita.chow@gmail.com',
		id: '@skakria',
		keywords: cs
	},
	sell: {
		email: 'samkaks@gmail.com',
		id: 'CB2AJRT6E',
		keywords: sell
	},
	buy: {
		email: 'rita.chow@gmail.com',
		id: 'CB2ELP6HK',
		keywords: buy
	},
	fees: {
		email: 'samkaks@gmail.com',
		id: 'CB3VD6F6D',
		keywords: fees
	},
	orders: {
		email: 'samkaks@gmail.com',
		id: 'CB4FYUY7L',
		keywords: orders
	}
};

 var countries = ["us", "ca", "gb"]; // i've removes de and italy to avoid translations temporarily
// var countries = ["de", "it"]

var flag = {
	us: {
		emojiName: ':flag-us:',
		countryName: 'United States'
	},
	ca: {
		emojiName: ':flag-ca:',
		countryName: 'Canada'
	},
	gb: {
		emojiName: ':flag-gb:',
		countryName: 'Great Britain'
	},
	de: {
		emojiName: ':flag-de:',
		countryName: 'Germany'
	},
	it: {
		emojiName: ':flag-it:',
		countryName: 'Italy'
	}
};

// Imports the Google Cloud client library
const Translate = require('@google-cloud/translate');

// Your Google Cloud Platform project ID
const projectId = 'stubhubappreviews';

// Instantiates a client
const translate = new Translate({
	projectId: projectId,
});

// The text to translate

// The target language
const target = 'en';

// Translates some text into Russian

function translateText(text, country) {
	return translate
		.translate(text, country)
		.then(results => {
			const translation = results[0];

			console.log(`Text: ${text}`);
			console.log(`Translation: ${translation}`);
			return translation;

		})
		.catch(err => {
			console.error('ERROR:', err);
		});

}

function main(storeId, subscribers, slackToken) {
	console.log('\n\n\nSubscribers:', subscribers);

	setupDb();
	mongoose.connection.on('open', async function (err, db) {
		mongoose.connection.db.listCollections().toArray((error, collections) => {
			console.log('\n\n\ncollections:', collections)
		});
		var promiseArray = [];
		Review.find({}, function (err, reviews) {
			if (err) {
				console.log('\n\n\nError finding review: ', err);
			} else {
				console.log('\n\n\nFound ', reviews.length, ' reviews in db');
			}
		});
		for (let k = 0; k < countries.length; k++) {
			await start(storeId, subscribers, slackToken, countries[k]);
		}
		mongoose.disconnect();
	}).then(function () {
		//mongoose.disconnect();
	});

	setupBot();
}

function setupBot() {
	// Create a bot
	let name = 'Review Bot';
	var bot = new SlackBot({
		token: 'xoxb-249730494288-381354474850-bircusVlEXc4aq4QLVeC0ynh', // Add a bot https://my.slack.com/services/new/bot and put the token
		name: name,
		icon_url: 'http://www.free-icons-download.net/images/bad-badtz-maru-icon-67748.png'
	});

	bot.on('start', function () {
		console.log('\n\n\n' + name + ' started!!!');
	});


	/**
	 * @param {object} message
	 */
	 bot.on('message', async function(message) {
		 console.log('\n\nBot on type ' + message.type + ' name ' + message.username + ' channel ' + message.channel + '!!!');
		 if (message.type === 'message' && message.subtype !== 'bot_message') {

				let botUsers = bot.getUsers();
		 		let users = botUsers._value.members;
		 		let messageUser = users.find(user => user.id === message.user);

		 		// all ingoing events https://api.slack.com/rtm
		 		console.log('Got message:', message, 'channel:', message.channel, 'type:', message.type);
				if (message.text.indexOf('?reviews-') === 0) {
					let parts = message.text.split('-');
					if (parts.length >= 2) {
						let numberOfReviews = parts[1];
						let country = parts.length > 2 ? parts[2] : 'us';
						let numberOfPages = numberOfPagesForNumberOfReviews(numberOfReviews);
						let listOfPromises = [];
						console.log('Will request', numberOfPages, numberOfPages === 1 ? 'page' : 'pages', '...');

							let reviews = [];
							for (let pageNumber = 0; pageNumber < numberOfPages; pageNumber++) {
								await fetchReviews(StubHubStoreId, Subscribers, SlackToken, pageNumber, country)
									.then(function(results) {
										for (let i = 0; i < results.length; i++) {
											reviews.push(createAttachment(results[i]));
										}
										console.log('Adding', results.length, 'reviews (', reviews.length, ')');
									});
							}
							reviews = reviews.splice(0, Math.min(numberOfReviews, reviews.length));

							// https://api.slack.com/methods/chat.postMessage
							let params = {
			 				 icon_emoji: IconEmoji,
							 attachments: reviews
			 				};

							bot.postMessageToUser(messageUser.name, 'Retreived last ' + reviews.length + ' reviews...', params)
								.then(function(results) {
										 console.log('\nPosted to ' + messageUser.name + '!');
								})
								.catch(console.log);

						}
					}
		  }
		});
}

function setupDb() {
	mongoose.connect('mongodb://127.0.0.1/reviews', function (err, db) {
		if (!err) {
			console.log("\nConnected to db");
		}
	});
	const Schema = mongoose.Schema,
		ObjectId = Schema.ObjectId;

	const ReviewSchema = new Schema({
		id: {
			type: String,
			index: true,
			unique: true
		},
		version: String,
		title: String,
		text: String,
		score: Number,
		username: String,
		userUrl: String,
		url: String,
		types: [String],
		country: String
	}, { strict: false });
	Review = mongoose.model('Review', ReviewSchema);
}

async function start(storeId, subscribers, slackToken, country) {
	return store.app({
		id: storeId,
		country: country
	})
		.then((appDetails) => {
			//			console.log('App details:', appDetails);
			var promiseArray = [];
			console.log('\nNumber of reviews: ' + appDetails.reviews);
			let numberOfPages = numberOfPagesForNumberOfReviews(appDetails.reviews);
			console.log('Number of pages: ' + numberOfPages);
			for (let pageNumber = 0; pageNumber < numberOfPages; pageNumber++) {
				promiseArray.push(processPage(storeId, subscribers, slackToken, pageNumber, country));
			}
			return Promise.all(promiseArray);
		})
		.catch(console.log);
}

function numberOfPagesForNumberOfReviews(numberOfReviews) {
	const reviewsPerPage = 50;
	// https://www.npmjs.com/package/app-store-scraper
	// Documentations says max page number is 9 but was able to get 10
	const maxPages = 11;
	let numberOfPages = Math.min(Math.ceil(numberOfReviews / reviewsPerPage), maxPages);
	return numberOfPages;
}

function processPage(storeId, subscribers, slackToken, page, country) {
	store.reviews({
		id: storeId,
		sort: store.sort.RECENT,
		page: page,
		country: country
	})
		.then((reviews) => {
			console.log('\n\n\nGot ' + reviews.length + ' reviews for page ' + page);
			let reviewsNotChecked = [];
			for (let i = 0; i < reviews.length; i++) {
				Review.find({ id: reviews[i].id }, async function (err, found) {
					let currentReview = JSON.parse(JSON.stringify(reviews[i]));
					if (err) {
						console.log('Error finding reviews with id', reviews[i].id, ':', err);
					} else if (found.length === 0) {
						console.log('Didn\'t find review ' + reviews[i].id);
						setupReview(currentReview, subscribers, country);
						saveReview(currentReview);
						reviewsNotChecked.push(currentReview);
					} else {
						console.log('Review ' + currentReview.title + ' already in db');
						//console.log('Review ' + reviews[i].id + ' already in db');
					}
					if (i === (reviews.length - 1)) {
						sendReviewsToSubscribers(subscribers, slackToken, reviewsNotChecked, country);
						console.log("Page: " + page);
					}
				});
				// console.log(country + " " + (await translateText(reviews[i].text, target)));
			}
		})
		.catch(console.log);
}

async function fetchReviews(storeId, subscribers, slackToken, page, country) {
	console.log('Fetching reviews for page', page);
	let results = [];
	await store.reviews({
			id: storeId,
			sort: store.sort.RECENT,
			page: page,
			country: country
		})
		.then((reviews) => {
			console.log('\n\n\nGot ' + reviews.length + ' reviews for page ' + page);
			for (let i = 0; i < reviews.length; i++) {
				setupReview(reviews[i], subscribers, country);
				results.push(reviews[i]);
				console.log('Adding review for', i, '(', results.length, ')');
			}
			console.log('Returning', results.length, 'reviews...');
		})
		.catch(console.log);

		console.log('There are a total of', results.length, 'reviews');
		return results;
}

async function setupReview(review, subscribers, country) {
	review.country = country;
	if (country === 'it' || country === 'de') {
		review.title = await translateText(review.title, target);
		review.text = await translateText(review.text, target)
	}

	review.types = [];
	for (let key in subscribers) {
		let keywords = subscribers[key].keywords;
		if (keywords.some(word => review.title.toLowerCase().includes(word.toLowerCase()))
			|| keywords.some(word => review.text.toLowerCase().includes(word.toLowerCase()))) {
			review.types.push(key);
			// console.log(JSON.stringify(review.types));
		}
	}
}

function sendReviewsToSubscribers(subscribers, slackToken, reviews, country) {
	for (let key in subscribers) {
		let aSubscriber = subscribers[key];
		let attachments = [];
		for (let i = 0; i < reviews.length; i++) {
			if ((reviews[i].score <= 3) && (reviews[i].types.indexOf(key) >= 0)) {
				attachments.push(createAttachment(reviews[i]));
			}
		}
		console.log('\n\n\n****************************************\n' + "Country CODE: " + country)
		let message = 'There are ' + attachments.length + ' poor reviews for ' + key + " in : " + (flag[country] || {}).countryName;

		console.log(message);

		if (attachments.length) {
			console.log('sending message!');
			postMessage(slackToken, aSubscriber.id, message, attachments);
		} else {
			console.log('No new bad reviews for ' + key);
		}
	}
}

function createAttachment(review) {
	return {
		"color": "#2eb886",
		"author_name": review.userName,
		"author_link": review.userUrl,
		"title": flag[review.country].emojiName + " " + review.title,
		"title_link": review.url,
		"text": review.text,
		"fields": [
			{
				"title": "Score",
				"value": review.score,
				"short": false
			}
		],
		"footer": "App version: " + review.version + " Country: " + review.country,
		"footer_icon": "http://www.free-icons-download.net/images/bad-badtz-maru-icon-67748.png"
	}
}

function postMessage(slackToken, subscriberId, message, attachments) {
	const web = new WebClient(slackToken);

	// See: https://api.slack.com/methods/chat.postMessage
	web.chat.postMessage({ channel: subscriberId, text: message, attachments: attachments })
		.then((res) => {
			// `res` contains information about the posted message
			console.log('Message sent: ', res.ts);
		})
		.catch(console.error);
}

function saveReview(review) {
	let reviewItem = new Review({
		id: review.id,
		version: review.version,
		title: review.title,
		text: review.text,
		score: review.score,
		username: review.userName,
		userUrl: review.userUrl,
		url: review.url,
		country: review.country
	});

	reviewItem.save(function (err) {
		if (err) {
			console.log('Error saving', review.id, ':', err);
		}
		console.log('Saved review ' + review.id + '!');
	});
}

main(StubHubStoreId, Subscribers, SlackToken);
