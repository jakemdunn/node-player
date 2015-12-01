
var EventEmitter = require('events').EventEmitter
  , groove = require('groove')
  , Promise = require('promise')
  , util = require('util')
  , winston = require('winston')
  , api = require('./api.js')
  , config	= require('./config.js')
  , db = require('./db.js')
  , library = require('./library.js')
  , pouch = require('./pouch.js');

util.inherits(Player, EventEmitter);
module.exports = Player;

function Player(name){

	var _this = this;

	_this.name = name || false;
	// _this.playlist = groove.createPlaylist();
	// _this.normalizer = groove.createLoudnessDetector();
	_this.playlist = [];
	_this.history = [];
	_this.userInsertions = [];
	_this.playlistLength = 10;
	_this.indexName = _this.name ? 'playOrder-'+_this.name : 'playOrder';

	if(_this.name) playlists.push(name);
	players.push(_this);

	// Public methods------------------------
	_this.setup = function()
	{
		return setupIndexes().then(function(){
			winston.info('Indexes created successfully');
			return buildPlaylist();
		}).then(function(){
			return startTrack();
		});
	}

	_this.getPlaylist = function()
	{
		return {
			playlist:_this.playlist,
			history:_this.history,
			userInsertions: _this.userInsertions
		};
	}

	_this.emit = function(event,action,params)
	{
		params.action = action;
		params.playerID = _this.name;
		EventEmitter.prototype.emit.call(this,'statusUpdate','playerUpdate',params);
	}

	_this.skipTrack = function(user)
	{
		if(!_this.authUser(user,'user','skipping')) return Promise.reject(new Error('Unable to authenticate user.'));

		var skipped = _this.playlist[0]
			current = _this.playlist[1];

		_this.emit('statusUpdate','userSkipped',{
			user:user.name,
			song:skipped
		});

		winston.info(user.name + ' skipped [' + skipped + ']');

		return nextTrack()
			.then(function(){
				return library.getSong(current);
			})
			.then(function(song){
				current = song;
				return library.getSong(skipped);
			})
			.then(function(song){
				skipped = song;

				return Promise.resolve({current:current,skipped:skipped});
			});
	}

	_this.moveTracks = function(user,index,ids)
	{
		if(!_this.authUser(user,'user','movement')) return;

		insertTracks(index,ids);

		_this.emit('statusUpdate','userMoved',{
			user:user.name,
			ids:ids
		});

		winston.info(user.name + ' moved [' + ids + ']');
	}

	_this.insertTracks = function(user,index,ids)
	{
		if(!_this.authUser(user,'user','insertion')) return;

		// Store reference to what user inserted these tracks
		ids.forEach(function(id){
			userInsertions.push({id:id,user:user});
		});

		insertTracks(index,ids);

		_this.emit('statusUpdate','userInserted',{
			user:user.name,
			ids:ids
		});

		winston.info(user.name + ' inserted [' + ids + ']');
	}

	_this.removeTracks = function(user,ids)
	{
		if(!_this.authUser(user,'user','remove')) return;

		return _this.removeTracks(ids)
			.then(function(){
				winston.info(user.name + ' removed [' + ids + ']');
				_this.emit('statusUpdate','userRemoved',{
					user:user.name,
					ids:ids
				});
			});
	}

	_this.deleteSongs = function(user,ids)
	{
		if(!_this.authUser(user,'admin','delete')) return;

		return _this.removeTracks(ids)
			.then(function(){
				return library.deleteSongs(ids);
			})
			.then(function(){
				winston.info(user.name + ' deleted [' + ids + ']');
				_this.emit('statusUpdate','userDeleted',{
					user:user.name,
					ids:ids
				});
			});
	}

	_this.rateTrack = function(user,id,rating)
	{
		if(!_this.authUser(user,'user','rate')) return Promise.reject(new Error('Unable to authenticate user.'));

		return library.getSong(id)
			.then(function(song){
				return song.addRating(user.id,rating);
			})
			.then(function(song){
				return song.save();
			})
			.then(function(song){
				winston.info(user.name + ' rated [' + id + '] a [' + rating + ']');
				_this.emit('statusUpdate','ratingUpdate',{
					id:song.id,
					rating:song.rating,
					userRating:rating,
					user:user.name
				});

				return Promise.resolve(song);
			});
	}

	_this.authUser = function(user,required,action)
	{
		if(!user.roles || (user.roles.indexOf(required) === -1  && user.roles.indexOf('admin') === -1)){
			winston.info(util.inspect(user));
			winston.info(user.roles);
			winston.info(user.roles.indexOf('admin'));
			winston.info('was denied ' + action);
			_this.emit('statusUpdate','userDenied',{
				user:user,
				message:'User level does not permit '+action+'.'
			});
			return false;
		}

		return true;
	}

	_this.scrubUserInsertions = function()
	{
		// Remove our reference if the song is no longer in the playlist or history
		_this.userInsertions.forEach(function(id,index,insertions){
			if(_this.playlist.indexOf(id.id) == -1 && _this.history.indexOf(id.id) == -1)
				insertions.splice(index,1);
		});
	}

	var trackHistory = function(id)
	{
		_this.history.push(id);
		while(_this.history.length > 10)
			_this.history.shift();
	}

	// Our Internal methods------------------------

	var setupIndexes = function()
	{
		return pouch
			.setupIndex(pouch.songs,'dateOrdered',function(doc){
				if(doc.lastPlayed)
					emit(new Date(doc.lastPlayed).getTime());
			},config.validate)
			.then(function(){
				var start,end;

				return pouch.songs
					.query('dateOrdered',{limit:1}).then(function(result){
						if(result.rows.length > 0) start = new Date(result.rows[0].key);
						return pouch.songs.query('dateOrdered',{limit:1,descending:true});
					})
					.then(function(result){
						if(result.rows.length > 0) end = new Date(result.rows[0].key);

						if(!start){
							start = new Date();
							start.setMonth(start.getMonth() - 1);
						}
						if(!end) end = new Date();

						var range = end.getTime() - start.getTime();
						
						// Make it up to 1/6 a range higher
						// Make it up to 1 range lower
						// Add random fluctuation of up to 1/6 
						var index = 'function(doc){\
							if(doc.filename {{filter}}){\
								var influence = 0,\
									lastPlayed = (doc.lastPlayed) ? new Date(doc.lastPlayed).getTime() : ' + start.getTime() + ';\
								if(doc.rating > 3) influence = (doc.rating - 3) /	2 / 6;\
								if(doc.rating < 3) influence = (3 - doc.rating) / -2;\
								influence += Math.random() / 6;\
								emit(lastPlayed - Math.round(' + range + ' * influence));\
							}\
						}';

						index = index.replace('{{filter}}',_this.name ? ' && doc.playlists && doc.playlists.indexOf('+_this.name+') !== -1' : '');
						
						return pouch.setupIndex(pouch.songs,_this.indexName,index,config.validate);
					});
			});
	}

	var buildPlaylist = function(callback)
	{
		return pouch.songs.query(_this.indexName,{limit:_this.playlistLength})
			.then(function(result){
				result.rows.forEach(function(song,index,songs){
					if(_this.playlist.length < _this.playlistLength && _this.playlist.indexOf(song.id) == -1)
						_this.playlist.push(song.id);
				});
				return Promise.resolve();
			});
	}

	var trackTimeout;
	var startTrack = function()
	{
		clearTimeout(trackTimeout);
		if(_this.playlist.length == 0) return;
		
		return library.getSong(_this.playlist[0])
			.then(function(song){
				var duration = song.length * 1000;

				trackTimeout = setTimeout(function(){
					nextTrack();
				},duration);

				winston.info('Starting new track ['+song.url+']');
				_this.emit('statusUpdate','startTrack',{
					song:song.id
				});
				
				song.lastPlayed = new Date();
				return song.save();
			});
	}

	var nextTrack = function()
	{
		trackHistory(_this.playlist.shift());

		return buildPlaylist()
			.then(function(){
				return startTrack();
			})
			.then(function(){
				_this.emit('statusUpdate','playlistUpdate',{
					playlist:_this.playlist
				});
			});
	}

	var insertTracks = function(index,ids)
	{
		//Make sure these tracks aren't in the playlist, no repeats, people
		var wasPlaying = false;
		ids.forEach(function(song){
			var playlistIndex = playlist.indexOf(song);
			if(playlistIndex !== -1) playlist.splice(playlistIndex,1);
			if(playlistIndex == 0) wasPlaying = true;
		});

		//Insert our songs
		while(ids.length > 0)
			playlist.splice(index,0,ids.pop());

		// We could have removed the first track by adding it lower in the list
		if(wasPlaying) startTrack();

		_this.emit('statusUpdate','playlistUpdate',{
			playlist:_this.playlist
		});
	}

	var removeTracks = function(ids){
		for (var i = playlist.length - 1; i >= 0; i--) {
			var song = playlist[i],
				index = ids.indexOf(song);
			if(index !== -1) playlist.splice(i,1);
		};

		buildPlaylist();

		_this.emit('statusUpdate','playlistUpdate',{
			playlist:_this.playlist
		});
	}

	// var setupNormalization = function(){

	// 	_this.normalizer.on('info', function() {
	// 		var info = _this.normalizer.getInfo();
	// 		if (info.item) {
	// 			if(config.verbose)
	// 				console.log(info.item.file.filename, "gain:",
	// 					groove.loudnessToReplayGain(info.loudness), "peak:", info.peak,
	// 					"duration:", info.duration);
	// 		} else {
	// 			if(config.verbose)
	// 				console.log("all files gain:",
	// 					groove.loudnessToReplayGain(info.loudness), "peak:", info.peak,
	// 					"duration:", info.duration);
	// 		}
	// 	});

	// 	return new Promise(function(resolve,reject){
	// 		_this.normalizer.attach(playlist, function(error) {
	// 			if(error) return reject(error);
	// 			resolve();
	// 		});
	// 	});
	// }
}

var playlists = [];
var players = [];

Player.playlists = function(){
	return playlists;
}
Player.players = function(){
	return players;
}
Player.defaultPlayer = function(){
	return players[0];
}