const express = require("express"); //Webserver
const app = express();
const config = require("./config.json"); //Configuration file

//Actual dependencies
const bcrypt = require("bcrypt"); //Encryption
const saltRounds = 10;
const sql = require("sqlite"); //Database
sql.open("./database/db.sqlite");
const md = require("markdown").markdown; //Parsing markdown
var request = require("node-fetch"); //Used for posting to webhook later on

const callWebhook = (url, content) => {
	request(url, {
        	method: 'post',
		body: JSON.stringify({ content: content }),
		headers: { 'Content-Type': 'application/json' }
	})
};

//These are the middleware.
//We need them, please please please please please please please please please please please please please please do not touch them under any circumstances
const session = require("express-session");
var SQLiteStore = require('connect-sqlite3')(session);
app.use(session({
	store: new SQLiteStore,
	secret: process.env.SESSION_SECRET,
	resave: false,
	saveUninitialized: true,
	cookie: {maxAge: 172800000, secure: false, path: '/', httpOnly: false},
	name: "pulseroot"
}));
const bodyParser = require("body-parser");
const pug = require("pug"); //Rendering dynamic HTML

const setSession = (req, res, username) => {
	sql.get(`SELECT * FROM users WHERE username = $username`, [$username=username]).then(userinfo => {
		var dInfo = req.session.discordInfo
		req.session.regenerate(function (err) {
			req.session.userinfo = userinfo;
			req.session.discordInfo = dInfo;
			req.session.twitterInfo = req.session.twitterInfo;
			res.redirect("/profile");
		});
	});
}

app.use('/auth/discord', require('./apis/discord'));
app.use('/auth/twitter', require('./apis/twitter'));
/*
 * THIRD-PARTY AUTHENTICATION URLs
 * Discord: app.url.here/auth/discord
 * Twitter: app.url.here/auth/twitter
 */

//Set important headers
app.use(function(req, res, next) {
	res.set({
		"Content-Security-Policy": "frame-src 'none'; script-src 'unsafe-inline' 'self' https://code.jquery.com/ https://cdnjs.cloudflare.com/; style-src 'unsafe-eval' 'unsafe-inline' 'self' https://fonts.googleapis.com/ https://use.fontawesome.com/ https://cdnjs.cloudflare.com/ https://neet.host/; img-src 'self' data: https://cdn.discordapp.com/ https://pbs.twimg.com/; font-src 'self' https://use.fontawesome.com/ https://fonts.gstatic.com/ data:; default-src 'self';",
		"X-XSS-Protection": "1", //Cross-site attack fallback protection - this is useless in Firefox
		"Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
		"X-Frame-Options": "DENY",
		"X-Content-Type-Options": "nosniff"
	});
	next();
});

var http = require('http').Server(app); //HTTP server for socket.io
const io = require('socket.io')(http); //Take a guess

http.listen(8080, function() {
	console.log("Listening on port 8080! uwu"); //uwu
});

//Ready for the fuckton of middleware?
//Cause you're getting a fuckton of middleware.
app.set("view engine", "pug");
app.use(express.static('static'));
app.use(express.static('images'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

//Some stuff used later in commands
const kaomoji = '【=◈︿◈=】';
const validHex = /^#[0-9A-F]{6}$/i
const white = '#ffffff'

app.get("/", function(req, res) {
	if(!req.session.userinfo) var user = undefined
	if(req.session.userinfo) var user = req.session.userinfo
	res.render(__dirname + '/pages/index.pug', {user: user});
})

app.get("/index.html", function(req, res) {
	res.redirect("/");
});


//Do people even read comments in code tbh

app.get("/signup", function(req, res) {
	res.render(__dirname + "/pages/signup.pug");
});

//Actually handling the signup
app.post("/signup", function(req, res) {
	if(!req.body.username || !req.body.password) {
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
				}).then(user => {
					setSession(req, res, req.body.username);
				});	
			}
		});
	}
});

app.get("/profile", function(req, res) {
	if(!req.session.userinfo) {
		res.redirect("/login");
	} else {
		if(req.session.discordInfo) var discordInfo = req.session.discordInfo.username + '#' + req.session.discordInfo.discriminator
		if(req.session.twitterInfo) var twitterTag = req.session.twitterInfo.tag
		if(!req.session.userinfo.avatar) var avatar = './images/defaultAvatar.jpg'
		if(!req.session.userinfo.namecolor) var namecolor = '#ffffff'
		if(req.session.userinfo.namecolor) var namecolor = req.session.userinfo.namecolor
		
		res.render(__dirname + "/pages/profile.pug", {userinfo: req.session.userinfo, user: req.session.userinfo.username, twitterInfo: twitterTag, discordInfo: discordInfo, namecolor: namecolor});
	}
});

app.get("/profile/settings", function(req, res) {
	if(!req.session.userinfo) {
		res.redirect("/login");
	} else {
		res.render(__dirname + "/pages/profile_settings.pug", {userinfo: req.session.userinfo, discordInfo: req.session.discordInfo, twitterInfo: req.session.twitterInfo});
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
				var link = `https://cdn.discordapp.com/avatars/${req.session.discordInfo.id}/${req.session.discordInfo.avatar}.jpg`
				sql.run(`UPDATE users SET avatar = '${link}' WHERE username = $userName`, [$userName=req.session.userinfo.username])
				.catch(err => console.error(err))
				.then(data => {
					setSession(req, res, req.session.userinfo.username)
				})
			}
		} else if(req.query.service === 'twitter') {
			if(!req.session.twitterInfo) {
				res.redirect('/auth/twitter/login');
			} else {
				sql.run('UPDATE users SET avatar = $avLink WHERE username = $uName', [$avLink=req.session.twitterInfo.avURL, $uName=req.session.userinfo.username])
				.catch(err => console.error(err))
				.then(data => setSession(req, res, req.session.userinfo.username))
			}
		}
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
		.then(() => setSession(req, res, req.session.userinfo.username))
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
		res.redirect('/profile/settings?invalidHex')
	} else {
		sql.run('UPDATE users SET namecolor = $color WHERE username = $uName', [$color=req.body.namecolor, $uName=req.session.userinfo.username])
		.catch(err => console.error(err))
		.then(() => setSession(req, res, req.session.userinfo.username));
	}
});

app.get("/profile/:user", function(req, res) {
	const user = req.params.user;
	sql.get(`SELECT username, display, avatar, description, discordTag, twitterTag, level, namecolor FROM users WHERE username = $username`, [$username=user]).then(usr => {
		if(!usr) {
			res.status(404);
			res.send("User not found");
		} else {
			if(!usr.namecolor) var namecolor = '#ffffff'
			if(usr.namecolor) var namecolor = usr.namecolor
			res.render(__dirname + "/pages/profile.pug", {userinfo: usr, user: req.session.username, discordInfo: usr.discordTag, twitterInfo: usr.twitterTag, namecolor: namecolor});
		}
	});
});

app.get("/messaging/:user", function(req, res) {
	//Private messaging takes place here
	const user = req.params.user;
	//TODO: Private messaging stuff
});

//From here on out, things get... complicated.
//Knock knock, it's socket.io!
io.on('connection', function(socket) {
	socket.on('disconnect', function() {
	});
	socket.on('chat message', function(msg, username, display, namecolor) {
		if(msg == '') return;
		//Command check
		var date = new Date();
		date.setTime(Date.now());
		var dateHour = date.getHours().toString();
		if(dateHour.length === 1) var dateHour = '0' + dateHour
		var dateMinute = date.getMinutes().toString();
		if(dateMinute.length === 1) var dateMinute = '0' + dateMinute
		var date = `${dateHour}:${dateMinute}`
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

const sendMessage = (msg, username, color, io, date, display, namecolor) => {
	var msg = md.toHTML(msg);
	io.emit('chat message', {msg, username, color, date, display, namecolor});
}

app.get("/gc", function(req, res) {
	if(!req.session.userinfo) {
		var display = "Guest";
		res.render(__dirname + '/pages/globalchat.pug', { display: display, username: undefined });
	} else {
		if(req.session.userinfo) {
			if(!req.session.userinfo.display) var display = req.session.userinfo.username; //If the user didn't set a display name, use their username
			if(req.session.userinfo.display) var display = req.session.userinfo.display; //Use the display name if it exists
			res.render(__dirname + '/pages/globalchat.pug', { display: display, username: req.session.userinfo.username, namecolor: req.session.userinfo.namecolor });
		}
	}
});

app.get("/login", function(req, res) {
	res.render(__dirname + "/pages/login.pug");
});

app.post("/login", function(req, res) {
	sql.get(`SELECT * FROM users WHERE username = $username`, [$username=req.body.username]).then(userinfo => {
		if(!userinfo) {
			res.render(__dirname + "/pages/login.pug", {message: "This user does not exist."});
		} else {
			var guess = bcrypt.compareSync(req.body.password, userinfo.password);
			if(guess === false) {
				res.render(__dirname + "/pages/login.pug", {message: "Incorrect password"});
			} else {
				setSession(req, res, userinfo.username)
			}
		}
	});
});

app.get("/logout", function(req, res) {
	req.session.destroy();
	res.redirect("/");
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
