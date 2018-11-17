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
const bodyParser = require("body-parser"); //I... don't even know honestly. But things break if I don't require it so here we are
const pug = require("pug"); //Rendering dynamic HTML

const setSession = (req, res, username) => {
	sql.get(`SELECT * FROM users WHERE username = $username`, [$username=username]).then(userinfo => {
		req.session.regenerate(function (err) {
			req.session.userinfo = userinfo;
			res.redirect("/profile");
		});
	});
}

var http = require('http').Server(app); //HTTP server for socket.io
const io = require('socket.io')(http); //Take a guess

http.listen(8080, function() {
	console.log("Listening on port 8080! uwu"); //uwu
});

//Ready for the fuckton of middleware?
//Cause you're getting a fuckton of middleware.
app.set("view engine", "pug");
app.use(express.static('static'));
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
				sql.run("INSERT INTO users (username, password, display, description, salt) VALUES (?, ?, ?, ?, ?)", [req.body.username, hash, req.body.display, '', salt]).catch(error => {
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
		res.render(__dirname + "/pages/profile.pug", {userinfo: req.session.userinfo});
	}
});

app.get("/profile/:user", function(req, res) {
	const user = req.params.user;
	sql.get(`SELECT * FROM users WHERE username = $username`, [$username=user]).then(usr => {
		if(!usr) {
			res.status(404);
			res.send("User not found");
		} else {
			res.render(__dirname + "/pages/profile.pug", {userinfo: usr});
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
	socket.on('chat message', function(msg, username) {
		if(msg == '') return;
		//Command check
		if(msg.startsWith('!!color ')) {
			var color = msg.substring(8, 15);
			if (validHex.test(color) == true) {
				var msg = msg.substring(16);
				sendMessage(msg, username, color, io);
			} else {
				sendMessage(msg, username, white, io);
			}
		} else if(msg.startsWith('!!porter ')) {
			var msg = msg.substring(9);
			sendMessage(msg + kaomoji, username, white, io);
		} else if(msg.startsWith('!!discord')) {
			var msg = 'Check out the official Discord [here](https://discord.gg/uxvRsMR)!'; //If you're reading this, come say hi to me on Discord!
			sendMessage(msg, 'PulseRoot', white, io);
		} else if(msg.startsWith('!!report')) {
			var report = msg.substring(9);
			callWebhook(config.reportHookURL, report);
		} else if(msg.startsWith('!!request')) {
			var feature = msg.substring(10);
			callWebhook(config.featureHookURL, feature);
		} else {
			sendMessage(msg, username, white, io);
		}
	});
});

const sendMessage = (msg, username, color, io) => {
	var msg = md.toHTML(msg);
	io.emit('chat message', {msg, username, color});
}

app.get("/gc", function(req, res) {
	if(!req.session.userinfo) {
		var username = "Guest";
		res.render(__dirname + '/pages/globalchat.pug', { username: username });
	} else {
		if(req.session.userinfo) {
			if(!req.session.userinfo.display) var username = req.session.userinfo.username; //If the user didn't set a display name, use their username
			if(req.session.userinfo.display) var username = req.session.userinfo.display; //Use the display name if it exists
			res.render(__dirname + '/pages/globalchat.pug', { username: username });
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
