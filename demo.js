"use strict"
var store = require('app-store-scraper');
// const { WebClient } = require('@slack/client');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// An access token (from your Slack app or custom integration - xoxp, xoxb, or xoxa)
const token = 'insert token here';

/*
These are the buckets
*/
var cs = ['customer', 'customer service'];
var sell = ['sold'];
var buy = ['american express', 'buy', 'Buy', 'price changes', 'cc', 'payment', 'visa'];
var fees = ['fee', 'Fee', 'fees', 'Fees', 'fe', 'money', 'cost'];
var count = 0;
var subscribers = {
	cs: {
		email: 'rita.chow@gmail.com',
		id: '@rita.chow',
		keywords: cs
	},
	sell: {
		email: 'samkaks@gmail.com',
		id: '@samkaks',
		keywords: sell
	},
	buy: {
		email: 'rita.chow@gmail.com',
		id: '@samkaks',
		keywords: buy
	},
	fees: {
		email: 'samkaks@gmail.com',
		id: '@rita.chow',
		keywords: fees
	}
};

mongoose.connect('mongodb://localhost/test');


const reviewSchema = new Schema({
	id: {
		type: Number,
		index: true,
		unique: true
	},
	version: String,
	title: String,
	text: String,
	score: Number,
	username: String
}, { strict: false });

var reviewModel = mongoose.model('Review', reviewSchema);

console.log('subscribers:', subscribers);

function start() {
	var reviews = [];

	for (let j = 0; j < 11; j++) {
		store.reviews({
			id: 366562751,
			sort: store.sort.RECENT,
			page: j
		}).then(
			function (apiResponse) {
				reviews = reviews.concat(apiResponse)
				console.log(apiResponse)
				console.log("Reviews has " + reviews.length + " reviews")

				if (j === 10) {
					bucketize(reviews);
				}
			})
	}

	function bucketize(reviews) {
		console.log('\n\n\nGot ' + reviews.length + ' reviews...');
		let reviewsString = '';
		for (let key in subscribers) {
			let aSubscriber = subscribers[key];
			let reviewsForSubscriber = [];
			for (let i = 0; i < reviews.length; i++) {
				let reviewItem = new reviewModel({
					id: reviews[i].id,
					version: reviews[i].version,
					title: reviews[i].title,
					text: reviews[i].text,
					score: reviews[i].score,
					username: reviews[i].userName
				});
				reviewItem.save();
				console.log('I\'m here');
				if (reviews[i].score <= 3 && !aSubscriber.keywords.some(word => reviews[i].title.includes(word))) {
					reviewsForSubscriber.push(reviews[i]);
					if (reviewsForSubscriber.length == 1) {
						reviewsString += ':';
					}
					reviewsString += '\n\n\t' + reviews[i].title;
					reviewsString += '\n\tName:  ' + reviews[i].userName;
					reviewsString += '\n\tVersion:  ' + reviews[i].version;
					reviewsString += '\n\tScore:  ' + reviews[i].score;
					reviewsString += '\n\tComment:  ' + reviews[i].text;
				}
			}
			console.log('\n\n\n****************************************\n');
			let message = 'There are ' + reviewsForSubscriber.length + ' poor reviews for ' + key + reviewsString;

			console.log(message);

			// if (reviewsForSubscriber.length) {
			// 	const web = new WebClient(token);

			// 	// See: https://api.slack.com/methods/chat.postMessage
			// 	web.chat.postMessage({ channel: aSubscriber.id, text: message })
			// 		.then((res) => {
			// 			// `res` contains information about the posted message
			// 			console.log('Message sent: ', res.ts);
			// 		})
			// 		.catch(console.error);
			// } else {
			// 	console.log('No new bad reviews for ' + key);
			// }
		}
	}
}

mongoose.connection.on('open', function (err, db) {
	start();
}).then(function () {
	mongoose.disconnect();
});


