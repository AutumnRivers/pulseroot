const otp = require('otplib');
const qr = require('qrcode');
const crypto = require('crypto');

const Express = require('express');
const router = Express.Router();
const path = require('path');
const bodyParser = require("body-parser");
const sql = require('sqlite');
sql.open('./database/db.sqlite');

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({extended: true}));

function encryptAES(text){
    var cipher = crypto.createCipher('aes-256-ctr', process.env.AES_SECRET);
    var crypted = cipher.update(text, 'utf8', 'hex');
    crypted += cipher.final('hex');
    return crypted;
}

function decryptAES(text){
    var decipher = crypto.createDecipher('aes-256-ctr', process.env.AES_SECRET);
    var decrypted = decipher.update(text, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

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

router.post('/', function(req, res) {
    if(req.session.userinfo) {
        res.status(400);
        res.send("You don't need to do that.");
    } else {
        if(!req.body.token || !req.body.username) {
            res.status(400);
            res.send('Missing Credentials');
        } else {
            sql.get('SELECT username, faSecret FROM users WHERE username = $uName', [$uName = req.body.username])
            .then(faInfo => {
                const decryptedSecret = decryptAES(faInfo.faSecret);
                const tokenIsValid = otp.authenticator.check(req.body.token, decryptedSecret);
                console.log(req.body.username + ' ' + tokenIsValid);
                if(!tokenIsValid) res.render(path.join(__dirname, "../pages/2fa_login.pug"), {username: req.body.username, message: 'Invalid Token'});
                if(tokenIsValid) setSession(req, res, req.body.username);
            })
        }
    }
});

router.use(function(req, res, next) {
    if(!req.session.userinfo) {
        res.redirect('/login', {"message": "You need to be logged in to do that."});
    } else {
        next();
    }
});

router.get('/setup', function(req, res) {
    sql.get('SELECT username, display, faSecret FROM users WHERE username = $uName', [$uName = req.session.userinfo.username]).then(user => {
        if(!user.faSecret) var faBoolean = false;
        if(user.faSecret) var faBoolean = true;
        res.render(path.join(__dirname, "../pages/2fa_setup.pug"), {userinfo: req.session.userinfo, faEnabled: faBoolean});
    })
    .catch(e => {
        console.error(e);
        res.status(500);
        res.send('Internal Server Error');
    });
});

router.post('/setup', function(req, res) {
    if((!req.body.consent && !req.body.gen) && (req.body.consent && !req.body.secret) || (req.body.consent && !req.body.token)) {
        res.status(400);
        res.send('Missing Credentials');
    } else if(!req.body.consent && req.body.gen === 'please') {
        const otpSecret = otp.authenticator.generateSecret();
        const otpImage = otp.authenticator.keyuri(req.session.userinfo.username, 'PulseRoot', otpSecret);
        const secretImageURL = qr.toDataURL(otpImage, function(err, url) {
            if(err) res.status(500).send('Internal Server Error');
            if(!err) res.render(path.join(__dirname, "../pages/2fa_setup.pug"), {userinfo: req.session.userinfo, secret: otpSecret, secretImage: url});
        });
    } else if(!req.body.gen && req.body.consent === 'yes' && req.body.secret && req.body.token) {
        const tokenIsValid = otp.authenticator.check(req.body.token, req.body.secret);
        if(!tokenIsValid) {
            res.render(path.join(__dirname, "../pages/2fa_setup.pug"), {userinfo: req.session.userinfo, message: 'Incorrect Token'});
        } else {
            const encryptedSecret = encryptAES(req.body.secret);
            console.log(encryptedSecret);
            sql.run('UPDATE users SET faSecret = $secret WHERE username = $uName', [$secret = encryptedSecret, $uName = req.session.userinfo.username])
            .then(() => {
                res.redirect('/2fa/setup');
            }, error => {
                console.error(error);
                res.status(500);
                res.send('Internal Server Error');
            });
        }
    } else {
        res.status(400);
        res.send('Malformed Request - Unknown Error');
    }
});

router.post('/disable', function(req, res) {
    if(req.body.consent !== 'yes') {
        res.status(400);
        res.send('Consent Not Given - Missing Credentials');
    } else {
        sql.run('UPDATE users SET faSecret = NULL WHERE username = $uName', [$uName = req.session.userinfo.username]).then(() => {
            res.redirect('/2fa/setup');
        }, error => {
            console.error(error);
            res.status(500);
            res.send('Internal Server Error');
        });
    }
});

module.exports = router;