app.controller( 'ApplicationController', ['$scope',function ApplicationController ( $scope ) {
	
	// Font sizing
	$('body').flowtype({
		minimum		: 500,
		maximum		: 1000,
		minFont		: 10,
		fontRatio	: 71.428571429 // For base font of 14px at 1000px wide (1000/14)
	});
}]);