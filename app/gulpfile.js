// Gulpfile.js 
var gulp = require('gulp')
  , path = require('path')
  , merge = require('merge-stream')
  , fs = require('fs')
  , plumber = require('gulp-plumber')
  , notify = require('gulp-notify')
  , concat = require('gulp-concat')
  , uglify = require('gulp-uglify')
  , nodemon = require('gulp-nodemon')
  , jshint = require('gulp-jshint')
  , sass = require('gulp-sass')
  , ts = require('gulp-typescript')
  , postcss = require('gulp-postcss')
  , combineMq = require('gulp-combine-mq')
  , autoprefixer = require('autoprefixer-core')
  , sourcemaps	 = require('gulp-sourcemaps')
  , livereload = require('gulp-livereload');
 
gulp.task('lint', function () {
	return gulp.src('./**/*.js')
		.pipe(jshint())
});

var scriptsPath = './html/scripts';
gulp.task('scripts',function(){
	var folders = getFolders(scriptsPath);
	var tasks = folders.map(function(folder) {
		return gulp.src(path.join(scriptsPath, folder, '/*.js'))
			.pipe(plumber({errorHandler: notify.onError("Script Error: <%= error.message %> Line: <%= error.lineNumber %>")}))
			.pipe(sourcemaps.init())
			// .pipe(ts())
			.pipe(concat(folder + '.js'))
			.pipe(uglify())
			.pipe(sourcemaps.write('./'))
			.pipe(gulp.dest(scriptsPath))
			.pipe(livereload());
	});

	return merge(tasks);
});

gulp.task('css', function () {
	return gulp.src('./html/sass/*.scss')
		.pipe(plumber({errorHandler: notify.onError("CSS Error: <%= error.message %> Line: <%= error.lineNumber %>")}))
		.pipe(sourcemaps.init())
		.pipe(sass())
		.pipe(combineMq({beautify: false}))
		.pipe(postcss([ autoprefixer({ browsers: ['last 2 version'] }) ]))
		.pipe(sourcemaps.write('./'))
		.pipe(gulp.dest('./html/css'))
		.pipe(livereload());
});
 
gulp.task('default', ['css','scripts'], function () {

	livereload.listen();

	// Watch for CSS changes
	gulp.watch(['html/sass/**'], ['css']);

	// Watch for Script changes
	gulp.watch(['html/scripts/*/**.js'], ['scripts']);

	// Start our app and watch for changes
	return nodemon({ script: 'app.js', ext: 'html js', ignore: ['html/*'] })
		// .on('change', ['lint'])
		.on('restart', function () {
			console.log('restarted!');
		});
});

function getFolders(dir) {
	return fs.readdirSync(dir)
		.filter(function(file) {
			return fs.statSync(path.join(dir, file)).isDirectory();
		});
}