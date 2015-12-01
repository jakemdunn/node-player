var config 	  = require('./config.js')
  , winston = require('winston')
  , EventEmitter = require('events').EventEmitter
  , Sequelize = require('sequelize-mysql').sequelize
  , mysql     = require('sequelize-mysql').mysql;

var sequelize = new Sequelize(config.get('db_name'),config.get('db_user'),config.get('db_pass'),{
	host:config.get('db_host'),
	port:config.get('db_port'),
  	logging: false,
	dialect:'mysql'
});

module.exports = new EventEmitter();

// Define our models
module.exports.Songs = sequelize.define('Songs',{
	filename:Sequelize.STRING,
	lastPlayed:Sequelize.DATE,
	id3:Sequelize.TEXT
});

module.exports.Rating = sequelize.define('Rating',{
	rating:Sequelize.INTEGER
});

module.exports.User = sequelize.define('User',{
	username:Sequelize.STRING,
	badgeID:Sequelize.STRING,
	introSong:Sequelize.STRING,
	firstName:Sequelize.STRING,
	lastName:Sequelize.STRING,
	level:Sequelize.INTEGER
});

module.exports.Channel = sequelize.define('Channel',{
	name:Sequelize.STRING
});

module.exports.Rating.belongsTo(module.exports.Songs);
module.exports.Songs.hasMany(module.exports.Rating);
module.exports.Songs.hasMany(module.exports.Channel);
module.exports.Channel.hasMany(module.exports.Songs);
module.exports.User.hasMany(module.exports.Rating);
module.exports.User.hasMany(module.exports.Songs);

// Sync
// module.exports.User.sync({force: true});
sequelize.sync().success(function() {
	winston.info('Database Loaded');
	module.exports.emit('ready');
}).error(function(error) {
	winston.error('Database Failure: ['+error+']');
	module.exports.emit('failure');
})