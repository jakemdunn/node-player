app.controller( 'LoginController', ['$scope', 'AuthService', function LoginController ( $scope, AuthService ) {
	$scope.credentials = {
		username: '',
		password: ''
	};

	$scope.login = function (credentials) {
		AuthService.login(credentials.username,credentials.password);
	};
}]);