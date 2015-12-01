app.controller( 'HomeController', ['$scope', '$q', 'ngPouch', 'LIBRARY_VIEW', function HomeController ( $scope, $q, ngPouch, LIBRARY_VIEW ) {

	$scope.songs;
	$scope.maxTracksShown = 50; // Number of songs we display in track view
	$scope.ngPouch = ngPouch;
	$scope.viewType = LIBRARY_VIEW.track;

	$scope.filter = function(doc){
		if(!doc['_id'].match(/^_/)) emit(doc._id.replace(/^\/(A|The) /, '/'));
	}
	
	$scope.refreshSongs = function(){

		return ngPouch.db
			.query($scope.filter,{include_docs:true})
			.then( function(results) {
				
				// If we have greater than $scope.maxTracksShown results, switch to album view
				$scope.viewType = (results.total_rows > $scope.maxTracksShown)
					? LIBRARY_VIEW.album
					: LIBRARY_VIEW.track;

				$scope.songs = results["rows"];
			});
	}

	// Refresh on changes from the server
	ngPouch.publish(function(){
		return $q.all($scope.refreshSongs());
	});
}]);