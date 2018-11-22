const express = require('express');
const fetch = require('node-fetch');
const btoa = require('btoa');
const { catchAsync } = require('../utils');
const sql = require('sqlite');
sql.open('./database/db.sqlite');

const router = express.Router();

const DISCORD_ID = process.env.PR_DISCORD_ID;
const DISCORD_SECRET = process.env.PR_DISCORD_SECRET;
const redirectDiscord = encodeURIComponent(process.env.PR_DISCORD_REDIRECT_URI);

router.get('/login', (req, res) => {
  res.redirect(`https://discordapp.com/oauth2/authorize?client_id=${DISCORD_ID}&scope=identify&response_type=code&redirect_uri=${redirectDiscord}`);
});

router.get('/callback', catchAsync(async (req, res) => {
  if (!req.query.code) throw new Error('NoCodeProvided');
  const code = req.query.code;
  const creds = btoa(`${DISCORD_ID}:${DISCORD_SECRET}`);
  const response = await fetch(`https://discordapp.com/api/oauth2/token?grant_type=authorization_code&code=${code}&redirect_uri=${redirectDiscord}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
      },
    });
  const json = await response.json();
  var token = json.access_token;
  res.redirect(`/auth/discord/collect?token=${token}`);
}));

router.get('/collect', catchAsync(async (req,res) => {
	if(!req.session.userinfo) return;
	const token = req.query.token;
	const response = await fetch('https://discordapp.com/api/users/@me',
		{
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});
	var json = await response.json();
	req.session.discordInfo = json;
	sql.run('UPDATE users SET discordTag = $dTag WHERE username = $uName', [$dTag = `${json.username}#${json.discriminator}`, $uName = req.session.userinfo.username])
	.catch(err => console.error(err))
	.then(() => res.redirect('/profile/settings'));
}));

module.exports = router;