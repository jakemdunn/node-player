var winston = require('winston');

module.exports = new Util();

function Util()
{
	var _this = this;
	_this.extend = function(target,obj) {

		for (var prop in obj) {
			if (obj.hasOwnProperty(prop) && typeof(obj[prop]) !== 'function')
				target[prop] = obj[prop];
		}
		return target;
    };
}

Error.prototype.outputToLog = function() {
	var output = 'Unknown error occured';

	if (this.message){
		output = this.message
	}
	
	if (this.stack) {
		output += '\n=====================';
		output += '\n' + this.stack;
	}

	winston.error(output);
}