// Dependancies
var config 	  = require('./config.js')
  , winston = require('winston')
  , util = require('util')
  , player = require('./player.js')
  , EventEmitter = require('events').EventEmitter
  , db = require('./db.js')
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
	winston.info('---'+user+' disconnected.');
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

		session.user = user;
		session.save();
		module.exports.connected(session,socket);
	});
}

// User authentication calbacks
module.exports.connected = function(session,socket)
{
	var loggedIn = module.exports.loggedIn(session);
	var user = (session != null) ? session.user : null;
	socket.emit('loginStatus',loggedIn,user);
	if(loggedIn){
		// Create in db
		db.User.findOrCreate({username:user}).success(function(user){
			session.userObject = user;
			session.save();
		});

		module.exports.emit('userConnected',session.user);
		socket.emit('playlistUpdate',{playlist:player.playlist(),channel:player.channel()});
		socket.emit('channelsUpdate',{channels:player.channels()});
		socket.emit('libraryDownload',{library:player.library()});
		socket.emit('users',{users:users});
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