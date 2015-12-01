var ngrok = require('ngrok')
  , Promise = require('promise')
  , Slack = require('slack-node')
  , winston = require('winston')
  , config	= require('./config.js')
  , library = require('./library.js')
  , Player = require('./player.js')
  , pouch = require('./pouch.js');

module.exports = new PlayerSlack();

function PlayerSlack(){
	var _this = this;

	_this.commands = [
		{
			trigger:/skip/,
			usage:'skip',
			action:function(user,data){
				var player = Player.defaultPlayer();

				return player.skipTrack(user)
					.then(function(tracks){
						return Promise.resolve('You\'ve skipped ' + tracks.skipped.title + ' by ' + tracks.skipped.artist + '\n' + 
							tracks.current.title + ' by ' + tracks.current.artist + ' is now playing.');
					});
			}
		},
		{
			trigger:/info/,
			usage:'info',
			action:function(user,data){
				var player = Player.defaultPlayer();

				return library.getSong(player.playlist[0])
					.then(function(song){
						return Promise.resolve(song.title + ' by ' + song.artist + ' is currently playing.');
					})
			}
		},
		{
			trigger:/rate ([1-5])/,
			usage:'rate [1-5]',
			action:function(user,data,match){
				var player = Player.defaultPlayer(),
					rating = match[1];

				return player.rateTrack(user,player.playlist[0],rating)
					.then(function(song){
						return Promise.resolve('You rated ' + song.title + ' by ' + song.artist + ' at ' + rating + ' stars.\n'
							+ 'This places the track at ' + song.rating  + 'stars, overall.');
					})
			}
		}
	];

	_this.setup = function(app){

		_this.app = app;

		return _this.ngrockConnect()
			.then(function(url){
				_this.setupSlack();
				_this.setupSlackCommands();
				return Promise.resolve();
			});
	}

	// Setup our ngrok tunnel to recieve commands
	_this.ngrockConnect = function(){
		var ngrokConnect = Promise.denodeify(ngrok.connect);

		return ngrokConnect({
				authtoken: config.ngrokToken,
				subdomain: config.ngrokSubdomain,
				port: config.port
			});
	}

	_this.setupSlack = function(){
		_this.slack = new Slack(config.slackAPIToken);
		// _this.slack.setWebHook(config.slackWebhook);

		// _this.slack.webhook({

		// });
		pouch
			.setupIndex(pouch.users,'slackIDs',function(doc){
				if(doc.slackID) emit(doc.slackID);
			},config.validate)
	}

	_this.setupSlackCommands = function(){
		_this.app.post('/slack',function(req,res) {

			var data = req.body;

			// Make sure this is the correct token
			if(data.token != config.slackCommandToken){
				res.send('Invalid Token');
				return;
			}

			// Get the user associated with this request
			_this.getSlackUser(data.user_id)
				.then(function(user){
					var currentCommand,currentMatch;

					_this.commands.forEach(function(command) {
						var match = data.text.match(command.trigger);
						if(match){
							currentCommand = command;
							currentMatch = match;
							return false;
						}
					});

					if(currentCommand)
						return currentCommand.action(user,data,currentMatch);

					throw new Error('Invalid Action. Available actions are: [' + _this.availableActions().join('|') + ']\n Usage: /music [action]');
				})
				.then(function(response){
					res.send(response);
				})
				.catch(function(error){
					error.outputToLog();
					res.send(error.message);
				});
		});
	}

	_this.availableActions = function(){
		var actions = [];

		_this.commands.forEach(function(command) {
			actions.push(command.usage);			
		});

		return actions;
	}

	_this.getSlackUser = function(slackID){

		return pouch.users.query('slackIDs', {
				key:slackID, 
				include_docs: true
			})
			.then(function (result) {

				if(result.total_rows > 0){
					return Promise.resolve(result.rows[0].doc);
				}else{
					var api = Promise.denodeify(_this.slack.api);
					return api('users.info',{ user:slackID })
						.then(function(response){
							return pouch.getUser(response.user.profile.email.replace(/@.*/,''));
						})
						.then(function(user){
							user.slackID = slackID;
							return pouch.users.put(user);
						})
						.then(function(user){
							return pouch.getUser(user._id);
						});
				}
			})
	}
}