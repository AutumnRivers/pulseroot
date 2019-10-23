/*
 *This Source Code Form is subject to the terms of the Mozilla Public
 *License, v. 2.0. If a copy of the MPL was not distributed with this
 *file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

window.onload = function(){
  if(!("Notification" in window)) {
    console.log('Notification support not found - skipping request.');
  } else if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendNotification(data, message) {
  if(!("Notification" in window) || Notification.permission !== 'granted') {
    return;
  } else {
    const notif = new Notification('New Message From ' + data.username, {"body":message});
    notif.onclick = function(event) {
      event.preventDefault();
      window.location.href = 'localhost:8080/messaging/' + data.username;
    };
  }
}

function uuidv4() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

function showMobileNav() {
  document.getElementById('mobileMenu').style.width = "100%";
}

function closeMobileNav() {
  document.getElementById('mobileMenu').style.width = "0%";
}