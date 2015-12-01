var fs   = require('fs')
  , EventEmitter = require('events').EventEmitter
  , path = require('path')
  , ProgressBar = require('progress')
  , mkdirp = require('mkdirp')
  , winston = require('winston')
  , util = require('util')
  , crypto = require('crypto')
  , glob = require('glob')
  , db   = require('./db.js')
  , api  = require('./api.js')
  , config  = require('./config.js')
  , Sequelize = require('sequelize-mysql').sequelize;

module.exports = new EventEmitter();
module.exports.loadMusic = function(callback)
{
	// Load our channels list, then our music
	db.Channel.findAll().success(function(channels){
		// Load our music
		db.Songs.findAll({ include: [ db.Rating ] }).success(function(songs){
			// Show our progress, this could take a while
			if(songs.length > 0 && config.verbose){
				var bar = new ProgressBar('Parsing ID3: [:bar] :percent :etas', {
					complete: '='
					, incomplete: ' '
					, width: 60
					, total: songs.length
				});
			}

			// Make sure we have this in the filesystem, still
			var parsed = 0;
			for (var i = songs.length - 1; i >= 0; i--) {
				var song = songs[i];
				if(!fs.existsSync(song.filename)){
					songs.splice(i,1);
					song.destroy();
					if(bar) bar.tick();
				}else{
					// Get ID3
					module.exports.parseSong(song,function(){
						parsed++;
						if(bar) bar.tick();
						if(parsed >= songs.length){
							if(bar){
								console.log('\n');
								bar = null;
							}
							winston.info('Finished parsing id3');
							module.exports.emit('filesParsed');
						}
					})
				}
			};
			
			module.exports.once('filesParsed',function(){
				scanForNew(function(newSongs){
					songs = songs.concat(newSongs);
					callback(channels,songs);
				});
			});

			if(songs.length == 0)
				module.exports.emit('filesParsed');
		});
	});
}

module.exports.addFile = function(file,callback,userID)
{
	addFile(file,function(sound){
		if(sound) module.exports.emit('songAdded',sound);
		if(callback) callback(sound);
	},userID);
}

module.exports.addCover = function(temp,file,album,artist,callback)
{
	if(temp == null || file == null || album == null || artist == null) return;
	addCover(temp,file,album,artist,function(coverURL){
		if(coverURL) module.exports.emit('coverAdded',coverURL);
		if(callback) callback(coverURL);
	});
}

module.exports.parseSong = function(song,callback)
{
	if(song.id3 == null || song.id3 == '' || song.id3 == false){
		// Get ID3
		api.getID3(song.filename,function(id3){

			if(id3.comments.picture) delete id3.comments.picture;
			if(id3.id3v2) delete id3.id3v2;

			var dbID3 = new Buffer(JSON.stringify(id3), 'utf8').toString('base64');
			song.id3 = dbID3;

			song.save(['id3'])
				.success(function(){
					parseAfterID3(song,function(){
						callback();
					});
				})
				.failure(function(){
					winston.error('unable to save ID3 for song ['+song.id+']');
					parseAfterID3(song,function(){
						callback();
					});
				});
		});
	}else{
		parseAfterID3(song,function(){
			callback();
		});
	}
}

module.exports.simplified = function(songs)
{
	var parsed = [];

	if(!Array.isArray(songs))
		songs = [songs];

	for (var i = songs.length - 1; i >= 0; i--) {
		var song = songs[i];

		parsed.unshift({
			id: 				song.id,
			url: 				song.url,
			rating:				song.rating,
			lastPlayed: 		song.lastPlayed,
			coverImage: 		song.coverImage,
			thumbImage: 		song.thumbImage,
			download: 			song.download,
			artist: 			(song.id3.comments.artist != null) ? song.id3.comments.artist[0] : '???',
			album: 				(song.id3.comments.album != null) ? song.id3.comments.album[0] : '???',
			title: 				(song.id3.comments.title != null) ? song.id3.comments.title[0] : '???',
			trackNumber: 		(song.id3.comments.track_number != null) ? song.id3.comments.track_number[0].split('/').shift() : '?',
			playtime_seconds: 	song.id3.playtime_seconds,
			playtime_string: 	song.id3.playtime_string,
			userInserted: 		false,
		});
	};

	return parsed;
}

module.exports.safeDirectory = function(dir){
	return safeDirectory(dir);
}

function parseAfterID3(song,callback)
{
	if(Buffer.isBuffer(song.id3))
		song.id3 = song.id3.toString('utf8');
	if(typeof song.id3 == 'string'){
		try{
			song.id3 = JSON.parse(new Buffer(song.id3, 'base64').toString('utf8'));
		}catch(error){
			winston.info(util.inspect(error));
			winston.info(util.inspect(new Buffer(song.id3, 'base64').toString('utf8')));
		}

	}

	var imgURL = safeDirectory(song.id3.comments.artist[0]) + '/' + safeDirectory(song.id3.comments.album[0])
	  , dir = path.resolve(config.files.music,imgURL)
	  , thumb = path.resolve(dir,'thumb.png')
	  , hash = '0';

	// Temporary code to fix our inconsistencies in folder names
	// var oldDir = song.filename.replace(/\/[^\/]*$/,'');
	// //winston.info('comparing ['+dir+'] to ['+oldDir+']')
	// if(oldDir != dir){
	// 	var file = safeFile(path.basename(song.filename))
	// 	  , moved = path.resolve(dir,file);
	// 	// Make our directory
	// 	if(!fs.existsSync(dir))
	// 		mkdirp.sync(dir);

	// 	winston.info('Bad directory: moving file from ['+song.filename+'] to ['+moved+']');

	// 	// Move, if we haven't already
	// 	if(!fs.existsSync(moved))
	// 		fs.renameSync(song.filename,moved);

	// 	song.filename = moved;

	// 	// Save to database
	// 	song.save(['filename'])
	// 		.success(function(){
	// 			winston.info('Saved new location to database for song ['+song.id+']');
	// 		})
	// 		.failure(function(){
	// 			winston.error('unable to save new location for song ['+song.id+']');
	// 		});
	// }
	// /end temporary code

	// If we have a cover image, set the hash to the update date
	glob(dir+"/cover.{png,jpg,jpeg,gif}", {nocase:true}, function (er, files) {
		if(files.length > 0){
			var filename = path.resolve(dir,files[0])
			  , stats = fs.statSync(filename);

			hash = crypto
				.createHash('sha1')
				.update(stats.mtime.toString(),'utf8')
				.digest('hex');
		}

		song.url = song.filename.replace(config.files.music,config.web_root+'/music');
		song.url = song.url.replace('\\','/');
		song.coverImage = config.web_root + '/cover/' + imgURL + '?' + hash;
		song.thumbImage = config.web_root + '/thumb/' + imgURL + '?' + hash;
		song.download   = config.web_root + '/download/' + imgURL;

		if(song.ratings != null && song.ratings.length > 0){
			var average = 0;
			song.ratings.forEach(function(rating){
				average += rating.rating;
			});
			song.rating = Math.round(average / song.ratings.length);
		}else{
			song.rating = 3;
		}

		if(song.channels == null){
			song.getChannels().success(function(channels){
				song.channels = channels;
				callback();
			});
		}else{
			callback();
		}
	});
}

function scanForNew(callback)
{
	winston.info('Scanning for new files...');

	walk(config.files.upload, function(err, results) {
		if (err) throw err;

		var parsed = [];
		winston.info('['+results.length+'] new files found');

		// Get ID3 info, and move
		results.forEach(function(filename){
			addFile(filename,function(song){
				if(song){
					parsed.push(song);
					if(parsed.length >= results.length)
						module.exports.emit('filesParsed');
				}else{
					results.splice(results.indexOf(filename),1);
				}
			});
		});
		
		if(results.length > 0){
			winston.info('Waiting on ID3 for new files');

			// Wait until all are parsed
			module.exports.once('filesParsed',function(){
				callback(parsed);
			});
		}else{
			winston.info('No new files');
			callback(parsed);
		}
	});
}

function addFile(filename,callback,userID)
{
	winston.info('Adding file ['+filename+']');

	// Allowed file extensions
	var extension = filename.split('.').pop();
	if(!extension.match(config.get('validExtensions'))){
		fs.unlinkSync(filename);
		callback(false);
		return;
	}

	api.getID3(filename,function(id3){
		if(!fs.existsSync(filename)) return;
		
		// Make sure this checks out, or delete (Yes, we're harsh)
		if(!validateID3(id3)){
			fs.unlinkSync(filename)
			winston.error('Invalid id3 information');
			winston.error(id3);
			callback(false);
			return;
		}
	
		var artist = safeDirectory(id3.comments.artist[0])
		  , album = safeDirectory(id3.comments.album[0])
		  , dir = path.resolve(config.files.music,artist+'/'+album)
		  , file = safeFile(path.basename(filename))
		  , moved = path.resolve(dir,file);

		// Make our directory
		if(!fs.existsSync(dir))
			mkdirp.sync(dir);

		// Already exists! Madness!
		if(fs.existsSync(moved)){
			fs.unlinkSync(filename);
			winston.error('Song already exists');
			//callback(false);
			//return;
		}else{
			// Move
			fs.renameSync(filename,moved);
		}

		// Create and Save
		var params = (userID) ? {filename:moved,UserID:userID} : {filename:moved};
		var song = db.Songs.findOrCreate(params).success(function(song){
			song.id3 = id3;

			module.exports.parseSong(song,function(){
				callback(song);
			});
		});
	});
}

function addCover(temp,file,album,artist,callback){
	var extension = file.split('.').pop()
	  , artist = safeDirectory(artist)
	  , album = safeDirectory(album)
	  , moved = path.resolve(config.files.music,artist+'/'+album+'/cover.'+extension)
	  , url = moved.replace(config.files.music,config.get('web_root')+'/music')
	  , thumb = path.resolve(config.files.music,artist+'/'+album+'/thumb.png')


	// Remove any existing thumbnail
	if(fs.existsSync(thumb))
		fs.unlinkSync(thumb);

	// Move
	fs.renameSync(temp,moved);

	url = url.replace('\\','/');
	callback(url);

	winston.info('Added new cover [' + url + ']');
}

function validateID3(id3)
{
	// Our required fields for this song to parse correctly
	if (id3 == null || id3.comments == null ||
		id3.comments.artist == null ||
		id3.comments.album == null ||
		id3.comments.title == null ||
		id3.playtime_seconds == null ||
		id3.playtime_seconds == 0 ||
		id3.playtime_string == null)
	{
		return false;
	}

	return true;
}

function safeDirectory(dir)
{
	return dir.replace(/[^a-zA-Z0-9_-\s\(\)!]+/g,'');
}

function safeFile(file)
{
	return file.replace(/[^a-zA-Z0-9_-\s\(\)\[\]&!\.]+/g,'');
}

var walk = function(dir, done) {
  var results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return done(err);
    var pending = list.length;
    if (!pending) return done(null, results);
    list.forEach(function(file) {
      file = dir + '/' + file;
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function(err, res) {
            results = results.concat(res);
            if (!--pending) done(null, results);
          });
        } else {
          results.push(file);
          if (!--pending) done(null, results);
        }
      });
    });
  });
};