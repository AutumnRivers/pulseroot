/*
 *This Source Code Form is subject to the terms of the Mozilla Public
 *License, v. 2.0. If a copy of the MPL was not distributed with this
 *file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

console.log('Starting up PulseRoot...');

const express = require("express"); //Webserver
const app = express();
const config = require("./config.json"); //Configuration file
//Actual dependencies
const bcrypt = require("bcrypt"); //Hashing
const sql = require("sqlite"); //Database
sql.open("./database/db.sqlite");
const md = require("markdown").markdown; //Parsing markdown
var request = require("node-fetch"); //Used for posting to webhook later on
const bodyParser = require("body-parser");
const pug = require("pug"); //Rendering dynamic HTML
var http = require('http').Server(app); //HTTP server for socket.io
const io = require('socket.io')(http); //Take a guess
var initSession = require("express-session");
var SQLiteStore = require('connect-sqlite3')(initSession);
const sharedsession = require("express-socket.io-session");
const crypto = require('crypto');
const Analytics = require('analytics-node');
const analytics = new Analytics(process.env.SEGMENT_KEY);
const uuid = require('uuid/v4');

const saltRounds = 10;
var session = initSession({
	store: new SQLiteStore(),
	secret: process.env.SESSION_SECRET,
	resave: false,
	saveUninitialized: true,
	cookie: {maxAge: 172800000, secure: false, path: '/', httpOnly: true}, //Cookies are stored for 2 days.
	name: "pulseroot"
});

/*
 * Functions
 * We use this for a variety of reasons, from calling webhooks to setting a session.
 * Best not to touch this unless you know what you're doing.
 *
 */

const callWebhook = (url, content) => {
	request(url, {
        	method: 'post',
		body: JSON.stringify({ content: content }),
		headers: { 'Content-Type': 'application/json' }
	});
};

const setSession = (req, res, username) => {
	sql.get(`SELECT * FROM users WHERE username = $username`, [$username=username]).then(userinfo => {
		var dInfo = req.session.discordInfo;
		req.session.regenerate(function () {
			req.session.userinfo = userinfo;
			req.session.discordInfo = dInfo;
			req.session.twitterInfo = req.session.twitterInfo;
			req.session.namecolor = userinfo.namecolor;
			res.redirect("/profile");
		});
		sql.run('UPDATE users SET sid = $sessionid WHERE username = $uname', [$sessionid = req.session.id, $uname = userinfo.username]);
	});
};

const sendMessage = (msg, username, color, io, date, display, namecolor) => {
	var msg = md.toHTML(msg);
	io.emit('chat message', {msg, username, color, date, display, namecolor});
	return;
};

const sendPrivateMessage = (msg, username, color, io, date, display, namecolor, avatar, id, secretKey, socket) => {
	const msgObject = {msg, username, color, date, display, namecolor, avatar, secretKey};
	io.to(id).emit('pm', msgObject);
	io.to(socket.id).emit('pm', msgObject);
	return;
};

/*
 * Utilize middleware.
 * Let sessions happen, set routes, all the good stuff.
 * 
 */
app.use(session);
app.use('/auth/discord', require('./apis/discord'));
app.use('/auth/twitter', require('./apis/twitter'));
app.use('/admin', require('./routes/admin'));
app.use('/dev', require('./routes/dev'));
app.use('/2fa', require('./routes/2fa'));
app.use('/api', require('./routes/privateApi'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use('/bower_components',  express.static(__dirname + '/bower_components')); //Make bower components usable
app.use(express.static('static'));
app.use(express.static('images'));

//Set important headers
app.use(function(req, res, next) {
	res.set({
		"Content-Security-Policy": "frame-src 'none'; script-src 'unsafe-inline' 'self' https://code.jquery.com/ https://cdnjs.cloudflare.com/; style-src 'unsafe-eval' 'unsafe-inline' 'self' https://fonts.googleapis.com/ https://use.fontawesome.com/ https://cdnjs.cloudflare.com/ https://neet.host/; img-src 'self' data: https://cdn.discordapp.com/ https://pbs.twimg.com/; font-src 'self' https://use.fontawesome.com/ https://fonts.gstatic.com/ data:; default-src 'self';",
		"X-XSS-Protection": "1", //Cross-site attack fallback protection - this is useless in Firefox
		"Strict-Transport-Secrutiy": "max-age=5184000",
		"X-Frame-Options": "DENY",
		"X-Content-Type-Options": "nosniff"
	});
	next();
});

		/*
		 * CONTENT SECURITY POLICY
		 * (BEST NOT TO CHANGE THIS)
		 *
		 * IFRAME SOURCE
		 * NONE - iframes are not used in PulseRoot.
		 *
		 * SCRIPT SOURCE
		 * SELF - load in scripts on the server
		 * UNSAFE-INLINE - "unsafe" inline script code
		 * CODE.JQUERY.COM - load in jQuery
		 *
		 * STYLE SOURCE
		 * SELF - load in css on the server
		 * UNSAFE-INLINE - "unsafe" inline style code
		 * FONTS.GOOGLEAPIS.COM - load in Google Fonts
		 * USE.FONTAWESOME.COM - load in FontAwesome icons
		 *
		 * IMG SOURCE
		 * SELF - load in images on the server
		 * CDN.DISCORDAPP.COM - load in Discord attachments and avatars
		 * PBS.TWIMG.COM - load in Twitter avatars
		 *
		 * FONT SOURCE
		 * SELF - self
		 * FONTS.GSTATIC.COM - load in Google Fonts
		 * USE.FONTAWESOME.COM - load in FontAwesome font-face
		 * DATA: - data
		 *
		 * DEFAULT (FALLBACK) SOURCE
		 * SELF - if it's on the server, it's safe
		 */
		
//This is the "active" ban check - it checks to see if the user is banned on every navigation.
//Effecient? Probably not. Reliable? Also probably not. But it works.
app.use(function(req, res, next) {
	if(!req.session.userinfo) {
		next();
	} else {
		sql.get('SELECT * FROM users WHERE username = $uName', [$uName = req.session.userinfo.username])
		.then(user => {
			if(user.restrictions === 'banned') {
				sql.run('UPDATE users SET ip = $ipa WHERE username = $uName', [$ipa = req.ip, $uName = req.session.userinfo.username])
				.then(() => {
					req.session.destroy();
					res.redirect('/');
				});
				/*
				 * PulseRoot values security and privacy.
				 * That being said, the IP Address is stored if a user is banned.
				 * ONLY if they're banned.
				 * This is so the IP can be used to:
				 * * Disable signups for this user
				 * * Disable access to global chat
				 * It's also used by admins for IP Banning.
				 */
			} else {
				next();
			}
		});
	}
});

// This prevents banned users from accessing global chat.
app.use('/gc', function(req, res, next) {
	sql.get('SELECT restrictions, ip FROM users WHERE ip = $ipa', [$ipa = req.ip])
	.then(request => {
		if(!request) {
			next();
		} else if(request.restrictions === 'banned') {
			res.redirect('/?userIsBanned'); // Simple: redirect them to the homepage.
			// The ?userIsBanned allows the user to know they can't access the chat because they're banned.
		} else {
			next();
		}
	});
});

// Disable signups for banned users
app.use('/signup', function(req, res, next) {
	sql.get('SELECT restrictions, ip FROM users WHERE ip = $ipa', [$ipa = req.ip])
	.then(request => {
		if(!request) {
			next();
		} else if(request.restrictions === 'banned') {
			res.render(__dirname + '/pages/signup.pug', {message: 'Your IP is banned from PulseRoot. Please contact an administrator for an appeal. https://www.pulseroot.ga/contact.html'});
			return;
		} else {
			next();
		}
	});
});

app.set("view engine", "pug");
app.set("trust proxy", true);
app.set('x-powered-by', false); //Get rid of the X-Powered-By header

http.listen(8080, function() {
	console.log("PulseRoot running on port 8080."); //uwu
});

//Some stuff used later in commands
const kaomoji = '【=◈︿◈=】';
const validHex = /^#[0-9A-F]{6}$/i;
const white = '#ffffff';

/*
 * GET Requests
 * These are the main course
 * The primetime
 * The Thanksgiving dinner
 * Okay enough with the useless comparisons.
 * Feel free to play around with these, have some fun.
 */

app.get("/", function(req, res) {
	if(!req.session.userinfo) var user = undefined;
	if(req.session.userinfo) var user = req.session.userinfo;
	res.render(__dirname + '/pages/index.pug', {user: user});
});

app.get("/index.html", function(req, res) {
	res.redirect("/");
});

app.get("/pref", function(req, res) {
	res.redirect("/preferences");
});

app.get("/preferences", function(req, res) {
	if(!req.session.userinfo) {
		res.redirect("/");
	} else {
		res.render(__dirname + "/pages/preferences.pug", {user: req.session.userinfo});
	}
});

app.get("/coffee", function(req, res) {
	if(!req.session.userinfo) {
		res.redirect("/");
	} else {
		sql.get("SELECT coffee FROM global").then(coffeeStatus => {
			res.render(__dirname + "/pages/coffee.pug", {userinfo: req.session.userinfo, coffee: coffeeStatus});
		});
	}
});

app.get("/signup", function(req, res) {
	res.render(__dirname + "/pages/signup.pug");
});

app.get("/profile", function(req, res) {
	if(!req.session.userinfo) {
		res.redirect("/login");
	} else {
		if(req.session.discordInfo) var discordInfo = req.session.discordInfo.username + '#' + req.session.discordInfo.discriminator;
		if(req.session.twitterInfo) var twitterTag = req.session.twitterInfo.tag;
		if(!req.session.userinfo.namecolor) var namecolor = '#ffffff';
		if(req.session.userinfo.namecolor) var namecolor = req.session.userinfo.namecolor;
		res.render(__dirname + "/pages/profile.pug", {userinfo: req.session.userinfo, user: req.session.userinfo, twitterInfo: twitterTag, discordInfo: discordInfo, namecolor: namecolor});
	}
});

app.get("/profile/settings", function(req, res) {
	if(!req.session.userinfo) {
		res.redirect("/login");
	} else {
		sql.get('SELECT * FROM users WHERE username = $uName', [$uName = req.session.userinfo.username])
		.then(info => {
			res.render(__dirname + "/pages/profile_settings.pug", {userinfo: req.session.userinfo, discordInfo: req.session.discordInfo, twitterInfo: req.session.twitterInfo, faInfo: info.faSecret});
		}, () => {
			//Fallback to session info
			res.render(__dirname + "/pages/profile_settings.pug", {userinfo: req.session.userinfo, discordInfo: req.session.discordInfo, twitterInfo: req.session.twitterInfo});
		});
	}
});

app.get("/profile/save/avatar", function(req, res) {
	if(!req.query.service || req.query.service !== 'discord' && req.query.service !== 'twitter') {
		res.redirect('/profile/settings');
	} else {
		if(req.query.service === 'discord') {
			if(!req.session.discordInfo) {
				res.redirect('/auth/discord/login');
			} else {
				var link = `https://cdn.discordapp.com/avatars/${req.session.discordInfo.id}/${req.session.discordInfo.avatar}.jpg`;
				sql.run(`UPDATE users SET avatar = $link WHERE username = $userName`, [$link=link, $userName=req.session.userinfo.username])
				.catch(err => console.error(err))
				.then(() => {
					setSession(req, res, req.session.userinfo.username);
				});
			}
		} else if(req.query.service === 'twitter') {
			if(!req.session.twitterInfo) {
				res.redirect('/profile/settings');
			} else {
				sql.run('UPDATE users SET avatar = $avLink WHERE username = $uName', [$avLink=req.session.twitterInfo.avURL, $uName=req.session.userinfo.username])
				.catch(err => console.error(err))
				.then(() => setSession(req, res, req.session.userinfo.username));
			}
		}
	}
});

app.get("/profile/:user", function(req, res) {
	const user = req.params.user;
	sql.get(`SELECT username, display, avatar, description, discordTag, twitterTag, level, namecolor FROM users WHERE username = $username`, [$username=user]).then(usr => {
		if(!usr) {
			res.status(404);
			res.send("User not found");
		} else {
			if(!usr.namecolor) var namecolor = '#ffffff';
			if(usr.namecolor) var namecolor = usr.namecolor;
			res.render(__dirname + "/pages/profile.pug", {userinfo: usr, user: req.session.userinfo, discordInfo: usr.discordTag, twitterInfo: usr.twitterTag, namecolor: namecolor});
		}
	});
});

app.get("/messaging/:user", function(req, res) {
	const user = req.params.user;
	sql.get("SELECT username, display, avatar, namecolor FROM users WHERE username = $uName", [$uName = user]).then(usr => {
		if(!usr || usr.privacy === 'nopm') {
			res.status(404);
		} else {
			res.render(__dirname + "/pages/privatemessaging.pug", {userinfo: req.session.userinfo, partner: usr});
		}
	});
});

app.get("/gc", function(req, res) {
	if(!req.session.userinfo) {
		var username = "Guest";
		var display = "Guest";
		res.render(__dirname + '/pages/globalchat.pug', { display: display, username: undefined, selfAvatar: '/defaultAvatar.jpg' });
	} else {
		if(req.session.userinfo) {
			if(!req.session.userinfo.display) var display = req.session.userinfo.username; //If the user didn't set a display name, use their username
			if(req.session.userinfo.display) var display = req.session.userinfo.display; //Use the display name if it exists
			if(!req.session.userinfo.avatar) var avatar = '/defaultAvatar.jpg';
			if(req.session.userinfo.avatar) var avatar = req.session.userinfo.avatar;
			res.render(__dirname + '/pages/globalchat.pug', { display: display, username: req.session.userinfo.username, namecolor: req.session.userinfo.namecolor, selfAvatar: avatar });
		}
	}
});

app.get("/login", function(req, res) {
	res.render(__dirname + "/pages/login.pug");
});

app.get("/logout", function(req, res) {
	req.session.destroy();
	res.redirect("/");
});

app.get("/admin/rules", function(req, res) {
	res.sendFile(__dirname + "/pages/admin_rules.html");
});

app.get('/download_data.json', function(req, res) {
	if(!req.session.userinfo) {
		res.redirect('/login');
	} else {
		sql.get('SELECT * FROM users WHERE username = $uName', [$uName = req.session.userinfo.username])
		.then(info => {
			res.set('Content-Type', 'application/json')
			res.send(info);
		}, err => {
			res.redirect('/profile/settings');
		})
	}
})

//The following is a debug page that users are free to visit, but they likely won't know what tf is going on
app.get("/debug", function(req, res) {
	res.status(200);
	res.send('<h1>USERINFO</h1><br/><pre>' + JSON.stringify(req.session.userinfo) + '</pre><br/><br/><h1>SESSION ID</h1><br/><pre>' + req.session.id + '</pre><br/><br/><h1>CSRF Token</h1><br/><pre>undefined</pre><br/><br/><h1>Webserver?</h1><br/><pre>' + req.xhr + '</pre><br/><br/><h1>REQ.IP (REQ.IPS)</h1><pre>' + `${req.ip}(${req.ips})` + '</pre>');
});
//This debug shows the user info, along with the session ID. No, it doesn't show much yet. Yes, it's useful.

/*
 * POST Requests
 * Stuff that happens behind the scenes.
 * Beautiful stuff.
 * Users don't see this... usually.
 * Feel free to mess around here if you know what to do.
 */

app.post("/signup", function(req, res) {
	if(!req.body.username || !req.body.password || req.body.readPT !== 'yes') {
		res.status(400);
		res.send("Invalid Credentials");
	} else {
		//Check if the username is already taken
		sql.get(`SELECT username FROM users WHERE username = $username`, [$username=req.body.username]).then(username => {
			if(username !== undefined) {
				//If it is, tell em to fuck off
				//No need to check display name, only username counts here
				//We'll be using the username to get user data on everything from here on out, so it's kind of important to be unique
				res.render(__dirname + "/pages/signup.pug", {message: "Username already taken."});
			} else {
				//Before we can log the user to the database, we need to make some precautions
				var salt = bcrypt.genSaltSync(saltRounds);
				var hash = bcrypt.hashSync(req.body.password, salt);
				sql.run("INSERT INTO users (username, password, display, description, level) VALUES (?, ?, ?, ?, ?)", [req.body.username, hash, req.body.display, null, 'user']).catch(error => {
					res.render(__dirname + "/pages/signup.pug", {message: "Error 500"});
					console.error(error);
				}).then(() => {
					setSession(req, res, req.body.username);
				});	
			}
		});
	}
});

app.post("/profile/save/display", function(req, res) {
	if(!req.session.userinfo) {
		res.redirect('/login');
	} else if(req.body.display.length > 20 || req.body.display.length < 1) {
		res.redirect('/profile/settings?displayLengthError');
	} else {
		sql.run('UPDATE users SET display = $newDisplay WHERE username = $userName', [$newDisplay = req.body.display, $userName = req.session.userinfo.username])
		.catch(err => console.error(err))
		.then(() => {
			setSession(req, res, req.session.userinfo.username)
		});
	}
});

app.post("/profile/save/password", function(req, res) {
	if(!req.session.userinfo) {
		res.redirect('/login');
	} else if(!req.body.currentPass || !req.body.newPass) {
		res.redirect('/profile/settings?passNotEntered');
	} else {
		sql.get('SELECT username, password FROM users WHERE username = $uName', [$uName = req.session.userinfo.username])
		.catch(err => res.redirect('/profile/settings?unknownError'))
		.then(user => {
			var guess = bcrypt.compareSync(req.body.currentPass, user.password);
			if(guess !== true) {
				res.render(__dirname + '/pages/profile_settings.pug', {userinfo: req.session.userinfo, discordInfo: req.session.discordInfo, messagePass: 'Incorrect password entered'});
			} else {
				var salt = bcrypt.genSaltSync(saltRounds);
				var hashedPass = bcrypt.hashSync(req.body.newPass, salt);
				sql.run('UPDATE users SET password = $newPassword WHERE username = $uName', [$newPassword = hashedPass, $uName = req.session.userinfo.username])
				.catch(err => console.error(err))
				.then(() => res.redirect('/profile/settings'));
			}
		});
	}
});

app.post("/profile/save/desc", function(req, res) {
	if(!req.session.userinfo) {
		res.redirect("/login");
	} else if(!req.query.service || !req.query.service === 'twitter' || !req.session.twitterInfo) {
		res.redirect("/profile/settings")
	} else {
		sql.run('UPDATE users SET description = $twDesc WHERE username = $uName', [$twDesc=req.session.twitterInfo.desc, $uName=req.session.userinfo.username])
		.catch(err => console.error(err))
		.then(() => setSession(req, res, req.session.userinfo.username))
	}
});

app.post("/profile/save/color", function(req, res) {
	if(!req.session.userinfo) {
		res.redirect('/login');
	} else if(!req.body.namecolor || validHex.test(`${req.body.namecolor}`) !== true) {
		res.redirect('/profile/settings?invalidHex');
	} else {
		sql.run('UPDATE users SET namecolor = $color WHERE username = $uName', [$color=req.body.namecolor, $uName=req.session.userinfo.username])
		.catch(err => console.error(err))
		.then(() => setSession(req, res, req.session.userinfo.username));
	}
});

app.post("/login", function(req, res) {
	if(!req.body.username || !req.body.password) {
		res.status(400);
		res.send('Missing Credentials');
	} else {
		sql.get(`SELECT * FROM users WHERE username = $username`, [$username=req.body.username]).then(userinfo => {
			if(!userinfo) {
				res.render(__dirname + "/pages/login.pug", {message: "This user does not exist."});
			} else if(userinfo.restrictions === 'banned') {
				res.render(__dirname + "/pages/login.pug", {message: "This user is banned. Please contact an administrator for repeal."});
			} else {
				var guess = bcrypt.compareSync(req.body.password, userinfo.password);
				if(guess === false) {
					res.render(__dirname + "/pages/login.pug", {message: "Incorrect password"});
				} else if(userinfo.faSecret) {
					res.render(__dirname + '/pages/2fa_login.pug', {username: req.body.username});
				} else {
					setSession(req, res, userinfo.username);
				}
			}
		});
	}
});

//From here on out, things get... complicated.
//Knock knock, it's socket.io!

var users = {};

io.use(sharedsession(session, {
    autoSave:true
}));

io.on('connection', function(socket) {
	
	if(socket.handshake.session.userinfo) {
		users[socket.handshake.session.userinfo.username] = socket.id;
	}

	socket.on('serverPing', function(data) {
		socket.emit('serverResult', 'Server Is Up');
		if(data.test === true && data.client === 'desktop') {
			analytics.track({
				anonymousId: uuid(),
				event: 'Connected to Chat',
				properties:{
					chatRoom: data.chatRoom,
					operatingSystem: data.os
				}
			});
		}
	});
	
	//Private messaging
	socket.on('pm', function(msg, username, display, namecolor, partnerName, eteeKey) {
		var date = new Date();
		date.setTime(Date.now());
		var dateHour = date.getHours().toString();
		if(dateHour.length === 1) var dateHour = '0' + dateHour
		var dateMinute = date.getMinutes().toString();
		if(dateMinute.length === 1) var dateMinute = '0' + dateMinute
		var date = `${dateHour}:${dateMinute}`
		const socid = users[partnerName];
		
		sendPrivateMessage(msg, username, white, io, date, display, namecolor, '', socid, eteeKey, socket);
		return;
	});
	
	//Global chat
	socket.on('chat message', function(msg, username, display, namecolor, avatar) {
		if(msg == '') return;
		var date = new Date();
		date.setTime(Date.now());
		var dateHour = date.getHours().toString();
		if(dateHour.length === 1) var dateHour = '0' + dateHour
		var dateMinute = date.getMinutes().toString();
		if(dateMinute.length === 1) var dateMinute = '0' + dateMinute
		var date = `${dateHour}:${dateMinute}`

		//Command check
		if(!namecolor) var namecolor = '#ffffff'
		if(msg.startsWith('!!color ')) {
			var color = msg.substring(8, 15);
			if (validHex.test(color) == true) {
				var msg = msg.substring(16);
				sendMessage(msg, username, color, io, date, display, namecolor);
			} else {
				sendMessage(msg, username, white, io, date, display, namecolor);
			}
		} else if(msg.startsWith('!!porter ')) {
			var msg = msg.substring(9);
			sendMessage(msg + kaomoji, username, white, io, date, display, namecolor);
		} else if(msg.startsWith('!!discord')) {
			var msg = 'Check out the official Discord [here](https://discord.gg/uxvRsMR)!'; //If you're reading this, come say hi to me on Discord!
			sendMessage(msg, 'PulseRoot', white, io, date, display, namecolor);
		} else if(msg.startsWith('!!report')) {
			var report = msg.substring(9);
			callWebhook(config.reportHookURL, report);
		} else if(msg.startsWith('!!request')) {
			var feature = msg.substring(10);
			callWebhook(config.featureHookURL, feature);
		} else {
			sendMessage(msg, username, white, io, date, display, namecolor);
		}
	});
});

app.use((err, req, res, next) => {
  switch (err.message) {
    case 'NoCodeProvided':
      return res.status(400).send({
        status: 'ERROR',
        error: err.message,
      });
    default:
      return res.status(500).send({
        status: 'ERROR',
        error: err.message,
      });
  }
});

app.use(function(req, res) {
	res.status(404);
	res.render(__dirname + '/pages/404.pug', {userinfo: req.session.userinfo});
});

app.use(function(err, req, res, next) {
	if(err.status !== 403) return next();
	res.render(__dirname + '/pages/403.pug', {userinfo: req.session.userinfo});
});
