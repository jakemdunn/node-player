var dnode = require('dnode')
  , winston = require('winston')
  , util = require('util')
  , EventEmitter = require('events').EventEmitter
  , socket = 3002
  , attempts = 3
  , booted = false
  , connected = false
  , bootTimeout
  , connection
  , remote;

module.exports = new EventEmitter();
module.exports.boot = function()
{
	if(attempts <= 0){
		winston.error('Failed to boot API');
		throw new Error('Failed to boot API.');
		return;
	}

	if(attempts < 3){
		winston.warn('Retrying API boot, retries left: '+attempts);
	}else{
		winston.info('Booting API');
	}

	var exec = require('child_process').exec;
	attempts--;

	// Give it half a second to boot - wish we could listen to an event, but this works
	clearTimeout(bootTimeout);
	bootTimeout = setTimeout(function(){
		connection = dnode.connect(socket);
		connection.on('remote',function(server){
			remote = server;
			winston.info('API Ready');
			module.exports.emit('ready');
			connected = true;
		});
		connection.on('error',function(error){
			connection.end();

			if(connected){
				winston.error('API crashed after successful boot:');
				winston.error(util.inspect(error));
				throw new Error('API crashed after successful boot.');
			}else{
				winston.error('API refused connection:');
				winston.error(util.inspect(error));
				module.exports.boot();
			}
		});
		connection.on('fail',function(error){
			connection.end();
			
			winston.error('API connection failure:');
			winston.error(util.inspect(error));
			throw new Error('API connection failure.');
		});
	},500);

	if(booted) return;
	booted = true;

	exec('php ../media/boot.php',function(error,stdout,stderr){
		if(attempts > 0){
			winston.warn('API returned, retry required.');
		}else{
			if (stdout !== null) winston.info('stdout:\n' + stdout);
			if (stderr !== null) winston.error('stderr:\n' + stderr);
			if (error  !== null) winston.error('error:\n'  + error);
		}

		// This shouldn't return, retry
		booted = false;
		module.exports.boot();
	});
}

module.exports.getID3 = function(filename,callback)
{
	remote.getID3(filename,function (data) {
		var id3 = JSON.parse(data);
		callback(id3);
	});
}

module.exports.getImageData = function(filename,callback)
{
	remote.getImageData(filename,function (data,mimetype) {
		callback(data,mimetype);
	});
}

module.exports.shutdown = function()
{
	remote.shutdown(function (data) {
		winston.info('shutdown API');
		connection.end();
	});
}