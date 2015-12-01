// Dependancies
var http	= require('http')
  , connect	= require('connect')
  , express	= require('express')
  , app		= express()
  , server	= http.createServer(app)
  , io		= require('socket.io').listen(server)
  , sio		= require('session.socket.io')
  , fs		= require('fs')
  , path	= require('path')
  , winston	= require('winston')
  , util 	= require('util')
  , Promise = require('promise')
  , users	= require('./includes/users.js')
  , library	= require('./includes/library.js')
  , Player	= require('./includes/player.js')
  , config	= require('./includes/config.js')
  , session	= require('./includes/session.js')
  , pages	= require('./includes/pages.js')
  , slack	= require('./includes/slack.js')
  , appUtil	= require('./includes/appUtil.js');

io.set('log level', 1); // reduce logging
winston.info('Launching Phenomblue Player');

// Our session storage
var cookieParser = express.cookieParser(config.get('secret'))
  , sessionStore = new connect.middleware.session.MemoryStore()
  , sessionSockets = new sio(io,sessionStore,cookieParser);

// Configure and load the server
app.setMaxListeners(0);
app.use(cookieParser);
app.use(express.session({ store: sessionStore, secret: config.get('secret') }));
app.use(express.bodyParser({uploadDir:config.files.tmp}));
app.use(express.static(__dirname+'/html'));
server.listen(config.get('port'),function(){
	winston.info('Server running on port ['+server.address().port+']');
});

// Initialize users
users.init(io);

// Initialize our socket/session handling
session.init(sessionSockets,users);

// Initialize our page handling
pages.init(app,users);

var players = [false,'cafe'];

// Initiate the app
library.validate()
	.then(function(){
		return library.setupUploads();
	})
	.then(function(){
		for(var index in players){
			players[index] = new Player(players[index]);
			players[index].setup();
		};
		return Promise.all(players);
	})
	.then(function(){
		return slack.setup(app);
	})
	.then(function(){
		winston.info('Setup complete');
	})
	.catch(function(error){
		error.outputToLog();
	});


// Boot API
// api.boot();
// api.on('ready',function(){
// 	apiReady = true;
// 	init();
// });

// Watch for DB ready
// db.on('ready',function(){
// 	dbReady = true;
// 	init();
// });

// process.on('exit',function(){ // TODO: listen for SIGINT event, instead. Have a "quit" command?
// 	api.shutdown();
// });

// Some last-ditch error handling...doesn't work so well
// process.on('uncaughtException',function(err){
//	 console.log(clc.red('	 Caught exception: ' + err));
//	 api.shutdown();
//	 console.log(clc.red('	 Press CTRL+C and reload'));
// });