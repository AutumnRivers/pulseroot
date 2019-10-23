const Express = require('express');
const router = Express.Router();
const path = require('path');
const bodyParser = require("body-parser");
const sql = require('sqlite');
sql.open('./database/db.sqlite');

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({extended: true}));

/*
 * First, we make a function that does all the admin checks.
 * This'll let us block any requests that don't follow this, and apply it to every route here.
 * Gotta love routers and use(), both lifesavers.
 *
 */
router.use(function(req, res, next) {
		if(!req.session.userinfo || req.session.userinfo.level !== 'dev' && req.session.userinfo.level !== 'admin' && req.session.userinfo.username !== 'Smartie') {
			res.status(403);
			res.render(path.join(__dirname, "../pages/403.pug"), {userinfo: req.session.userinfo});
            return;
		} else {
			return next(); // They pass the test, so let them move on.
		}
});

// Now we can get to the thick of it.
// GET Requests
// Render the admin panel
router.get("/", function(req, res) {
	res.render(path.join(__dirname, "../pages/adminpanel.pug"), {userinfo: req.session.userinfo});
});

// POST Requests (there's quite a bit)
// Set restrictions on a user
router.post("/restrict", function(req, res) {
	if(!req.body.username) {
		res.redirect('/admin?404');
	} else {
		sql.get('SELECT * FROM users WHERE username = $uName', [$uName = req.body.username])
		.then(user => {
			if(!user) {
				res.render(path.join(__dirname, '../pages/adminpanel.pug'), {userinfo: req.session.userinfo, errMsgRst: 'User not found'});
				return;
			} else {
				// Array template: [markdown, commands, twitter, avatar]
				if(req.body.markdown) var md = 'enable';
				if(req.body.commands) var cmd = 'enable';
				if(req.body.twitter) var twt = 'disable';
				if(req.body.avatar) var av = 'disable';
				const arr = [md, cmd, twt, av];
				const arrString = JSON.stringify(arr); // Stringify the array so the database can hold it
				sql.run('UPDATE users SET restrictions = $rst WHERE username = $uName', [$rst = arrString, $uName = req.body.username])
				.then(() => { res.render(path.join(__dirname, '../pages/adminpanel.pug', {userinfo: req.session.userinfo, success: 'User restrictions applied'}))})
				.catch(err => { console.error(err) });
			}
		});
	}
});

// Ban a user
router.post('/ban', function(req,res) {
	if(!req.body.username) {
		res.render(path.join(__dirname, "../pages/adminpanel.pug"), {userinfo: req.session.userinfo, errMsgBan: 'User not found'});
		return;
	} else {
		sql.get('SELECT * FROM users WHERE username = $uName', [$uName = req.body.username])
		.then(user => {
			if(!user) {
				res.render(path.join(__dirname, "../pages/adminpanel.pug"), {userinfo: req.session.userinfo, errMsgBan: 'User not found'});
				return;
			} else if(user.level === 'admin' && req.session.userinfo.level === 'admin' || user.level === 'dev') {
				res.render(path.join(__dirname, "../pages/adminpanel.pug"), {userinfo: req.session.userinfo, errMsgBan: 'Unauthorized - user is equal level or higher (admin/dev) You can only ban low-level users.'});
				return;
			} else {
				// Here, we set the user restriction to be "banned"
				// This is what makes a banned user banned - technically, it IS a restriction!
				sql.run('UPDATE users SET restrictions = "banned" WHERE username = $uName', [$uName = req.body.username])
				.then(() => { res.render(path.join(__dirname, '../pages/adminpanel.pug'), {userinfo: req.session.userinfo, success: 'Successfully banned the user.'}); })
				.catch(err => { console.error(err) });
			}
		});
	}
});

// Update user's avatar
router.post('/user/avatar', function(req, res) {
	if(!req.body.username || !req.body.avatar || req.body.avatar === 'custom' && !req.body.avurl) {
		res.render(path.join(__dirname, "../pages/adminpanel.pug"), {userinfo: req.session.userinfo, errMsgStng: 'Invalid or Missing parameters'});
		return;
	} else {
		sql.get('SELECT * FROM users WHERE username = $uName', [$uName = req.body.username])
		.then(user => {
			if(!user) {
				res.render(path.join(__dirname, '../pages/adminpanel.pug'), {userinfo: req.session.userinfo, errMsgStng: 'User not found'});
				return;
			} else {
				if(req.body.avatar === 'default') {
					sql.run('UPDATE users SET avatar = "" WHERE username = $uName', [$uName = req.body.username]);
					res.render(path.join(__dirname, '../pages/adminpanel.pug'), {userinfo: req.session.userinfo, success: "Successfully updated the user\'s avatar"});
					return;
				} else if(req.body.avatar === 'custom') {
					sql.run('UPDATE users SET avatar = $link WHERE username = $uName', [$link = req.body.avurl, $uName = user.username]);
					res.render(path.join(__dirname, '../pages/adminpanel.pug'), {userinfo: req.session.userinfo, success: 'Successfully updated the user\'s avatar'});
					return;
				} else {
					res.status(400);
					res.send('Bad Request - Incorrect Body');
					return;
				}
			}
		});
	}
});

// Delete a user
router.post('/user/delete', function(req,res) {
	if(!req.body.username) {
		res.render(path.join(__dirname, '../pages/adminpanel.pug'), {userinfo: req.session.userinfo, errMsgStng: 'User not found'});
		return;
	} else {
		sql.get('SELECT * FROM users WHERE username = $uName', [$uName = req.body.username])
		.then(user => {
			if(!user) {
				res.render(path.join(__dirname, '../pages/adminpanel.pug'), {userinfo: req.session.userinfo, errMsgStng: 'User not found'});
				return;
			} else if(user.level === 'admin' && req.session.userinfo.level === 'admin' || user.level === 'dev') {
				res.render(path.join(__dirname, "../pages/adminpanel.pug"), {userinfo: req.session.userinfo, errMsgStng: 'Unauthorized - user is equal level or higher (admin/dev) You can only delete low-level users.'});
				return;
			} else {
				sql.run('DELETE FROM users WHERE username = $user', [$user=req.body.username])
				.then(() => {
					res.render(path.join(__dirname, '../pages/adminpanel.pug'), {userinfo: req.session.userinfo, success:'User successfully deleted'});
				});
			}
		});
	}
});



module.exports = router;
