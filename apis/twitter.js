const express = require('express');
const fetch = require('node-fetch');
const btoa = require('btoa');
const { catchAsync } = require('../utils');
const sql = require('sqlite');
sql.open('./database/db.sqlite');
const bodyParser = require("body-parser");

const router = express.Router();

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({extended: true}));

var twitterKey = process.env.TW_CONSUMER_KEY
var twitterSecret = process.env.TW_CONSUMER_SECRET
const twitterRedirect = process.env.TW_REDIRECT_URI

//RFC-1738 Compliance
const rfcEncode = (str) => {
	return encodeURIComponent(str)
	.replace(/!/g, '%21')
	.replace(/'/g, '%27')
	.replace(/\(/g, '%28')
	.replace(/\)/g, '%29')
	.replace(/\*/g, '%2A')
}

var twitterKey = rfcEncode(twitterKey)
var twitterSecret = rfcEncode(twitterSecret)

const creds = btoa(`${twitterKey}:${twitterSecret}`)
//Since we're just getting basic user info, we can use application-only oauth here.
//Thank god, the normal docs are a mess, too

router.post('/login', catchAsync(async (req, res) => {
	if(!req.session.userinfo) {
		res.redirect('/login');
	} else if(!req.body.twitterUser) {
		res.redirect('/profile/settings')
	} else {
		const response = await fetch('https://api.twitter.com/oauth2/token',
			{
				method: 'POST',
				headers: {
					Authorization:`Basic ${creds}`,
					'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'
				},
				body: 'grant_type=client_credentials'
			});
		var json = await response.json();
		res.redirect(`/auth/twitter/collect?token=${json.access_token}&user=${req.body.twitterUser}`)
	}	
}));

router.get('/collect', catchAsync(async (req, res) => {
	if(!req.session.userinfo) {
		res.redirect('/login');
	} else if(!req.query.token || !req.query.user) {
		res.redirect('/profile/settings');
	} else {
		const accessToken = req.query.token
		const response = await fetch(`https://api.twitter.com/1.1/users/show.json?screen_name=${req.query.user}`,
			{
				method: 'GET',
				headers: {
					Authorization:`Bearer ${accessToken}`
				}
			});
		var json = await response.json();
		if(!json.screen_name) {
			res.redirect('/profile/settings')
		} else {
			const displayName = json.name
			const twitterTag = json.screen_name
			const twDesc = json.description
			var avatarURL = json.profile_image_url_https
			var avatarURL = avatarURL.slice(0, -10) + '400x400.jpg'
			const twitterInfo = {
				displayName: displayName,
				tag: twitterTag,
				desc: twDesc,
				avURL: avatarURL
			}
			req.session.twitterInfo = twitterInfo;
			sql.run('UPDATE users SET twitterTag = $tTag WHERE username = $uName', [$tTag = twitterTag, $uName = req.session.userinfo.username])
			.catch(err => console.error(err))
			.then(() => res.redirect('/profile/settings'))
		}
	}
}));

module.exports = router;