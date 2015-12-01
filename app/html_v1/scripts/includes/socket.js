
// Socket Methods  -----------------------------------------------

// Connect to our socket server
var socket = io.connect(document.URL);

// Socket status handlers
socket.on('connect', function () {
	endLoading('socket-connecting');
});
socket.on('connecting', function () {
	beginLoading('socket-connecting','Connecting to Server');
});
socket.on('disconnect', function () {
	showStatus('Disconnected from server','');
});
socket.on('connect_failed', function () {
	showStatus('Cannot connect to server','');
});
socket.on('error', function () {
	showStatus('Socket.io failure','');
});
socket.on('reconnect_failed', function () {
	showStatus('Cannot reconnect to server','');
});
socket.on('reconnect', function () {
	endLoading('socket-connecting');
	showStatus('Reconnected','');
});
socket.on('reconnecting', function () {
	beginLoading('socket-connecting','Reconnecting to Server');
});
socket.on('refreshRequired',function(){
	showStatus('Session Lost. Page refresh required...','');
	setTimeout(function(){
		document.location.reload(true);
	},1000);
});
socket.on('users', function (params) {
	view.users(params.users);
});
socket.on('userSettings', function (params) {
	params.userSettings.sort(function(a,b){
		if(a.username<b.username) return -1;
		if(a.username>b.username) return 1;
		return 0;
	});
	ko.mapping.fromJS({userSettings:params.userSettings},{},view);
});
socket.on('cardScans', function (params) {
	ko.mapping.fromJS({cardScans:params.scans},{},view);
});
socket.on('logs', function (params) {
	ko.mapping.fromJS({serverLogs:params.logs.file},{},view);
});
socket.on('userEntered', function (params) {
	var message = readableUserName(params.user) + ' entered the ' + params.office + ' office';
	showStatus(message,'');
	displayNotification(readableUserName(params.user),'has entered the ' + params.office + ' office',false,'user-entry');
});
socket.on('userConnected', function (user) {
	showStatus(user + ' connected','');
	view.users.push(user);
});
socket.on('userDisconnected', function (user) {
	showStatus(user + ' disconnected','');
	view.users.splice(view.users.indexOf(user),1);
});

socket.on('airhornRequest', function (user,status) {
	showStatus(status,'');
});

// Playlist updates
socket.on('playlistUpdate',function(params){
	endLoading('playlistUpdate');
	view.updatingFromServer = true;
	ko.mapping.fromJS({playlist:params.playlist},{},view);
	view.channel(params.channel);
	if(typeof view.channel() == 'undefined') // BUGFIX: This becomes undefined?!?
		view.channel = ko.observable(params.channel);
	view.updatingFromServer = false;
});

socket.on('channelsUpdate',function(params){
	endLoading('channelsUpdate');
	view.updatingFromServer = true;
	view.channels([{id:'',value:''}].concat(params.channels));
	view.updatingFromServer = false;
});

socket.on('songAdded',function(params){
	view.library.push(params.song);
});

socket.on('userInserted',function(params){
	showStatus(params.user + ' inserted ' + params.ids.length + ' song' + (params.ids.length > 1 ? 's' : ''),'');
	selectIDS(params.ids,params.user);
});

socket.on('userMoved',function(params){
	showStatus(params.user + ' moved ' + params.ids.length + ' song' + (params.ids.length > 1 ? 's' : ''),'');
	selectIDS(params.ids,params.user);
});

socket.on('userSkipped',function(params){
	showStatus(params.user + ' skipped "' + params.song.title + '" by "' + params.song.artist + '"','');
	displayNotification(params.user + ' Skipped a Song',
		params.user + ' skipped "' + params.song.title + '" by "' + params.song.artist + '"',
		params.song.thumbImage
		);
});

socket.on('userRemoved',function(params){
	showStatus(params.user + ' removed ' + params.ids.length + ' song' + (params.ids.length > 1 ? 's' : ''),'');
});

socket.on('userDeleted',function(params){
	showStatus(params.user + ' deleted ' + params.ids.length + ' song' + (params.ids.length > 1 ? 's' : ''),'');

	// Remove from the library
	view.library(ko.utils.arrayFilter(view.library(), function(song) {
		return (params.ids.indexOf(song.id) == -1)
	}));
});

// Library Updates
socket.on('libraryDownload',function(params){
	view.updatingFromServer = true;
	view.library(params.library);
	view.updatingFromServer = false;
	endLoading('library');
});

// Rating Updates
socket.on('ratingUpdate',function(params){
	var $stars = $('.stars[data-id="'+params.id+'"]');

	// Apply to currently visible
	$stars.attr('class','stars rated-'+params.rating);

	// Apply to model
	var song = ko.utils.arrayFirst(view.library(), function(song) {
        return song.id == params.id;
    });
    song.rating = params.rating;

    // Notify
    var ratingMessage;
    switch(params.userRating){
    	case 1:
    		ratingMessage = 'a dismal 1. Booooo.';
    		break;
    	case 2:
    		ratingMessage = 'a meagre 2.';
    		break;
    	case 3:
    		ratingMessage = 'an average 3.';
    		break;
    	case 4:
    		ratingMessage = 'a solid 4.';
    		break;
    	case 5:
    		ratingMessage = 'as a bit TOO good, at 5.';
    		break;
    }
	showStatus(params.user + ' rated "' + song.title + '" by "' + song.artist + '" ' + ratingMessage,'');

	displayNotification(params.user + ' Rated a Song',
		params.user + ' rated "' + song.title + '" by "' + song.artist + '" ' + ratingMessage,
		song.thumbImage
		);
});

// Login
socket.on('loginStatus',function(loggedIn,username){
	view.loggedIn(loggedIn)
		.username(username);

	if(view.loggedIn()){
		beginLoading('library','Loading Library');
	}else{
		if(isLoading('login'))
			showStatus('Incorrect username or password','');
		else
			showStatus('Login required','');
	}

	endLoading('login');
});

socket.on('userDenied', function (params) {
	if(params.user.username != view.username()) return;
	showStatus(params.message,'');
});

function readableUserName(user){
	if(user.firstName && user.lastName)
		return user.firstName + ' ' + user.lastName;
	return user.username;
}