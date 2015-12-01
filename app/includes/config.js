var os = require("os")
  , winston = require('winston')
  , argv = require('optimist').argv
  , fs        = require('fs')
  , path      = require('path')
  , options = [
		{
	  		hostname:/^(.*\.local)$/,
			web_root:'http://localhost:3000',
			port 	: 3000,
			secret	:'.6t+La`Oz}PCJp8Akpb&.8lsPJ<gOde{er!Z.|yh31?yTJnF/r=O~`Ai!1C?;j4<',
			db_name :'phenom_player',
			db_user :'root',
			db_pass :'root',
			db_host :'127.0.0.1',
			db_port :'3306',
			log 	:'logs/log.txt',
			timezone:'America/Chicago',
			validExtensions:/^(m4a|mp3|ogg|oga|webma|wav)$/,
			verbose:true,
			googleSearch:'https://www.googleapis.com/customsearch/v1',
			googleSearchID:'006207592909902448948:athgktuuj48',
			googleKey:'AIzaSyADyzBtsCIc43FzJNuodK9E_1agCruaamc',
			validate:false,
			ngrokToken:'2vXBSOB73hNgxEWOor/X',
			ngrokSubdomain:'phenomblue-music-server',
			slackAPIToken:'xoxb-4356217552-Z8J9m0WY1rGvDTVAXqi1j3AY',
			slackCommandToken:'rQ390l1tyc48Rw9E71P9yJ3W',
			files:{
				upload:path.join(path.dirname(require.main.filename),'../uploads'),
				music:path.join(path.dirname(require.main.filename),'music'),
				tmp:path.join(path.dirname(require.main.filename),'../tmp'),
				entry:path.join(path.dirname(require.main.filename),'../entry')
			},
			staticUsers:{
				omaha:'1x5lAaH030!m',
				la:'F^Lgr2EE#q5y'
			}
		},
		{
			hostname:/^(ProdWeb03|prod-web03)$/,
			web_root:'http://music.phenomblue.com:3000',
			port 	: 3000,
			secret	:'.6t+La`Oz}PCJp8Akpb&.8lsPJ<gOde{er!Z.|yh31?yTJnF/r=O~`Ai!1C?;j4<',
			db_name :'phenom_player',
			db_user :'webuser',
			db_pass :'phenomblue!00',
			db_host :'172.24.3.18',
			db_port :'3306',
			log 	:'log.txt',
			timezone:'America/Chicago',
			validExtensions:/^(m4a|mp3|ogg|oga|webma|wav)$/,
			verbose:false,
			googleSearch:'https://www.googleapis.com/customsearch/v1',
			googleSearchID:'006207592909902448948:athgktuuj48',
			googleKey:'AIzaSyADyzBtsCIc43FzJNuodK9E_1agCruaamc',
			validate:false,
			ngrokToken:'2vXBSOB73hNgxEWOor/X',
			ngrokSubdomain:'phenomblue-music-server',
			slackAPIToken:'xoxb-4356217552-Z8J9m0WY1rGvDTVAXqi1j3AY',
			slackCommandToken:'rQ390l1tyc48Rw9E71P9yJ3W',
			files:{
				upload:'/mnt/sdb1/uploads',
				music:'/mnt/sdb1/music',
				tmp:'/mnt/sdb1/tmp',
				entry:'/mnt/sdb1/entry'
			},
			staticUsers:{
				omaha:'1x5lAaH030!m',
				la:'F^Lgr2EE#q5y'
			}
		}
	]
  , hostname = os.hostname()
  , config;

// Which environment are we using?
options.forEach(function(option){
	if (hostname.match(option.hostname)){
		config = option;
		return false;
	};
});

// Not found
if(config == null){
	winston.error('No options set for host['+hostname+']');
	throw new Error('No options set for host['+hostname+']');
}

// Some optional command line arguments
if(argv.q) config.verbose = false;
if(argv.v) config.verbose = true;
if(argv.r) config.validate = true;
if(argv.log) config.log = argv.log;

// Configure our logging
winston.add(winston.transports.File, {filename:config.log,maxsize:5242880}); //Max size = 5mb
if(!config.verbose){
	winston.remove(winston.transports.Console);
	winston.add(winston.transports.Console, {level:'error'});
}else{
	winston.remove(winston.transports.Console);
	winston.add(winston.transports.Console, {colorize:true});
}

// Configure our Timezone
process.env.TZ = config.timezone;

// Make it public
module.exports = config;
module.exports.get = function(option){
	return config[option];
}