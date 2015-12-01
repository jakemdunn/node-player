
var api = require('./api.js')
  , db = require('./db.js')
  , winston = require('winston')
  , util = require('util')
  , library = require('./library.js')
  , EventEmitter = require('events').EventEmitter
  , _channel = false
  , _library = []
  , _channels = []
  , _playlist = []
  , _userInsertions = []
  , _playlistLength = 10;

module.exports = new EventEmitter();

// Our Public methods------------------------

module.exports.channels = function()
{
	return _channels;
}

module.exports.channel = function()
{
	return (_channel === false) ? false : _channel.id;
}

module.exports.setChannels = function(channels)
{
	_channels = channels;
}

module.exports.playlist = function()
{
	var playlist = library.simplified(_playlist);

	// Mark all songs that are user inserted as such
	for (var i = _userInsertions.length - 1; i >= 0; i--) {
		var insertion = _userInsertions[i],
			found = false;

		playlist.forEach(function(song){
			if(song.id == insertion.id){
				found = true;
				song.userInserted = insertion.user;
				return;
			}
		});

		// Remove our reference if the song is no longer in the playlist
		if(!found) _userInsertions.splice(i,1);
	}


	return playlist;
}

module.exports.library = function()
{
	return library.simplified(_library);
}

module.exports.setLibrary = function(library,callback)
{
	_library = library;

	parseLibrary(function(){
		buildPlaylist(function(){
			startTrack();
			callback();
		});
	});
}

module.exports.skipTrack = function(user)
{
	if(user.level <= 0){
		winston.info(user.username + ' denied skip');
		module.exports.emit('statusUpdate','userDenied',{
			user:user,
			message:"User level does not permit skipping."
		});
		return;
	}

	var song = library.simplified(_playlist[0])[0];
	nextTrack();
	module.exports.emit('statusUpdate','userSkipped',{
		user:user.username,
		song:song
	});

	winston.info(user.username + ' skipped [' + song.title + ' by ' + song.artist + ']');
}

module.exports.moveTracks = function(user,index,ids)
{
	if(user.level <= 0){
		winston.info(user.username + ' denied movement');
		module.exports.emit('statusUpdate','userDenied',{
			user:user,
			message:"User level does not permit movement."
		});
		return;
	}

	insertTracks(index,ids);
	module.exports.emit('statusUpdate','userMoved',{
		user:user.username,
		ids:ids
	});

	winston.info(user.username + ' moved [' + ids + ']');
}

module.exports.insertTracks = function(user,index,ids)
{
	// TODO: Limit rate of insertion
	if(user.level <= 0){
		winston.info(user.username + ' denied insertion');
		module.exports.emit('statusUpdate','userDenied',{
			user:user,
			message:"User level does not permit insertions."
		});
		return;
	}

	// Store reference to what user inserted these tracks
	ids.forEach(function(id){
		_userInsertions.push({id:id,user:user});
	});

	insertTracks(index,ids);
	module.exports.emit('statusUpdate','userInserted',{
		user:user.username,
		ids:ids
	});

	winston.info(user.username + ' inserted [' + ids + ']');
}

module.exports.removeTracks = function(user,ids)
{
	if(user.level <= 0){
		winston.info(user.username + ' denied remove');
		module.exports.emit('statusUpdate','userDenied',{
			user:user,
			message:"User level does not permit removing tracks."
		});
		return;
	}

	removeTracks(ids);
	module.exports.emit('statusUpdate','userRemoved',{
		user:user.username,
		ids:ids
	});

	winston.info(user.username + ' removed [' + ids + ']');
}

module.exports.deleteSongs = function(user,ids)
{
	if(user.level <= 1){
		winston.info(user.username + ' denied delete');
		module.exports.emit('statusUpdate','userDenied',{
			user:user,
			message:"User level does not permit deleting tracks."
		});
		return;
	}
	
	removeTracks(ids);
	deleteSongs(ids);
	module.exports.emit('statusUpdate','userDeleted',{
		user:user.username,
		ids:ids
	});

	winston.info(user.username + ' deleted [' + ids + ']');
}

module.exports.rateTrack = function(user,id,newRating)
{
	if(user.level <= 0){
		winston.info(user.username + ' denied rate');
		module.exports.emit('statusUpdate','userDenied',{
			user:user,
			message:"User level does not permit rating tracks."
		});
		return;
	}

	var song;
	for (var i = _library.length - 1; i >= 0; i--) {
		song = _library[i];
		if(song.id == id) break;
	};

	db.Rating.findOrCreate({SongId:song.id,UserId:user.id}).success(function(rating){
		rating.rating = newRating;
		rating.save(['rating']).success(function(){
			db.Rating.all({where:{SongId:song.id}}).success(function(ratings){
				song.ratings = ratings;
				library.parseSong(song,function(){
					module.exports.emit('statusUpdate','ratingUpdate',{
						id:song.id,
						rating:song.rating,
						userRating:newRating,
						user:user.username
					});
				});
			});
		});
	});

	winston.info(user.username + ' rated [' + song.id + '] a [' + newRating + ']');
}

module.exports.addChannel = function(user,name)
{
	if(user.level <= 0){
		winston.info(user.username + ' denied channel add');
		module.exports.emit('statusUpdate','userDenied',{
			user:user,
			message:"User level does not permit adding a channel."
		});
		return;
	}
	
	addChannel(name);
	module.exports.emit('statusUpdate','userAddedChannel',{
		user:user.username,
		name:module.name
	});
}

module.exports.setChannel = function(user,id)
{
	if(user.level <= 0){
		winston.info(user.username + ' denied channel set');
		module.exports.emit('statusUpdate','userDenied',{
			user:user,
			message:"User level does not permit setting channel."
		});
		return;
	}
	
	setChannel(id);
	module.exports.emit('statusUpdate','userChangedChannel',{
		user:user.username,
		id:id
	});
}

// Our Internal methods------------------------

var parseLibrary = function(callback)
{
	// Sort by artist, album, and track
	var trackRegex = /[^\d].*$/;
	_library.sort(function(a,b){
		if(a.id3.comments.artist[0] == b.id3.comments.artist[0]){
			if(a.id3.comments.album[0] == b.id3.comments.album[0]){
				if(a.id3.comments.track_number == null && b.id3.comments.track_number == null){
					if(a.id3.comments.title[0]<b.id3.comments.title[0]) return -1;
					if(a.id3.comments.title[0]>b.id3.comments.title[0]) return 1;
					return 0;
				}else{
					if(a.id3.comments.track_number == null) return -1;
					if(b.id3.comments.track_number == null) return 1;
					return parseInt(a.id3.comments.track_number[0].replace(trackRegex,''))
						- parseInt(b.id3.comments.track_number[0].replace(trackRegex,''));
				}
			}else{
				if(a.id3.comments.album[0]<b.id3.comments.album[0]) return -1;
				if(a.id3.comments.album[0]>b.id3.comments.album[0]) return 1;
				return 0;
			}
		}else{
			if(a.id3.comments.artist[0]<b.id3.comments.artist[0]) return -1;
			if(a.id3.comments.artist[0]>b.id3.comments.artist[0]) return 1;
			return 0;
		}
	});

	// If you need to check the sort
	// for (var i = 0; i < _library.length; i++) {
	// 	var song =_library[i];
	// 	var trackNumber = (song.id3.comments.track_number == null) ? '?' : song.id3.comments.track_number[0].replace(trackRegex,'');
	// 	console.log(song.id3.comments.artist + ' / ' + song.id3.comments.album + ' / ' + trackNumber + ' / ' + song.id3.comments.title);
	// };

	callback();
}

var channelLibrary = function()
{
	if(!_channel) return _library.slice();

	// Sort out by channel
	var channelLibrary = [];
	_library.forEach(function(song){
		if(song.channels != null){
			for (var i = song.channels.length - 1; i >= 0; i--) {
				var channel = song.channels[i];
				if(channel.name == _channel.name){
					channelLibrary.push(song);
					break;
				}
			};
		}
	});

	return channelLibrary;
}

var buildPlaylist = function(callback)
{
	var channel = channelLibrary();

	// Remove current playlist from channel
	_playlist.forEach(function(song){
		channel.splice(channel.indexOf(song),1);
	});

	// Get our newest and oldest date
	var newest, oldest;
	channel.forEach(function(song){
		if(song.lastPlayed != null && newest == null){ newest = oldest = song.lastPlayed; return;}
		if(song.lastPlayed != null && song.lastPlayed > newest) newest = song.lastPlayed;
		if(song.lastPlayed != null && song.lastPlayed < oldest) oldest = song.lastPlayed;
	});

	if(newest != null && oldest != null){
		// We'll use this range to sort influenced by rating
		var range = newest.getTime() - oldest.getTime();

		var influencedDate = function(song){
			var influence = 0,
				lastPlayed = song.lastPlayed
				rating = song.rating;

			if(lastPlayed == null) lastPlayed = oldest; // Never played has the best chances, right?

			if(rating > 3) influence = (rating - 3) /  2 / 6; 		// Make it up to 1/6'th a range higher
			if(rating < 3) influence = (3 - rating) / -2;	// Make it up to 1 range lower
			return new Date(lastPlayed.getTime() - Math.round(range * influence));
		}

		// Sort by date
		channel.sort(function(a,b){
			return influencedDate(a).getTime() - influencedDate(b).getTime();
		});

		//If you need to check the sort
		// winston.info(newest);
		// winston.info(oldest);
		// winston.info(range);
		// for (var i = 0; i < channel.length; i++) {
		// 	var song =channel[i];
		// 	winston.info(influencedDate(song).toISOString() + ' / ' + song.rating);
		// };

	}

	while(_playlist.length < _playlistLength && channel.length > 0){
		var random = Math.floor(Math.random()*channel.length*.5) // From first half of array, to keep it from repeating too much
		  , song = channel.splice(random,1)[0];

		// winston.info('Pulled song ['+random+'] from list of ['+channel.length+']')

		_playlist.push(song);
	}

	winston.info('Playlist updated');
	if(callback) callback();
}

var trackTimeout;
var startTrack = function()
{
	clearTimeout(trackTimeout);
	if(_playlist.length == 0) return;
	
	var song = _playlist[0];

	var duration = song.id3.playtime_seconds * 1000;
	var attributes = [];

	song.lastPlayed = new Date();
	song.save(['lastPlayed']);

	trackTimeout = setTimeout(function(){
		nextTrack();
	},duration);

	winston.info('Starting new track ['+song.url+']');
	module.exports.emit('statusUpdate','startTrack',{
		song:library.simplified(song)[0]
	});
}

var nextTrack = function()
{
	var song = _playlist.splice(0,1)[0];
	_library.splice(_library.indexOf(song),1);
	_library.push(song);

	buildPlaylist();
	startTrack();

	module.exports.emit('statusUpdate','playlistUpdate',{
		playlist:module.exports.playlist(),
		channel:module.exports.channel()
	});
}

var insertTracks = function(index,ids)
{
	//Find our selected tracks
	var songs = [];
	_library.forEach(function(song){
		if(ids.indexOf(song.id) !== -1){
			songs.push(song);
		}
	});

	//Insert into channel, if not 'all'
	if(_channel){
		songs.forEach(function(song){
			if(song.channels){
				for (var i = song.channels.length - 1; i >= 0; i--) {
					if(song.channels[i].name == _channel.name) return;
				};

				song.channels.push(_channel);
				song.setChannels(song.channels);
			}
		});
	}

	//Make sure these tracks aren't in the playlist, no repeats, people
	var removedFirst = false;
	songs.forEach(function(song){
		var playlistIndex = _playlist.indexOf(song);
		if(playlistIndex !== -1) _playlist.splice(playlistIndex,1);
		if(playlistIndex == 0) removedFirst = true;
	});

	//Insert our songs
	while(songs.length > 0)
		_playlist.splice(index,0,songs.pop());

	// We could have removed the first track by adding it lower in the list
	if(removedFirst) startTrack();

	module.exports.emit('statusUpdate','playlistUpdate',{
		playlist:module.exports.playlist(),
		channel:module.exports.channel()
	});
}

var removeTracks = function(ids){
	var songs = [];
	for (var i = _playlist.length - 1; i >= 0; i--) {
		var song = _playlist[i],
			index = ids.indexOf(song.id);
		if(index !== -1) songs.push(_playlist.splice(i,1)[0]);
	};

	//Remove from channel, if not 'all'
	if(_channel){
		songs.forEach(function(song){
			if(song.channels){
				for (var i = song.channels.length - 1; i >= 0; i--) {
					if(song.channels[i].name == _channel.name){
						song.channels.splice(i,1);
						song.setChannels(song.channels);
						return;
					}
				};
			}
		});
	}

	buildPlaylist();

	module.exports.emit('statusUpdate','playlistUpdate',{
		playlist:module.exports.playlist(),
		channel:module.exports.channel()
	});
}

var deleteSongs = function(ids){
	var songs = [];
	for (var i = _library.length - 1; i >= 0; i--) {
		var song = _library[i],
			index = ids.indexOf(song.id);
		if(index !== -1) songs.push(_library.splice(i,1)[0]);
	};

	// Delete from database
	songs.forEach(function(song){
		song.destroy();
	});
}

var addChannel = function(channelName){
	if(channelName == '') return;
	db.Channel.findOrCreate({name:channelName}).success(function(channel){
		db.Channel.findAll().success(function(channels){
			_channels = channels;

			module.exports.emit('statusUpdate','channelsUpdate',{
				channels:module.exports.channels()
			});
		});
	});
}

var addSong = function(song)
{
	// Check to make sure this isn't a duplicate
	for (var i = _library.length - 1; i >= 0; i--) {
		if(_library[i].id == song.id) return;
	};

	// Add to library, and sort
	_library.push(song);
	parseLibrary(function(){
		module.exports.emit('statusUpdate','songAdded',{
			song:library.simplified(song)[0]
		});
	});
}

var setChannel = function(channelID){
	winston.info('Setting channel by ID['+channelID+']');
	if(_channel && _channel.id == channelID) return;

	if(channelID == '' || channelID == false){
		_channel = false;
		_playlist = [];
		buildPlaylist();
		startTrack();

		module.exports.emit('statusUpdate','playlistUpdate',{
			playlist:module.exports.playlist(),
			channel:module.exports.channel()
		});
	}else{
		db.Channel.find({where:{id:channelID}}).success(function(channel){
			_channel = channel;
			_playlist = [];
			buildPlaylist();
			startTrack();

			winston.info('Set channel to ['+channel.name+']');

			module.exports.emit('statusUpdate','playlistUpdate',{
				playlist:module.exports.playlist(),
				channel:module.exports.channel()
			});
		});
	}
}

library.on('songAdded',function(song){
	addSong(song);
});