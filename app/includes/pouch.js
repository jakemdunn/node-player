var PouchDB = require('pouchdb')
  , Promise = require('promise')
  , winston = require('winston')
  , util = require('util')
  , requestify = require('requestify')
  , EventEmitter = require('events').EventEmitter
  , appUtil = require('./appUtil.js');

PouchDB.plugin(require('pouchdb-upsert'));

module.exports = new Pouch();

function Pouch()
{
	var _this = this;

	_this.songs = new PouchDB('http://root:phenomblue!00@localhost:5984/songs');
	_this.users = new PouchDB('http://root:phenomblue!00@localhost:5984/_users');

	_this.updateUser = function(name,pass,roles)
	{
		var user = {
			_id: 'org.couchdb.user:'+name,
			name: name,
			type: 'user',
			roles: ['user']
		}

		return _this.users.upsert(user._id,function(currentUser){
				appUtil.extend(user,currentUser);
				
				if(roles) user.roles = roles;
				if(pass) user.password = pass;

				return user;
			})
			.then(function(result){
				user._rev = result.rev;
				return _this.generateSessionToken(user,pass);
			});
	}

	_this.generateSessionToken = function(user,pass)
	{
		// Already have a session token, or no password
		if(user.session || !pass) return Promise.resolve(user);

		return requestify.post('http://localhost:5984/_session', {
				name: user.name,
				password: pass
			},{
				dataType:'form-url-encoded',
				auth:{ username: user.name, password: pass }
			})
			.then(function(response) {
				var json = JSON.parse(response.getBody()),
					cookie = response.headers['set-cookie'][0].match(/AuthSession=([^;]*)/)[1];

				if(!json.ok || !cookie)
					throw new Error('Unable to get session data');

				user.session = cookie;

				return _this.users.put(user);
			})
			.then(function(result){
				user._rev = result.rev;
				return Promise.resolve(user);
			});
	}

	_this.getUser = function(name)
	{
		if(!name.match('^org.couchdb.user:')) name = 'org.couchdb.user:' + name;
		
		return new Promise(function(resolve,reject){
			_this.users.get(name)
				.then(function(user){
					resolve(user);
				})
				.catch(function (error) {
					reject(new Error('User does not exist'));
				});

		});
	}

	_this.setupIndex = function(db,name,map,overwrite)
	{
		overwrite = overwrite || false;
		map = (typeof map == 'string') ? map : map.toString();

		var index = {
			_id: '_design/'+name,
			views: {}
		};

		index.views[name] = {
			map: map
		};

		return new Promise(function(resolve,reject){
			db.get(index._id).then(function(currentIndex){
				if(overwrite === true){ // Trigger our catch, place our changes
					index._rev = currentIndex._rev;
					return Promise.reject();
				}else{
					resolve(); // Do nothing, it exists
				}
			}).catch(function(error){ // Create it
				db.put(index).then(function () {
					// kick off an initial build, return immediately
					return db.query(name, {stale: 'update_after'});
				}).then(function () {
					resolve();
				}).catch(function (error) {
					reject(error);
				});
			});
		});
	}
}