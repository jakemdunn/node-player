var fs = require('fs')
  , EventEmitter = require('events').EventEmitter
  , watch = require('watch')
  , path = require('path')
  , ProgressBar = require('progress')
  , winston = require('winston')
  , util = require('util')
  , crypto = require('crypto')
  , glob = require('glob')
  , Promise = require('promise')
  , pouch = require('./pouch.js')
  , config	= require('./config.js')
  , Song = require('./song.js');

util.inherits(Library, EventEmitter);
module.exports = new Library();

function Library(){

	var _this = this;

	_this.getSong = function(id){
		var song = new Song({_id:id});
		return song.load();
	}

	_this.getSongs = function(query){
		// Load our music from couch
		return pouch.songs.allDocs(query)
			.then(function(results){
				results.rows.forEach(function(song,index,songs){
					songs[index] = new Song(song.doc);
				});
				return Promise.resolve(results);
	 		});
	}

	_this.setupUploads = function(){
		return _this
			.scanForNew()
			.then(function(){
				_this.watchForUploads();
				return Promise.resolve();
			});
	}

	_this.watchForUploads = function(){

		// Watch for uploads
		var prevUploads = [] // Watch for duplicate upload calls
		  , prevClearTimeout;

		watch.watchTree(config.files.upload, function (file, curr, prev) {
			// A new file
			if (prev === null && curr !== null && prevUploads.indexOf(file) == -1) {
				if(curr.isDirectory() || !fs.existsSync(file)) return;
				prevUploads.push(file);
				winston.info('File uploaded ['+file+']');
				_this.addFile(file)
					.catch(function(error){
						// If we have an error while adding, remove
						// fs.unlinkSync(filename);
						error.outputToLog();
						callback(false);
					});
			}

			// Clear our duplicate check after 10 seconds
			clearTimeout(prevClearTimeout);
			prevClearTimeout = setTimeout(function(){
				//console.log(clc.blackBright('   Clearing array of previous uploads'));
				prevUploads = [];
				// TODO: Delete all folders in uploads directory, as they should be emtpy
			},10000);
		});
	}

	_this.scanForNew = function(songs){

		winston.info('Scanning for new files...');

		var walk = Promise.denodeify(_this.walk);
		return walk(config.files.upload)
			.then(function(results){
				if(results.length == 0){
					winston.info('No new files');
					Promise.resolve();
					return;
				}

				winston.info('['+results.length+'] new files found');
				for(var index in results){
					results[index] = _this.addFile(results[index])
						.then(function(){
							_this.trackProgress('Adding Files',results.length);
							return Promise.resolve();
						});
				}
				return Promise.all(results);
			})
			.then(function(results){
				_this.trackProgress(false);
				winston.info('Files Parsed');
				return Promise.resolve();
			});
	}

	_this.validate = function(options){
		if(!config.validate)
			return Promise.resolve();

		options = options || {limit:100,include_docs: true,endkey:'_'};

		return _this
			.getSongs(options)
			.then(function(results){

				if(results.rows.length == 0){
					_this.trackProgress(false);
					winston.info('Finished validating files');
					return Promise.resolve();
				}

				options.startkey = results.rows[results.rows.length - 1]._id;
				options.skip = 1;

				results.rows.forEach(function(song,index,songs) {
					songs[index] = song.validate()
						.then(function(){
							return song.save();
						})
						.then(function(){
							_this.trackProgress('Validating Files',results.total_rows);
							return Promise.resolve();
						})
				});

				return Promise.all(results.rows)
					.then(function(){
						return _this.validate(options);
					});
			});
	}

	_this.bar = false;
	_this.trackProgress = function(title,total)
	{
		if(!config.verbose) return;
		if(!title){
			if(_this.bar){
				console.log('\n');
				_this.bar = false;
			}
			return;
		}

		if(!_this.bar){
			_this.bar = new ProgressBar(title + ': [:bar] :percent :etas', {
					complete: '='
					, incomplete: ' '
					, width: 60
					, total: total
				});
		}
		_this.bar.tick();
	}


	_this.addFile = function(filename,callback,userID)
	{
		winston.info('Adding file ['+filename+']');

		var song = new Song({filename:filename});

		return song.setup()
			.then(function(){
				return song.save();
			})
			.then(function(){
				module.exports.emit('songAdded',song);
				return Promise.resolve(song);
			});
	}

	_this.addCover = function(temp,file,album,artist,callback){
		if(temp == null || file == null || album == null || artist == null) return;

		var extension = file.split('.').pop()
			, artist = _this.safeDirectory(artist)
			, album = _this.safeDirectory(album)
			, moved = path.resolve(config.files.music,artist+'/'+album+'/cover.'+extension)
			, url = moved.replace(config.files.music,config.get('web_root')+'/music').replace('\\','/')
			, thumb = path.resolve(config.files.music,artist+'/'+album+'/thumb.png')


		// Remove any existing thumbnail
		if(fs.existsSync(thumb))
			fs.unlinkSync(thumb);

		// Move
		fs.renameSync(temp,moved);

		module.exports.emit('coverAdded',coverURL);
		winston.info('Added new cover [' + url + ']');

		callback(url);
	}

	_this.safeDirectory = function(dir)
	{
		return dir.replace(/[^a-zA-Z0-9_-\s\(\)!]+/g,'');
	}

	_this.safeFile = function(file)
	{
		return file.replace(/[^a-zA-Z0-9_-\s\(\)\[\]&!\.]+/g,'');
	}

	_this.walk = function(dir, done) {
		var results = [];
		fs.readdir(dir, function(err, list) {
			if (err) return done(err);
			var pending = list.length;
			if (!pending) return done(null, results);
			list.forEach(function(file) {
				file = dir + '/' + file;
				fs.stat(file, function(err, stat) {
					if (stat && stat.isDirectory()) {
						_this.walk(file, function(err, res) {
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
}