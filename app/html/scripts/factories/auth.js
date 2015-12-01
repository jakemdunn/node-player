app.factory('AuthService', ['socket','$rootScope','$location','AUTH_EVENTS',function (socket,$rootScope,$location,AUTH_EVENTS) {

	function AuthService(){
		var _this = this;

		_this.authenticated = false;
		_this.user = null;
 
		_this.login = function (user,pass) {
			socket.emit('login',user,pass);
		};

		_this.logout = function() {
			socket.emit('logout');
		};
	 
		_this.isAuthenticated = function () {
			return _this.authenticated;
		};
	 
		_this.isAuthorized = function (authorizedRoles) {
			if (!angular.isArray(authorizedRoles)) {
				authorizedRoles = [authorizedRoles];
			}
			return (_this.isAuthenticated() && authorizedRoles.some(function (role) {
				return _this.user.roles.indexOf(role) >= 0;
			}));
		};

		_this.init = function() {

			// Listen for events from our socket connection
			socket.on('loginStatus',function(authenticated,user){

				_this.authenticated = authenticated;
				_this.user = user;

				if(authenticated){
					$rootScope.$broadcast(AUTH_EVENTS.loginSuccess,_this.user);

					// Redirect if we were authenticating a requested url
					if(_this.redirect){
						$location.path(_this.redirect);
						_this.redirect = null;
					}else if($location.path() == '/login'){
						$location.path('/');
					}
				}else{
					$rootScope.$broadcast(AUTH_EVENTS.loginFailed);
					$location.path('/login');
				}
			});

			socket.on('userDenied', function (params) {
				if(params.user.name != _this.user.name) return;

				$rootScope.$broadcast(AUTH_EVENTS.notAuthorized);
			});

			// Handle authentication on route changes
			$rootScope.$on('$routeChangeStart', function (event,next,current) {

				// Access to this route isn't restricted
				if(!next.data || !next.data.authorizedRoles) return;

				var authorizedRoles = next.data.authorizedRoles;
				if (!_this.isAuthorized(authorizedRoles)) {
					event.preventDefault();
					if (_this.isAuthenticated()) {
						// user is not allowed
						$rootScope.$broadcast(AUTH_EVENTS.notAuthorized);
					} else {
						// user is not logged in
						$rootScope.$broadcast(AUTH_EVENTS.notAuthenticated);
						$location.path( '/login' );
						_this.redirect = next.originalPath;
					}
				}
			});
		}
	}

	return new AuthService();
}]);

app.constant('AUTH_EVENTS', {
	loginSuccess: 'auth-login-success',
	loginFailed: 'auth-login-failed',
	logoutSuccess: 'auth-logout-success',
	sessionTimeout: 'auth-session-timeout',
	notAuthenticated: 'auth-not-authenticated',
	notAuthorized: 'auth-not-authorized'
});

app.constant('USER_ROLES', {
	all: '*',
	admin: 'admin',
	user: 'user'
})