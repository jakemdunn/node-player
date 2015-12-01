var player = require('./player.js')
  , library = require('./library')
  , api = require('./api.js')
  , config = require('./config.js')
  , browserify = require('browserify-middleware')
  , easyimg = require('easyimage')
  , path = require('path')
  , util = require('util')
  , glob = require('glob')
  , request = require('request')
  , formidable = require('formidable')
  , mime = require('mime')
  , fs = require('fs')
  , winston = require('winston')
  , spawn = require('child_process').spawn;

module.exports.init = function(app,users){

	var basePath = path.dirname(require.main.filename);
	var oneYear = 31557600;

	// Routing handled by angular should redirect to the index.html
	fs.readdir(basePath + '/html/views/pages',function(err,files){
		var pages = [];
		files.forEach(function(file,index,files) {
			pages.push(file.replace(/\..*/,''));
		});

		pages = new RegExp('^/('+pages.join('|')+')');
		app.get(pages,function(req,res){
			res.sendfile(basePath + '/html/index.html');
		});
	});

	// User entry
	app.get(/^\/user-entry\/([^\/]*)\/(.*)$/,function(req,res){
		var office = req.params[0]
		  , badgeID = req.params[1];

		users.entered(office,badgeID);
		res.send(200,'Entry tracked');
	});

	// Assets
	// app.get(/^\/(css|images|scripts|pages)\/(.*)$/,function(req,res){
	// 	res.sendfile(basePath + '/html/' + req.params[0] + '/' + req.params[1]);
	// });

	// app.get('/favicon.ico',function(req,res){
	// 	res.sendfile(basePath + '/html/favicon.ico');
	// });

	// Streaming Files
	app.get(/^\/(entry|music)\/(.+)$/,function(req,res){
		if(!users.loggedIn(req.session)){
			send403(res);
			return;
		}

		// Setup some caching
		res.sendfile(config.files[req.params[0]] + '/' + req.params[1],{root:'/',maxAge:oneYear});
	});

	// Album Covers
	app.get(/^\/cover\/([^\/]+)\/(.+)$/,function(req,res){
		if(!users.loggedIn(req.session)){
			send403(res);
			return;
		}

		var artist = library.safeDirectory(decodeURIComponent(req.params[0]))
		  , album = library.safeDirectory(decodeURIComponent(req.params[1]))
		  , dir = path.resolve(config.files.music,artist+'/'+album)

		if(!fs.existsSync(dir)){
			send404(res);
			return;
		}

		sendCover(res,dir);
	});

	app.get(/^\/thumb\/([^\/]+)\/(.+)$/,function(req,res){
		if(!users.loggedIn(req.session)){
			send403(res);
			return;
		}

		var artist = library.safeDirectory(decodeURIComponent(req.params[0]))
		  , album = library.safeDirectory(decodeURIComponent(req.params[1]))
		  , dir = path.resolve(config.files.music,artist+'/'+album)

		if(!fs.existsSync(dir)){
			send404(res);
			return;
		}

		sendThumb(res,dir);
	});

	// SShhhhhh
	app.get(/^\/download\/([^\/]+)\/(.+)$/,function(req,res){
		if(!users.loggedIn(req.session)){
			send403(res);
			return;
		}

		var artist = library.safeDirectory(decodeURIComponent(req.params[0]))
		  , album = library.safeDirectory(decodeURIComponent(req.params[1]))
		  , dir = path.resolve(config.files.music,artist+'/'+album)

		if(!fs.existsSync(dir)){
			send404(res);
			return;
		}

		// Options -r recursive -j ignore directory info - redirect to stdout
		var zip = spawn('zip', ['-rj', '-', dir]);

		res.contentType('zip');

		// Keep writing stdout to res
		zip.stdout.on('data', function (data) {
			res.write(data);
		});

		zip.stderr.on('data', function (data) {
			// Uncomment to see the files being added
			//console.log('zip stderr: ' + data);
		});

		// End the response on zip exit
		zip.on('exit', function (code) {
			if(code !== 0) {
				res.statusCode = 500;
				console.log('zip process exited with code ' + code);
				res.end();
			} else {
				res.end();
			}
		});
	})

	var sendThumb = function(res,dir)
	{
		glob(dir+"/thumb.png", {nocase:true}, function (er, files) {

			// We have a thumbnail
			if(files.length > 0){
				var filename = path.resolve(dir,files[0]);
				res.setHeader('Cache-Control', 'public, max-age=' + oneYear);
				res.sendfile(filename);

				// Setup some caching
				return;
			}

			sendCover(res,dir);
		});

	}

	var sendCover = function(res,dir)
	{
		glob(dir+"/cover.{png,jpg,jpeg,gif}", {nocase:true}, function (er, files) {
			if(files.length > 0){
				var filename = path.resolve(dir,files[0]);
				res.sendfile(filename);
				createThumb(dir,filename);
			}else{
				files = fs.readdirSync(dir);
				if(files.length > 0){
					var filename = path.resolve(dir,files[0]),
						song;

					library.getSong(filename)
						.then(function(loaded){
							song = loaded;
							return song.getID3();
						})
						.then(function(){
							//TODO: See if it's embedded in the ID3
							res.sendfile(basePath + '/html/images/missing-album.jpg');
							// Search for our image on google
							findCover(dir,song);
						})
						.catch(function(error){
							error.outputToLog();
						});

					// api.getImageData(filename,function(data,mimeType){
					// 	if(data){
					// 		data = new Buffer(data, 'base64').toString('binary');
					// 		res.writeHead(200, {'Content-Type': mimeType});
					// 		res.end(data,'binary');

					// 		// Save to folder for caching 
					// 		var extension = mime.extension(mimeType),
					// 			newImage = path.resolve(dir,'cover.'+extension);

					// 		fs.writeFile(newImage,data, 'binary',function(error){
					// 			if(error)
					// 				winston.error('Error storing ID3 cover image ['+util.inspect(error)+']');
					// 			else
					// 				createThumb(dir,newImage);
					// 		});
					// 	}else{
					// 	}
					// });

				}else{
					send404(res);
				}
			}
		});
	};

	// For use in creating a new thumb
	var createThumb = function(dir,filename)
	{
		var thumb = dir+"/thumb.png";

		if(fs.existsSync(thumb)) return;

		easyimg.thumbnail({
			src:filename,
			dst:thumb,
			fill:true,
			width:179,height:179
		},function(error,image){
			if(error) winston.error('Error resizing image: '+util.inspect(error));
			winston.info('cropped image['+filename+']');
		});
	}

	var searched = [];
	var findCover = function(dir,song)
	{
		if(searched.indexOf(dir) != -1) return;
		searched.push(dir);

		var query = [];

		query.push('q=' + encodeURIComponent(song.artist + ' ' + song.album + ' album artwork'));
		query.push('imgSize=large');
		query.push('num=1');
		query.push('safe=medium');
		query.push('searchType=image');
		query.push('key='+config.googleKey);
		query.push('cx='+config.googleSearchID);

		var url = config.googleSearch + '?' + query.join('&');

		winston.info('Finding image with query [' + url + ']');

		request(url,function(error,response,body){
			if(error || response.statusCode != 200){
				winston.error('Issues getting ['+url+'] returned status code of ['+response.statusCode+']');
				winston.error(util.inspect(error));
				winston.error(util.inspect(body));
				return;
			}
			var json = JSON.parse(body);

			if(json.items && json.items.length > 0){
				var url = json.items[0].link
				  , mimeType = json.items[0].mime

				downloadCover(url,mimeType,dir);
			}else{
				winston.info('Unable to find cover in google search:');
				winston.info(util.inspect(json));
			}
		});
	}

	var downloadCover = function(url,mimeType,dir)
	{
		var extension = mime.extension(mimeType),
			newImage = path.resolve(dir,'cover.'+extension);

		request(url).pipe(fs.createWriteStream(newImage));
		winston.info('Googled image saved as [' + newImage + ']');
	}

	// UPLOAD

	app.post('/upload',function(req, res){
		winston.info('uploading file');

		var src = req.files.file.path
			dst = path.join(config.files.upload,req.files.file.name);

		fs.renameSync(src,dst);

		res.send(200,JSON.stringify({
			result:{
				name:req.files.file.name
			}
		}));
	});

	app.post('/upload-entry',function(req, res){
		winston.info('uploading entry file');

		var src = req.files.file.path
			dst = path.join(config.files.entry,req.files.file.name);

		fs.renameSync(src,dst);

		res.send(200,JSON.stringify({
			result:{
				entry:{
					url:config.web_root + '/entry/' + req.files.file.name,
					user:req.query.user
				}
			}
		}));
	});

	app.post('/upload-cover',function(req, res){
		winston.info('uploading cover');
		
		library.addCover(req.files.file.path,req.files.file.name,req.query.album,req.query.artist,function(url,error){
			if(url){
				res.send(200,{
					result:{
						coverUrl:url,
						album:req.query.album,
						artist:req.query.artist
					}
				});
			}else{
				res.send(200,JSON.stringify({
					error:{
						message:util.inspect(error)
					}
				}));
			}
		});
	});

	// Timing
	app.get("/serverdate.js", function(req, res){
		var file = path.resolve(path.dirname(require.main.filename),'node_modules/serverdate/lib/ServerDate.js');
		fs.readFile(file, 'utf8', function (err, data) {
			var now = Date.now();

			if (err)
				res.status(500);
			else {
				if (req.query.time) {
					res.set("Content-Type", "application/json");
					res.json(now);
				}
				else {
					res.set("Content-Type", "text/javascript");
					res.send(data + "(" + now + ");\n");
				}
			}
		});
	});
	// Request Library
	// app.get('/music',function(req,res){
	// 	if(!users.loggedIn(req.session)){
	// 		res.send(403, 'Sorry! you can\'t see that.');
	// 		return;
	// 	}

	// 	res.writeHead(200, { 'Content-Type': 'application/json' });
	// 	var data = {
	// 		library:player.library()
	// 	}
	//     res.write(JSON.stringify(data));
	//   	res.end();
	// });
}

function send404(res)
{
	res.send(404,'Not Found');
}

function send403(res)
{
	res.send(403, 'Sorry! you can\'t see that.');
}