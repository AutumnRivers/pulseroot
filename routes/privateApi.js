const bcrypt = require("bcrypt"); //Hashing
const saltRounds = 10;
const crypto = require('crypto');
const otp = require('otplib');
const uuidv4 = require('uuid/v4');
const Analytics = require('analytics-node');
const analytics = new Analytics(process.env.SEGMENT_KEY);

const Express = require('express');
const router = Express.Router();
const path = require('path');
const bodyParser = require("body-parser");
const sql = require('sqlite');
sql.open('./database/db.sqlite');

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({extended: true}));

function decryptAES(text){
    var decipher = crypto.createDecipher('aes-256-ctr', process.env.AES_SECRET);
    var decrypted = decipher.update(text, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

const getUserData = (Username) => {
    sql.get('SELECT * FROM users WHERE username = $username', [$username = Username])
    .then(userinfo => {
        return userinfo;
    }, err => {
        const response = 'ERROR\n' + err;
        return response;
    });
}

router.use('/login', function(req, res, next) {
    if(!req.body.ApiKey || req.body.ApiKey !== process.env.PR_API_KEY) {
        res.status(403);
        res.send('Forbidden');
    } else {
        next();
    }
});

router.use('/signup', function(req, res, next) {
    if(!req.body.ApiKey || req.body.ApiKey !== process.env.PR_API_KEY) {
        res.status(403);
        res.send('Forbidden');
    } else {
        next();
    }
});

router.use('/2fa', function(req, res, next) {
    if(!req.body.ApiKey || req.body.ApiKey !== process.env.PR_API_KEY) {
        res.status(403);
        res.send('Forbidden');
    } else {
        next();
    }
});

router.post('/login', function(req, res) {
    if(!req.body.username || !req.body.password) {
        res.set('Content-Type', 'text/plain');
        res.status(400);
        res.send('MISSINGCREDENTIALS');
    } else {
        sql.get(`SELECT * FROM users WHERE username = $username`, [$username=req.body.username]).then(userinfo => {
            if(!userinfo) {
                res.set('Content-Type', 'text/plain');
                res.status(404);
                res.send('NOTEXIST');
            } else if(userinfo.restrictions === 'banned') {
                res.set('Content-Type', 'text/plain');
                res.status(403);
                res.send('USERISBANNED');
            } else {
                var guess = bcrypt.compareSync(req.body.password, userinfo.password);
                if(guess === false) {
                    res.set('Content-Type', 'text/plain');
                    res.status(401);
                    res.send('INCORRECTPASS');
                } else if(userinfo.faSecret) {
                    res.set('Content-Type', 'text/plain');
                    res.status(333);
                    res.send('2FAREQUIRED');
                    /*
                        PULSEROOT STATUS CODE 333
                               2FA Required
                        -------------------------
                        HTTP Status code 333 when
                        making a request to the
                        PulseRoot API means that
                        the requested user login
                        requires additional verif
                        ication (2FA).
                        Clients should redirect t
                        o /api/2fa with a 2fa tok
                        en provided by the user.
                    */
                } else {
                    res.set('Content-Type', 'application/json');
                    res.status(200);
                    res.send(userinfo);
                }
            }
        });
    }
});

router.post('/2fa', function(req, res) {
    if(!req.body.AuthToken || !req.body.Username) {
        res.set('Content-Type', 'text/plain');
        res.status(400);
        res.send('MISSINGCREDENTIALS');
    } else {
        sql.get('SELECT * FROM users WHERE username = $uName', [$uName = req.body.Username])
        .then(faInfo => {
            if(!faInfo.faSecret) {
                res.set('Content-Type', 'text/plain');
                res.status(486);
                res.send('NOTNEEDED');
                /*
                    PULSEROOT STATUS CODE 486
                           Not Required
                    -------------------------
                    This status codes indicat
                    es the request did not ne
                    ed to be made in the firs
                    t place. This is usually 
                    a fallback, but important
                     nonetheless.
                    Basically, this means the
                     request should never hav
                    e been made in the first
                    place.
                */
            } else {
                const decryptedSecret = decryptAES(faInfo.faSecret);
                const tokenIsValid = otp.authenticator.check(req.body.AuthToken, decryptedSecret);
                if(!tokenIsValid) {
                    res.status(400);
                    res.send('INCORRECTTOKEN');
                    return;
                } else {
                    res.status(200);
                    res.send(faInfo);
                }
            }
        })
    }
});

router.post('/signup', function(req, res) {
    if(!req.body.Username || !req.body.Password) {
        res.set('Content-Type', 'text/plain');
        res.status(400);
        res.send('MISSINGCREDENTIALS');
    } else {
        sql.get('SELECT * FROM users WHERE username = $uName', [$uName = req.body.Username])
        .then(user => {
            if(!user) {
                const key = uuidv4();
                var salt = bcrypt.genSaltSync(saltRounds);
                var hash = bcrypt.hashSync(req.body.password, salt);
                sql.run("INSERT INTO users (username, password, display, description, level, apikey) VALUES (?, ?, ?, ?, ?, ?)", [req.body.Username, hash, req.body.Display, null, 'user', key])
                .then(() => {
                    analytics.identify({
                        userId: key,
                        timestamp: new Date(Date.now()),
                        traits: {
                            username: req.body.Username,
                            display: req.body.display
                        }
                    });
                    analytics.track({
                        userId: key,
                        event: 'Signed Up',
                        properties: {
                            modified: req.body.ModifiedClient
                        }
                    });
                    res.set('Content-Type', 'application/json')
                    res.status(200);
                    res.send(getUserData(req.body.Username));
                }, err => {
                    res.set('Content-Type', 'text/plain')
                    res.status(500);
                    res.send('SQLITEERROR\n' + err);
                })
            } else {
                res.set('Content-Type', 'text/plain');
                res.status(400);
                res.send('ALREADYEXISTS');
            }
        })
    }
});

router.put('/profile/update', function(req,res) {
    if(!req.body.username || !req.body.password || !req.body.apiKey) {
        
    }
})

module.exports = router;