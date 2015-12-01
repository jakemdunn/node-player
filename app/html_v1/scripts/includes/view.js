// Our View Model
function ViewModel(){
	this.updatingFromServer = true;
	this.username = ko.observable('');
	this.loggedIn = ko.observable(false);
	this.channels = ko.observableArray([]);
	this.library = ko.observableArray([]);
	this.libraryOpen = ko.observable(false);
	this.playlist = ko.observableArray([]);
	this.channel = ko.observable(false);
	this.currentSong = ko.observable(false);
	this.loading = ko.observableArray([]);
	this.status = ko.observableArray([]);
	this.search = ko.observable('');
	this.sorted = ko.observableArray([]);
	this.found = ko.observableArray([]);
	this.foundLimit = ko.observable(100);
	this.foundUnlisted = ko.observable(0);
	this.albumDetail = ko.observable(false);
	this.log = ko.observableArray([]);
	this.users = ko.observableArray([]);
	this.userSettings = ko.observableArray([]);
	this.cardScans = ko.observableArray([]);
	this.serverLogs = ko.observableArray([]);
	this.notificationsEnabled = null;

	// Some optional actions via the search field
	this.actions = {
		log: ko.observable(false),
		xmarksthespot: ko.observable(false),
		enabledelete: ko.observable(false),
		usersettings: ko.observable(false),
		airhorn: ko.observable(false),
	};

	// Return the actual object for the selected ID
	this.selectedChannel = ko.computed(function(){
		for (var i = this.channels().length - 1; i >= 0; i--) {
			if(this.channels()[i].id == this.channel()) return this.channels()[i];
		};
		return null;
	},this);

	// Animation callbacks
	this.addListItem = function(elem) {
		if (elem.nodeType === 1)
			$(elem).hide().slideDown('100');
	}
	this.removeListItem = function(elem) {
		if (elem.nodeType === 1)
			$(elem).slideUp('100',function() { $(elem).remove(); });
	}

	// Album Detail
	this.detailSelected = null;
	this.showAlbumDetail = function(album,event)
	{
		var $target = $(event.currentTarget),
			$currentDetail = $('#current-detail'),
			$albums = $target.parent().children(':not(#current-detail)'),
			columns = Math.floor($albums.parent().width() / $albums.first().width()),
			index = $albums.index($target),
			insertAfter = index + (columns - (index % columns)) - 1;
		
		if(insertAfter >= $albums.length) insertAfter = $albums.length - 1;
		var $insertAfter = $albums.eq(insertAfter);

		view.albumDetail(album);

		if($currentDetail.length > 0) $currentDetail.slideUp(200,function(){
			$(this).remove();
		});

		// Collapse if current
		if(view.detailSelected == index){
			view.detailSelected = null;
			return;
		}
		view.detailSelected = index;

		$currentDetail = $('#album-detail').clone().attr('id','current-detail');
		$currentDetail.insertAfter($insertAfter).hide().slideDown(200);
	}

	this.reloadLogs = function()
	{
		socket.emit('requestLogs');
	}

	this.download = function(album,event)
	{
		window.open(album.download());
	}
}

var view = new ViewModel();
ko.applyBindings(view);

// Subscribe to playlist changes
view.playlist.subscribe(function(value){
	setTimeout(function(){
		$(document).trigger('update-playlist'); // Updates our playlist
	},200);

	if(value.length == 0)
		view.currentSong(false);
	else if(view.currentSong() == false || view.currentSong().id() != value[0].id())
		view.currentSong(value[0]);
});

// Helper CSS classes
view.loggedIn.subscribe(function(value){
	if(value) $('#container').addClass('logged-in');
	else $('#container').removeClass('logged-in');
});

view.library.subscribe($.throttle( 2500, updateSorted ));
view.library.subscribe($.throttle( 2000, updateFound ));
view.search.subscribe($.throttle( 500, updateFound ));

// Subscribe library updates,
// Update the list of songs
function updateSorted()
{
	// Hide any expanded album
	view.albumDetail(false);
	view.detailSelected = null;

	var sorted = sortedList(view.library())

	ko.mapping.fromJS({sorted:sorted},{},view);
}

// Subscribe to search or sorted updates,
// and update our found albums
function updateFound()
{
	// Parse search query
	var query = view.search()
	  , queryParameter = /^[^:]+(?=:)/.exec(query);

	query = query.replace(/^[^:]+:/,'');
	view.foundUnlisted(0);

	if(query == ''){
		view.found([]);
		return;
	}

	// A regex
	if(/^\?/.test(query)){
		try{
			query = new RegExp(query.replace(/^\?/,''),'i');
		}catch(error){
			query = new RegExp($.ui.autocomplete.escapeRegex(query),'i');
		}
	// Trying for an action
	}else if(/^\@/.test(query)){
		var action = query.substring(1);
		if(typeof view.actions[action] != 'undefined'){
			view.actions[action](!view.actions[action]());
			view.search('');
		}
		return;
	// Want an exact match
	}else if(/^".*"$/.test(query)){
		query = query.replace(/(^"|"$)/g,'');
		query = new RegExp('^'+$.ui.autocomplete.escapeRegex(query)+'$','i');
	}else{
		query = new RegExp($.ui.autocomplete.escapeRegex(query),'i');
	}

	var found = ko.utils.arrayFilter(view.library(), function(song) {
		// Apply search query, and populate suggestions
		if(queryParameter) return query.test(song[queryParameter[0]]);
		return (query.test(song.artist) || query.test(song.album) || query.test(song.title));
	});

	if(found.length > view.foundLimit()){
		view.foundUnlisted(found.length - view.foundLimit());
		found = found.slice(0,view.foundLimit());
	}

	ko.mapping.fromJS({found:sortedList(found)},{},view);
}


// Sorts our flat array into artist/album/song objects in arrays
function sortedList(list){
	// Sort into albums
	var albums = {};
	$.each(list, function(key,song) {
		var album = song.album;
		if(album.match(/^greatest hits$/i)) album += ' - ' + song.artist;
		if(albums[album] == null) albums[album] = [];
		albums[album].push(song);
	});

	// Sort into artists
	var associated = {};
	$.each(albums, function(album,songs) {
		var artist = songs[0].artist;
		if(associated[artist] == null) associated[artist] = {};
		associated[artist][album] = songs;
	});
	delete albums;

	// Move from associative arrays into an actual array
	var sorted = [];
	$.each(associated, function(artist,albums) {

		var albumsArray = [];
		$.each(albums, function(album,songs) {
			var albumObject = {
				artist:artist,
				album:album,
				songs:songs
			};

			if(songs[0].coverImage != null)
				albumObject['coverImage'] = songs[0].coverImage;

			albumsArray.push(albumObject);
		});

		sorted.push({
			artist:artist,
			albums:albumsArray
		});
	});
	delete associated;

	// Sort alphebetically, then by track

	// Sorting artists
	var noThe = /^the\s/i;
	sorted.sort(function(a,b){
		var a = a.artist.replace(noThe,''),
			b = b.artist.replace(noThe,'');

		if(a<b) return -1;
		if(a>b) return 1;
		return 0;
	});

	// Sorting albums
	$.each(sorted,function(key,artist){
		artist.albums.sort(function(a,b){
			if(a.album<b.album) return -1;
			if(a.album>b.album) return 1;
			return 0;
		});

		// Sorting tracks
		$.each(artist.albums,function(key,album){
			album.songs.sort(function(a,b){
				return a.trackNumber - b.trackNumber;
			});
		});
	});

	return sorted;
}