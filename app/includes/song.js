var fs   = require('fs')
  , pouch = require('./pouch.js')
  , path = require('path')
  , mkdirp = require('mkdirp')
  , taglib = require('taglib')
  , id3 = require('id3js')
  , mp4 = require('mp4js')
  , winston = require('winston')
  , util = require('util')
  , Promise = require('promise')
  , appUtil = require('./appUtil.js')
  , config  = require('./config.js');

module.exports = function(song){

	var _this = this
	  , library = require('./library.js');

	if(song._id) song._id = song._id.replace(config.files.music,'');

	_this.save = function(){
		return pouch.songs.put(_this.extend(_this,{}))
			.then(function(){
				return _this.load();
			});
	}

	_this.load = function(){
		return pouch.songs.get(_this._id)
			.then(function (song) {
				_this.extend(song);
				return Promise.resolve(_this);
			});
	}

	_this.destroy = function(){
		_this._deleted = true;
		return pouch.songs.put(_this.extend(_this,{}));
	}

	_this.validate = function(){
		if(!fs.existsSync(_this.filename)) return Promise.reject(new Error('File does not exist ['+_this._id+']'));
		return _this.isMissingFields()
			.then(function(missing,fields){
				if(missing)
					return _this.setup();

				return Promise.resolve();
			});
	}

	_this.setup = function(){ return new Promise(function (resolve, reject){
		// Allowed file extensions
		var extension = _this.filename.split('.').pop();
		if(!extension.match(config.get('validExtensions'))){
			reject(new Error('Invalid file format'));
			return;
		}

		_this.getID3()
			.then(function(){

				// File paths and URLs
				_this.origin = _this.filename;
				_this.path = path.resolve('/'+library.safeDirectory(_this.artist),library.safeDirectory(_this.album));
				_this.dir = path.resolve(config.files.music,_this.path.replace(/^\//,''));
				_this.file = library.safeFile(path.basename(_this.filename));
				_this.filename = path.resolve(_this.dir,_this.file);
				_this.url = _this.filename.replace(config.files.music,config.web_root+'/music');
				_this.url = _this.url.replace('\\','/');
				_this.lastPlayed = _this.lastPlayed || false;

				// Basic properties
				_this._id = path.resolve(_this.path,_this.file);
				_this.coverImage = config.web_root + '/cover' + _this.path;
				_this.thumbImage = config.web_root + '/thumb' + _this.path;
				_this.download   = config.web_root + '/download' + _this.path;
				_this.setRating();

				// Make sure all properties were set correctly
				return _this.assertRequiredFields();
			})
			.then(function(){
				return _this.moveToCorrectDir();
			})
			.then(function(){
				resolve();
			})
			.catch(function(error){
				reject(error);
			});
	});}

	// Move to the correct dir automatically
	_this.moveToCorrectDir = function(){ return new Promise(function (resolve, reject){

		if(!_this.hasOwnProperty('origin')){
			reject(new Error('origin must be set as a property'));
			return;
		}

		// This is a temporary variable
		var origin = _this.origin;
		delete _this.origin;

		// Already moved
		if(_this.filename == origin){
			resolve();
			return;
		}

		// Already exists! Madness!
		if(fs.existsSync(_this.filename)){
			reject(new Error('File already exists'));
			return;
		}

		// Make our directory
		if(!fs.existsSync(_this.dir)){
			winston.info('Creating directory [' + _this.dir + ']');
			mkdirp.sync(_this.dir);
		}

		fs.renameSync(origin,_this.filename);

		resolve();
	});}

	_this.getID3 = function(){ return new Promise(function (resolve, reject){
		taglib.read(_this.filename, function(error, tag, props) {

			if(error){
				reject(error);
				return;
			}

			_this.extend(tag);
			_this.extend(props);

			if(_this.filename.match(/\.m4a$/))
				mp4({ file: _this.filename, type: 'local' }, function(error, tags) {
					if(error){
						reject(error);
						return;
					}
					_this.extend(_this,tags);
					resolve();
				});
			else
				id3({ file: _this.filename, type: id3.OPEN_LOCAL }, function(error, tags) {
					if(error){
						reject(error);
						return;
					}
					_this.extend(_this,tags);
					resolve();
				});
		});
	});}

	// Checks for required parameters
	_this.assertRequiredFields = function(){
		return _this.isMissingFields()
			.then(function(missing,fields){
				if(missing)
					return Promise.reject(new Error('Param(s) [' + fields.join(',') + '] are not defined.'));
				return Promise.resolve();
			});
	}

	_this.isMissingFields = function(){
		var params = ['_id','url','ratings','lastPlayed','coverImage','thumbImage','download','artist','album','title','track','length'];
		var missingFields = [];

		for (var index in params) {
			var prop = params[index];
			if(!_this.hasOwnProperty(prop) || _this[prop] == null){
				missingFields.push(prop);
			}
		};

		return Promise.resolve(missingFields.length > 0, missingFields);
	}

	// Synchronous Code - mainly utility methods
	_this.setRating = function()
	{
		if(_this.ratings == null) _this.ratings = [];
		if(_this.ratings.length > 0){
			var average = 0;
			_this.ratings.forEach(function(rating){
				average += rating.rating;
			});
			_this.rating = Math.round(average / _this.ratings.length);
		}else{
			_this.rating = 3;
		}
	}

	_this.extend = function(obj,target) {
		target = target || _this;
		return appUtil.extend(target,obj);
    };

	_this.extend(song);
}