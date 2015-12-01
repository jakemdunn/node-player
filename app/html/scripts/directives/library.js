app.directive('library',['$compile','$templateCache','LIBRARY_VIEW',function($compile,$templateCache,LIBRARY_VIEW){

	return {
		restrict: 'A',
		scope:{
			library:'=',
			layout:'='
		},
		templateUrl:'views/partials/library.html',
		link:function(scope,element,attributes){

			scope.filtered = [];
			scope.selectedIndex = false;
			scope.expandedIndex = false;

			scope.expandAlbum = function(song,event)
			{
				var album = [],
					id = song.id.replace(/[^\/]*$/,''),
					selectedIndex = $(event.target).parents('.album').index();

				// Collapse if open
				if(scope.selectedIndex === selectedIndex){
					scope.selectedIndex = false;
					scope.expandedIndex = false;
					scope.expanded = false;
					return;
				}
				scope.selectedIndex = selectedIndex;

				angular.forEach(scope.library, function(song, key) {
					if(song.id.indexOf(id) !== -1){
						album.push(song);
					}else if(album.length > 0){ // We've found all our album items
						return false;
					}
				});

				scope.expanded = album;

				setTimeout(function() {
					$(window).trigger('resize.library');
				}, 0);
			}

			scope.$watchGroup(['library','layout'],function(){

				// Filter our library
				if(scope.layout == LIBRARY_VIEW.album){
					// Only show the first song per album
					scope.filtered = [];

					var current = '';
					angular.forEach(scope.library, function(song, key) {
						var id = song.id.replace(/[^\/]*$/,'');
						if(current !== id){
							current = id;
							scope.filtered.push(song);
						}
					});
				}else{ // No filtering, just show them all
					scope.filtered = scope.library;
				}

				// Set the template
				element.html($templateCache.get(scope.layout));
            	$compile(element.contents())(scope);
			});

			// Expanded should be placed on the first newline after the clicked album
			$(window).on('resize.library',function(){
				if(scope.selectedIndex === false) return;

				// Figure out how many columns we currently have
				var $albums = $('.album-content'),
					columns = Math.round($(window).width() / $albums.first().width()),
					expandedIndex = 0;

				expandedIndex = scope.selectedIndex + (columns - (scope.selectedIndex % columns)) - 1;
				if(expandedIndex >= $albums.length) expandedIndex = $albums.length - 1;

				scope.$apply(function () {
					scope.expandedIndex = expandedIndex;
				});
			});

			scope.$on('$destroy', function(){
				$(window).off('resize.library');
			});
		}
	}
}]);

app.constant('LIBRARY_VIEW', {
	album: 'album-view',
	track: 'track-view'
});