const Express = require('express');
const router = Express.Router();
const bodyParser = require("body-parser");
const sql = require('sqlite');
sql.open('./database/db.sqlite');

router.use(function(req, res, next) {
	if(!req.session.userinfo || req.session.userinfo.level !== 'dev' && req.session.userinfo.username !== 'Smartie') {
		res.status(401);
		res.send('Unauthorized Request');
	} else {
		next();
	}
});
router.use(bodyParser.json());
router.use(bodyParser.urlencoded({extended: true}));

router.post("/user/status", function(req, res) {
	sql.run("UPDATE users SET level = $lvl WHERE username = $uName", [$lvl = req.body.status, $uName = req.body.username]).then(() => {
		res.redirect('/admin');
	}).catch(err => {
		console.error(err);
		res.redirect('/admin?error=' + err);
	});
});

module.exports = router;