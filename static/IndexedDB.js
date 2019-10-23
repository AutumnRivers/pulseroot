/*
 *This Source Code Form is subject to the terms of the Mozilla Public
 *License, v. 2.0. If a copy of the MPL was not distributed with this
 *file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Test for IndexedDB support.
 * @returns {boolean} Whether or not IndexedDB is supported.
 */
function testForIndex() {
	if(!window.indexedDB) return false;
	return true;
}

/**
 * The object definition for messages, private or public
 * @typedef {Object} MessageObject
 * @property {string} username The username of the author
 * @property {string} display The display name of the author
 * @property {string} namecolor The color of the author's name
 * @property {string} text Message content
 * @property {string} timestamp The time the message was posted
 */

/**
 * Store a message into the IndexedDB database.
 * @param {MessageObject} pulseRootMessage Message object for PulseRoot messages
 * @param {string} databaseName Username used for database storage
 */
function storeIntoIndex(pulseRootMessage, databaseName) {
	if(!window.indexedDB || !pulseRootMessage || !databaseName) return;
	const database = window.indexedDB.open('PrivateMessages', 1);

	database.onupgradeneeded = function(event) {
		updateDb(event, databaseName);
	}
		
	database.onsuccess = function(event) {
		console.debug("Opened DB for message saving.");
		saveMessage(event, pulseRootMessage, databaseName);
	}

	database.onerror = function(event) {
		console.error('Error opening the database!\n' + event.target.errorCode);
		return false;
	}

}

/**
 * Clears the IndexedDB database for PulseRoot.
 */
function clearIndex(databaseName) {
	if(!databaseName) return;
	const requestDB = window.indexedDB.open('PrivateMessages');
	requestDB.onerror = function(event) {
		console.error("Error opening database:\n" + requestDB.error);
		return false;
	}
	requestDB.onsuccess = function(event) {
		const database = requestDB.result;
		const transaction = database.transaction([databaseName], 'readwrite');
		transaction.onerror = function(event) {
			console.error("Error opening transaction:\n" + transaction.error);
			return false;
		}
		const Messages = transaction.objectStore(databaseName);
		const clearMessages = Messages.clear();
		clearMessages.onsuccess = function() {
			console.debug("Cleared messages with no error.");
			return true;
		}
		clearMessages.onerror = function() {
			console.error("Error clearing messages:\n" + clearMessages.error);
			return false;
		}
	}
}

/**
 * Save the message to the database
 * @param {EventHandler} event 
 * @param {MessageObject} pulseRootMessage 
 * @param {string} dbName 
 */
function saveMessage(event, pulseRootMessage, dbName) {
	if(!event.result || !dbName || !pulseRootMessage) return "Missing Stuff";
	var databaseResult = event.target.result;
	const messageTransaction = databaseResult.transaction([dbName], 'readwrite');
	messageTransaction.onerror = function(event) {
		console.error("Error saving message\n" + event.target.errorCode);
		databaseResult.close();
		return;
	}
	messageTransaction.onsuccess = function(event) {
		console.log('Transaction Loaded');
	}
	const messageTransactionRequest = messageTransaction.objectStore(dbName);
	const addMessage = messageTransactionRequest.add(pulseRootMessage);
	addMessage.onsuccess = function() {
		console.debug("Message saved successfully.");
		databaseResult.close();
		return;
	}
	addMessage.onerror = function(event) {
		console.error("Message not saved due to error.");
		databaseResult.close();
		return;
	}
}

/**
 * Load in a collection of PulseRoot messages using a cursor.
 */

function loadInMessages(databaseName) {
	if(!window.indexedDB || !databaseName) return;
	const idb = window.indexedDB.open('PrivateMessages', 1);
	
	idb.onsuccess = function(event) {
		const database = event.target.result;
		const transaction = database.transaction([databaseName], 'readonly');
		const messageStore = transaction.objectStore(databaseName);
		messageStore.openCursor().onsuccess = function(event) {
			const cursor = event.target.result;
			if(cursor) {
				$('messages').append($('<li><span style="font-weight: bold; color: ' + cursor.value.namecolor + '"><a href="/profile/' + cursor.value.username + '" class="display" style="padding: 0; margin: 0">' + cursor.value.display + '</a></span><span class="timestamp">' + cursor.value.timestamp + '</span><br/><span style="color:#fff" class="msg">' + cursor.value.text + '</span></li>'));
				cursor.continue();
			} else {
				console.debug("Messages loaded and cursor finished.");
				database.close();
				return;
			}
		}
	}

	idb.onupgradeneeded = function (event) {
		updateDb(event, databaseName);
	}
}

function updateDb(event, databaseName) {
	var databaseResult = event.target.result;
	const messageStore = databaseResult.createObjectStore(databaseName, {autoIncrement: true});
	messageStore.createIndex('username', 'username', {unique: false});
	messageStore.createIndex('display', 'display', {unique: false});
	messageStore.createIndex('namecolor', 'namecolor', {unique: false});
	messageStore.createIndex('text', 'text', {unique: false});
	messageStore.createIndex('timestamp', 'timestamp', {unique: false});
}