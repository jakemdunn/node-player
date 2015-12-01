app.factory('socket', ['socketFactory',function (socketFactory) {

	return socketFactory({
		ioSocket: io.connect('/')
	});
}]);