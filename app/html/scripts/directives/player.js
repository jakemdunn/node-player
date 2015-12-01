app.directive('player',['$compile','$templateCache','socket',function($compile,$templateCache,socket){

	return {
		restrict: 'A',
		scope:{
			player:'='
		},
		templateUrl:'views/partials/player.html',
		link:function(scope,element,attributes){
			socket.on('playerUpdate',function(params){
				console.log(params);
			});
		}
	}
}]);