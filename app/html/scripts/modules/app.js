var app = angular.module( 'musicApp', [
		'ngCookies',
		'ngPouch',
		'ngRoute',
		'btford.socket-io',
		'angular-duration-format',
	])
	.config(['$routeProvider','$locationProvider','USER_ROLES',function($routeProvider,$locationProvider,USER_ROLES){
		$routeProvider

			.when('/', {
				templateUrl : 'views/pages/home.html',
				controller  : 'HomeController',
				data: {
					authorizedRoles: [USER_ROLES.user,USER_ROLES.admin]
				}
			})

			.when('/login', {
				templateUrl : 'views/pages/login.html',
				controller  : 'LoginController'
			})

			.when('/log', {
				templateUrl : 'views/pages/log.html',
				controller  : 'LogController',
				data: {
					authorizedRoles: [USER_ROLES.user,USER_ROLES.admin]
				}
			})

			.otherwise({
				redirectTo: '/login'
			});

		// use the HTML5 History API
		$locationProvider.html5Mode(true);
	}])
	.run(['$rootScope','$cookies','ngPouch','AuthService','AUTH_EVENTS',function ($rootScope,$cookies,ngPouch,AuthService,AUTH_EVENTS) {

		// Setup Pouch once we're authenticated
		$rootScope.$on(AUTH_EVENTS.loginSuccess,function(event,user){
			$cookies['AuthSession'] = user.session;

			ngPouch.saveSettings({
				database:'http://localhost:5984/songs',
				stayConnected:true
			});

			ngPouch.init();
		});

		// Initiate our Authentication
		AuthService.init();
	}]);