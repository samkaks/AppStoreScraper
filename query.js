'use strict'
const store = require('app-store-scraper');
const { WebClient } = require('@slack/client');
const mongoose = require('mongoose');
// An access token (from your Slack app or custom integration - xoxp, xoxb, or xoxa)
const SlackToken = 'insert token here';
const StubHubStoreId = 366562751;
const ascending = 1;
const descending = -1;
var limit = 15;
var countries = ["us", "gb", "de", "it"];



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
const target = 'ru';

// Translates some text into Russian

function translateText(text, country) {
    return translate
        .translate(text, country)
        .then(results => {
            const translation = results[0];
            return translation;

            console.log(`Text: ${text}`);
            console.log(`Translation: ${translation}`);
        })
        .catch(err => {
            console.error('ERROR:', err);
        });

}




function main(storeId, subscribers, slackToken) {
    console.log('\n\n\nSubscribers:', subscribers);

    setupDb();
    mongoose.connection.on('open', function (err, db) {
        mongoose.connection.db.listCollections().toArray((error, collections) => {
            console.log('\n\n\ncollections:', collections)
        });

        Review.find({}, function (err, reviews) {
            if (err) {
                console.log('\n\n\nError finding review: ', err);
            } else {
                console.log('\n\n\nFound ', reviews.length, ' reviews in db');
            }
        });

        start(storeId, subscribers, slackToken);
    }).then(function () {
        //mongoose.disconnect();
    });
}

function setupDb() {
    mongoose.connect('mongodb://localhost/reviews', function (err, db) {
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
        url: String
    }, { strict: false });
    Review = mongoose.model('Review', ReviewSchema);
}

function start(storeId, subscribers, slackToken) {
    store.app({ id: storeId })
        .then((appDetails) => {
            //			console.log('App details:', appDetails);
            console.log('\nNumber of reviews: ' + appDetails.reviews);
            const reviewsPerPage = 50;
            // https://www.npmjs.com/package/app-store-scraper
            // Documentations says max page number is 9 but was able to get 10
            const maxPages = 11;
            let numberOfPages = Math.min(Math.ceil(appDetails.reviews / reviewsPerPage), maxPages);
            console.log('Number of pages: ' + numberOfPages);
            for (let pageNumber = 0; pageNumber < numberOfPages; pageNumber++) {
                processPage(storeId, subscribers, slackToken, pageNumber);
            }
        })
        .catch(console.log);
}

async function processPage(storeId, subscribers, slackToken, page) {
    store.reviews({
        id: storeId,
        sort: store.sort.RECENT,
        page: page
    })
        .then((reviews) => {
            console.log('\n\n\nGot ' + reviews.length + ' reviews for page ' + page);
            let reviewsNotChecked = [];
            const testreviews = [];
            const findObject = (value) => {
                return Review.find({}, { _id: 0 }).sort({ id: descending }).limit(limit).exec();
              }
              
              mainFunction = async => {
                   testreviews = await findObject(limit);
                   console.log(testreviews); // or anything else as per your wish
              }
            
            
            for (let i = 0; i < reviews.length; i++) {
                //console.log(i + ': ' + reviews[i].id);

                Review.find({ id: reviews[i].id }, function (err, found) {
                    //console.log('found: ', found);
                    if (err) {
                        console.log('Error finding reviews with id', reviews[i].id, ':', err);
                    } else if (found.length === 0) {
                        console.log('Didn\'t find review ' + reviews[i].id);
                        reviewsNotChecked.push(reviews[i]);
                        if (reviews[i].country === 'it' || reviews.country === 'de') {
                            reviews[i].text = await translateText(reviews[i].text, reviews[i].country);
                        }
                        saveReview(reviews[i]);
                    } else {
                        //console.log('Review ' + reviews[i].id + ' already in db');
                    }
                    if (i === (reviews.length - 1)) {
                        sendReviewsToSubscribers(subscribers, slackToken, reviewsNotChecked);
                    }
                });
            }
        })
        .catch(console.log);
}

function formatReview(review) {
    let formattedString = '\n\n\t' + review.title;
    formattedString += '\n\tName:  ' + review.userName;
    formattedString += '\n\tVersion:  ' + review.version;
    formattedString += '\n\tScore:  ' + review.score;
    formattedString += '\n\tComment:  ' + review.text;
    return formattedString;
}

function sendReviewsToSubscribers(subscribers, slackToken, reviews) {
    console.log('There are ' + reviews.length + ' new reviews');

    let reviewsString = '';
    for (let key in subscribers) {
        let aSubscriber = subscribers[key];
        let reviewsForSubscriber = [];
        for (let i = 0; i < reviews.length; i++) {
            if ((reviews[i].score <= 5)
                && (aSubscriber.keywords.some(word => reviews[i].title.toLowerCase().includes(word.toLowerCase()))
                    || aSubscriber.keywords.some(word => reviews[i].text.toLowerCase().includes(word.toLowerCase())))) {
                reviewsForSubscriber.push(reviews[i]);
                if (reviewsForSubscriber.length == 1) {
                    reviewsString += ':';
                }
                reviewsString += formatReview(reviews[i]);
            }
        }
        console.log('\n\n\n****************************************\n')
        let message = 'There are ' + reviewsForSubscriber.length + ' poor reviews for ' + key + reviewsString;

        console.log(message);

        if (reviewsForSubscriber.length) {
            console.log('sending message!');
            postMessage(slackToken, aSubscriber.id, message);
        } else {
            console.log('No new bad reviews for ' + key);
        }
    }
}

function postMessage(slackToken, subscriberId, message) {
    const web = new WebClient(slackToken);

    // See: https://api.slack.com/methods/chat.postMessage
    web.chat.postMessage({ channel: subscriberId, text: message })
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
        url: review.url
    });

    reviewItem.save(function (err) {
        if (err) {
            console.log('Error saving', review.id, ':', err);
        }
        console.log('Saved review ' + review.id + '!');
    });
}
main(StubHubStoreId, Subscribers, SlackToken);