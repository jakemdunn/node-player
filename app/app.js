// Dependancies
var http      = require('http')
  , connect   = require('connect')
  , express   = require('express')
  , app       = express()
  , server    = http.createServer(app)
  , io        = require('socket.io').listen(server)
  , sio       = require('session.socket.io')
  , fs        = require('fs')
  , path      = require('path')
  , watch     = require('watch')
  , winston   = require('winston')
  , util 	  = require('util')
  , api       = require('./includes/api.js')
  , users     = require('./includes/users.js')
  , library   = require('./includes/library.js')
  , player    = require('./includes/player.js')
  , config    = require('./includes/config.js')
  , db        = require('./includes/db.js')
  , session   = require('./includes/session.js')
  , pages     = require('./includes/pages.js');

io.set('log level', 1); // reduce logging
winston.info('Launching Phenomblue Player');

// Our session storage
var cookieParser = express.cookieParser(config.get('secret'))
  , sessionStore = new connect.middleware.session.MemoryStore()
  , sessionSockets = new sio(io,sessionStore,cookieParser);

// Configure and load the server
app.setMaxListeners(0);
app.configure(function () {
	app.use(cookieParser);
	app.use(express.session({ store: sessionStore }));
	app.use(express.bodyParser({uploadDir:config.files.tmp}));
});
server.listen(config.get('port'),function(){
	winston.info('Server running on port ['+server.address().port+']');
});

// Initialize users
users.init(io);

// Initialize our socket/session handling
session.init(sessionSockets,users);

// Initialize our page handling
pages.init(app,users);

var apiReady = false, dbReady = false;
function init(){
	if(!apiReady || !dbReady) return;

	// Load Library	
	library.loadMusic(function(channels,songs){
	winston.info('['+channels.length+"] channels loaded.");
	winston.info('['+songs.length+"] songs loaded.");

	// Start Player
	player.setChannels(channels);
		player.setLibrary(songs,function(){
			winston.info('Launch Complete');
		});
	});

	// Watch for uploads
	var prevUploads = [] // Watch for duplicate upload calls
	  , prevClearTimeout;
	watch.watchTree(config.files.upload, function (file, curr, prev) {
		// A new file
		if (prev === null && curr !== null && prevUploads.indexOf(file) == -1) {
			if(curr.isDirectory() || !fs.existsSync(file)) return;
			prevUploads.push(file);
			winston.info('File uploaded ['+file+']');
			library.addFile(file);
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

// Boot API
api.boot();
api.on('ready',function(){
	apiReady = true;
	init();
});

// Watch for DB ready
db.on('ready',function(){
	dbReady = true;
	init();
});

process.on('exit',function(){ // TODO: listen for SIGINT event, instead. Have a "quit" command?
	api.shutdown();
});

// Some last-ditch error handling...doesn't work so well
// process.on('uncaughtException',function(err){
//   console.log(clc.red('   Caught exception: ' + err));
//   api.shutdown();
//   console.log(clc.red('   Press CTRL+C and reload'));
// });