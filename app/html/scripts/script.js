jQuery(document).ready(function($){

	// Action handlers -----------------------------------------------
	$('#login').submit(function(){
		// Request notification permissions
		if(Notification){
			Notification.requestPermission(function (perm) {
				if (perm == 'granted') {
					view.notificationsEnabled = true;
				}
			});
		}
		socket.emit('login',$('#user').val(),$('#pass').val());
		beginLoading('login','Logging In');
		return false;
	});

	$('#container').on('click','#skip-track',function(){
		socket.emit('skipTrack');
		beginLoading('playlistUpdate','Skipping');
		return false;
	});

	$('#container').on('click','.actions .toggle',function(){
		view.libraryOpen(!view.libraryOpen());
		$('#container').toggleClass('library-open');
		return false;
	});

	$('#container').on('click','.star',function(event){
		var $this = $(this)
		  , id = $this.parents('.stars').data('id')
		  , rating = $this.data('rating');

		// Send to server
		socket.emit('rateTrack',id,rating);
		event.stopPropagation();
		return false;
	});

	// Request user settings when shown
	view.actions.usersettings.subscribe(function(value){
		if(value) socket.emit('requestSettings');
	});

	// Request server logs when logs are shown
	view.actions.log.subscribe(function(value){
		if(value) socket.emit('requestLogs');
	});

	// And save them when we change them
	view.userSettings.subscribe(function(value){
		if(!value) return;

		// Send updates to server
	    ko.utils.arrayForEach(value, function(user) {
			ko.watch(user, {recurse: true}, function(params,property){
				var json = ko.toJSON(user);
				socket.emit('updateUser',json);
			});
	    });
	});
	$('#container').on('submit','form.search',function(event){
		// Blur our focus
		$('<input type="text"/>').appendTo('#container').focus().remove();
		return false;
	});

	// BUGFIX: We don't detect the 'clear' from html5 search clear
	$('#container').on('search','#search',function(event){
		view.search($("#search").val());
	});

	// Player Functions -----------------------------------------------

	// BUGFIX: Firefox isn't falling back to flash correctly
	// TODO: Flash first solution doesn't seek correctly always
	var is_firefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
	var solution = (is_firefox) ? 'flash, html' : 'html, flash';
	// Create the players
	$player = $("#player").jPlayer({
		swfPath: "/scripts/lib/Jplayer.swf",
		supplied:"m4a,oga,mp3,wav",
		cssSelectorAncestor:"#container",
		wmode:"window",
		solution:solution
	});
	$preloader = $('#player-preloader').jPlayer({
		swfPath: '/scripts/lib/Jplayer.swf',
		supplied:"m4a,oga,mp3,wav",
		cssSelectorAncestor:"#container",
		wmode:"window",
		solution:solution
	});

	// Our volume
	var volume = parseFloat($.cookie('volume'));
	if(typeof(volume) == 'undefined' || isNaN(volume) || volume == null) volume = 0;
	var enabled = volume != 0;

	view.loggedIn.subscribe(function(value){
		if(value){
			setTimeout(function(){
				$('#slider').slider({value:volume})
				.on('slide',function(event,ui){
					var cssClass = baseClass;
					volume = ui.value;
					$.cookie('volume',volume);
					if(ui.value > 90)
						cssClass += " full";
					else if(ui.value > 50)
						cssClass += " half";
					else if(ui.value > 25)
						cssClass += " low";
					else if(ui.value > 0)
						cssClass += " empty";
					else
						cssClass += " muted";

					$('#slider>.ui-slider-handle').attr('class',cssClass);
					$player.jPlayer("volume", ui.value / 100);
					if(!enabled || volume == 0 && enabled) playSong(view.currentSong());
				});

				var baseClass = $('#slider>a').attr('class');
				$('#slider')
					.append('<div class="bg"></div>')
					.trigger('slide',$('#slider').data().slider.options);
			},200);
		}
	});

	// Our progress
	var progressTimer
	  , lastPlayed
	  , nextPlayed
	  , duration;

	function trackProgress(){
		var elapsed = (ServerDate.now() - lastPlayed.getTime()) / 1000
		  , minutes = Math.floor(elapsed / 60)
		  , seconds = str_pad_left(Math.floor(elapsed % 60),'0',2)
		  , percent = (elapsed * 100000) / duration;

		$('#current-progress').css({
			width:percent + "%"
		});
		$('#current-timestamp').text(minutes + ":" + seconds);
	}


	// And currentSong changes
	view.currentSong.subscribe(function(value){
		if(value != false){
			var playtime = value.playtime_string().split(':'),
				minutes = playtime[0] * 60 * 1000,
				seconds = playtime[1] * 1000;

			duration = minutes + seconds;
			lastPlayed = new Date(value.lastPlayed());
			nextPlayed = new Date(lastPlayed.getTime() + duration);


			displayNotification('Now Playing',
				'"' + value.title() + '" by "' + value.artist() + '"',
				value.thumbImage(),
				'now-playing'
				);

			if(!progressTimer) progressTimer = setInterval(trackProgress,1000/32);
		}else
			clearInterval(progressTimer);

		playSong(value);
	});

	function playSong(song){
		if(song == false || volume == 0){ // Nothing in the list
			$player.jPlayer('clearMedia');
			enabled = false;
			return;
		}

		enabled = true;

		var url = song.url()
		  , ext = url.split('.').pop()
		  , elapsed = ServerDate.now() - lastPlayed.getTime()
		  , params = {};

		params[ext] = url;

		$preloader.jPlayer('clearMedia');
		$player
			.jPlayer('setMedia',params)
			.jPlayer('play',elapsed / 1000);
	}

	// Preloading
	$player.on($.jPlayer.event.canplaythrough,function(){
		if(view.playlist.length < 2 || volume == 0) return;
		
		var url = view.playlist()[1].url()
		  , ext = url.split('.').pop()
		  , params = {};

		params[ext] = url;
		$preloader.jPlayer("setMedia",params).jPlayer("play").jPlayer("stop"); 
	});
});

function str_pad_left(string,pad,length){ return (new Array(length+1).join(pad)+string).slice(-length); }