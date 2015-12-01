// Dependancies
var config 	  = require('./config.js')
  , winston = require('winston')
  , util = require('util')
  , player = require('./player.js')
  , pouch = require('./pouch.js')
  , EventEmitter = require('events').EventEmitter
  // , db = require('./db.js')
  , users = []
  , scans = []
  , _io;

module.exports = new EventEmitter();

// User events
module.exports.on('userConnected',function(user){
	winston.info('---'+user+' connected.');
	module.exports.emit('statusUpdate','userConnected',user);
	users.push(user);
});

module.exports.on('userDisconnected',function(user){
	winston.info('---'+user.name+' disconnected.');
	module.exports.emit('statusUpdate','userDisconnected',user);
	users.splice(users.indexOf(user),1);
});

module.exports.init = function(io)
{
	_io = io;
}

// User Entry
module.exports.entered = function(office,badgeID)
{
	winston.info('---badge['+badgeID+'] was scanned at ['+office+']');

	scans.unshift({
		badge:badgeID,
		office:office,
		time:new Date()
	});

	if(scans.length > 20)
		scans.pop();

	module.exports.emit('statusUpdate','cardScans',{scans:scans});

	db.User.find({where: {badgeID:badgeID}}).success(function(user){
		if(!user) return;
		winston.info('---matched entry for ['+user.username+']');
		module.exports.emit('statusUpdate','userEntered',{
			user:user,
			office:office
		});
	});
}

// User settings
module.exports.sendUserSettings = function(socket)
{
	db.User.all().success(function(users){
		socket.emit('cardScans',{scans:scans});
		socket.emit('userSettings',{userSettings:users});
	});
}

module.exports.updateUser = function(user)
{
	userUpdates = JSON.parse(user);
	db.User.find({where: {id:userUpdates.id}}).success(function(user){
		if(!user) return;

		user.updateAttributes({
			firstName: userUpdates.firstName,
			lastName: userUpdates.lastName,
			introSong: userUpdates.introSong,
			badgeID: userUpdates.badgeID,
			level: userUpdates.level
		}).success(function(){
			winston.info('Updated user ['+user.username+']');	
		})
	});
}

// Athentication
module.exports.authenticate = function(user,pass,session,socket)
{
	user = user.replace(/@.*/,'');

	// One of our static users
	if(config.staticUsers[user] == pass){
		winston.info('static login for user:'+user);
		session.user = user;
		session.save();
		module.exports.connected(session,socket);
		return;
	}

	requestAuthentication(user,pass,function(data){
		winston.info('login attempt:'+data+' for user:'+user);

		try{
			var json = JSON.parse(data);
			if(!json.success) user = null;
		}catch(error){
			winston.info('error while parsing response for user ['+error+']');
			user = null;
		}

		if(user){
			pouch.updateUser(user,pass)
				.then(function(user){
					session.user = user;
					session.save();
					module.exports.connected(session,socket);
				})
				.catch(function(error){
					error.outputToLog();
				});
		}else{
			module.exports.connected(session,socket);
		}

	});
}

// User authentication calbacks
module.exports.connected = function(session,socket)
{
	if(module.exports.loggedIn(session)){

		var id = session.user.id || session.user._id || session.user.name;

		pouch.getUser(id)
			.then(function(user){
				session.user = user;
				session.save();
				
				socket.emit('loginStatus',true,{
					_id: user._id,
					name: user.name,
					type: user.type,
					roles: user.roles,
					session: user.session
				});
				module.exports.emit('userConnected',session.user.name);
			})
			.catch(function(error){
				error.outputToLog();
			});
		// socket.emit('playlistUpdate',{playlist:player.playlist(),channel:player.channel()});
		// socket.emit('channelsUpdate',{channels:player.channels()});
		// socket.emit('libraryDownload',{library:player.library()});
		// socket.emit('users',{users:users});
	}else{
		socket.emit('loginStatus',false,null);
	}
}

module.exports.logout = function(session,socket){
	if(! module.exports.loggedIn(session)) return;
	module.exports.disconnected(session,socket);
	session.user = null;
	session.userObject = null;
	session.save();
	module.exports.connected(session,socket);
};

module.exports.disconnected = function(session,socket){
	if(module.exports.loggedIn(session)){
		module.exports.emit('userDisconnected',session.user);
	}
}


var airhornTimeout,
	airhornDisabled = [],
	airhornCount = 0,
	airhornStatuses = [
		'%s submitted a modest toot.',
		'%s asserted their dominance via airhorn.',
		'%s is reaaaaaaaally excited about compressed air.',
		'%s can\'t get enough of that BWAAAAAAAAAA.',
		'%s doesn\'t know if they can get enough airhorn. At least, not yet.',
		'%s clicked the airhorn button frantically.',
		'The airhorn loves %1$s, and %1$s loves the airhorn right on back.',
		'This is getting ridiculous %s. You and I both know this can\'t go on.',
		'Someone go and slap %s. They\'re getting frantic.',
		'%s, if you keep clicking that button, I\'m going to have to assume this is a medical emergency.',
		'I\'ll call an ambulance, don\'t think I won\'t.',
		'Dialing....',
		'...',
		'Dialing....',
		'...',
		'PLEASE NO MORE',
		'Ok, you called my bluff %s. I\'m just a modest music server.',
		'Fine. You forced me to this %1$s. I didn\'t want to do it, but that\'s where we\'re at. %1$s\'s horn blowing capabilities have been temporarily revoked. x_x',
	];

module.exports.airhornRequest = function(session)
{
	if(airhornDisabled.indexOf(session.user) != -1) return; // Disabled

	// Statuses iterate based upon requests within an updating time frame
	clearTimeout(airhornTimeout);
	airhornTimeout = setTimeout(function() { airhornCount = 0 }, 60000); // Clears after a minute of inactivity

	module.exports.emit('statusUpdate','airhornRequest',session.user,sprintf(airhornStatuses[airhornCount],session.user));

	if(airhornCount < airhornStatuses.length) airhornCount ++;
	else{
		airhornDisabled.push(session.user);
		setTimeout(function() {
			airhornDisabled.splice(airhornDisabled.indexOf(session.user),1);
		}, 60 * 60 * 1000); // For an hour
	}
}

module.exports.loggedIn = function(session)
{
	return (session != null && session.user != null);
}

module.exports.isAdmin = function(session)
{
	return (session != null && session.user != null && session.userObject.level > 1);
}

// Get login request
var requestAuthentication = function (user,pass,callback)
{
	var https = require('https')
	  , body = []
	  , querystring = require('querystring')
	  , data = querystring.stringify({
			username: user,
			pwd: pass
		})
	  , connection = {
			host: 'mobile.phenomblue.com',
			port: 443,
			path: '/domainportal/services/authenticator.ashx',
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Content-Length': data.length
			}
		};

	var request = https.request(connection,function(result){
		result.setEncoding('utf8');
		result.on('data', function (chunk) {
			body.push(chunk);
		});
		result.on('end',function(){
			callback(body.join(''));
		});
	});
	request.on('error',function(error){
		console.error(error);
		callback(false);
	});
	request.write(data);
	request.end();
}