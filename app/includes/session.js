var player = require('./player.js')
  , library = require('./library.js')
  , winston = require('winston')
  , util = require('util');

module.exports.init = function(sessionSockets,users){
	
	// Our Socket Calls
	sessionSockets.on('connection', function (err, socket, session) {
		// We need a session
		if(session == null){
			socket.emit('refreshRequired');
			return;
		}

		// Check for previous login
		users.connected(session,socket);
		
		// User login/logout
		socket.on('login',function(user,pass){
			users.authenticate(user,pass,session,socket);
		});

		socket.on('logout', function(){
			users.logout(session,socket);
		});

		// Disconnect
		socket.on('disconnect', function(){
			users.disconnected(session,socket);
			player.removeListener('statusUpdate',playerUpdate);
			users.removeListener('statusUpdate',usersUpdate);
		});

		// Player notifications
		var playerUpdate = function(status,args){
			if(! users.loggedIn(session)) return;
			socket.emit(status,args);
		}
		player.on('statusUpdate',playerUpdate);

		// Users notifications
		var usersUpdate = function(status,args){
			if(! users.loggedIn(session)) return;
			socket.emit(status,args);
		}
		users.on('statusUpdate',usersUpdate);

		// Playlist Interactions
		socket.on('skipTrack',function(){
			if(! users.loggedIn(session)) return;
			player.skipTrack(session.userObject);
		});

		socket.on('rateTrack',function(id,rating){
			if(! users.loggedIn(session)) return;
			player.rateTrack(session.userObject,id,rating);
		});

		socket.on('insertTracks',function(index,ids){
			if(! users.loggedIn(session)) return;
			player.insertTracks(session.userObject,index,ids);
		});

		socket.on('moveTracks',function(index,ids){
			if(! users.loggedIn(session)) return;
			player.moveTracks(session.userObject,index,ids);
		});

		socket.on('removeTracks',function(ids){
			if(! users.loggedIn(session)) return;
			player.removeTracks(session.userObject,ids);
		});

		socket.on('addChannel',function(name){
			if(! users.loggedIn(session)) return;
			player.addChannel(session.userObject,name);
		});

		socket.on('setChannel',function(id){
			if(! users.loggedIn(session)) return;
			player.setChannel(session.userObject,id);
		});

		socket.on('deleteSongs',function(ids){
			if(! users.loggedIn(session)) return;
			player.deleteSongs(session.userObject,ids);
		});

		socket.on('requestSettings',function(){
			if(! users.loggedIn(session)) return;
			users.sendUserSettings(socket);
		});

		socket.on('requestLogs',function(){
			if(! users.loggedIn(session)) return;

			var options = {
				from: new Date - 1 * 60 * 60 * 1000,
				until: new Date,
				limit: 5000,
				start: 0,
				order: 'desc',
				fields: ['message','timestamp']
			};

			// Find all items logged between now and 1 hour ago
			winston.query(options, function (error, results) {
				if (error) throw error;
				socket.emit('logs',{logs:results});
			});
		});

		socket.on('updateUser',function(user){
			if(! users.loggedIn(session) || ! users.isAdmin(session)){
				socket.emit('userDenied',{
					user:session.userObject,
					message:"User level does not permit updating users."
				});
				return;	
			}
			users.updateUser(user);
		});
	});
}