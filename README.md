# PulseRoot
## Secure, fast, and reliable web chat application.

![](https://cdn.discordapp.com/attachments/509537742234058782/515007336864153623/unknown.png)

----

PulseRoot is a chat application that focuses on reliability, speed, and most of all... **security**.  
It allows you to enter the global chat as either a guest, or gives you the ability to make an account.

With an account, you can:
* Private message other users
* Have your own profile
* Integrate with other services (Twitter, Discord, Google, etc.)

### Security
PulseRoot values security. Here's some steps we've taken to ensure you get the best and most secure experience out of our website:

#### End-To-End Encryption
Yes, you heard that right! End-to-end encryption... for private messages, that is. Even the server can't see what you sent, it's just garbled text. Why end-to-end encryption when there's already HTTPS?
* We know you don't want us looking in. That's why we can't see what you send.
* HTTPS is not a silver bullet.

#### IndexedDB Usage
Yes, your messages are saved. But not on a server. In your *own browser*! IndexedDB is a client-side database. So, no, we still can't see your private messages.  
[Read MDN for more info](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB).

---

### Running your own PulseRoot
Running your own version of PulseRoot is fairly easy.  
That being said, there are steps you will have to take:

#### Cloning and Installing
Clone the repo: `git clone https://www.github.com/diamondgrid/pulseroot-web` 
In the directory with `package.json`, run `npm install`.

#### Setting up files and variables
* Rename `config.json_example` to `config.json`
* Rename `example.sqlite` to `db.sqlite`
* Change the values in `config.json` to Discord Webhook URLs... or don't. It's optional, after all.
* Go to your Environment Variables configuration.
* Add a value for `SESSION_SECRET`. This is used for Express sessions.
* Add values for `PR_DISCORD_ID`, `PR_DISCORD_SECRET`, and `PR_DISCORD_REDIRECT_URI` for Discord integration
* Add values for `TW_CONSUMER_KEY`, `TW_CONSUMER_SECRET`, and `TW_REDIRECT_URI`
* For information on Discord integration, read [Discord's API docs](https://discordapp.com/developers/docs/intro)
* For information on Twitter integration, read [Twitter's API docs](https://developer.twitter.com/en/docs/basics/authentication/overview/application-only)

#### Running
In the root directory, run `npm start`.  
In addition, you can use `localtunnel` to host your own server: `lt --port 8080`
Or! If you're feeling fancy, install `npm-run-all` along with localtunnel, then run `npm run server`. It'll do both of those above things for you!  
Congrats, you're now running your own version of PulseRoot!

### Socket.io
PulseRoot utilizes socket.io for messaging.  
Read more about socket.io [here](https://socket.io).
