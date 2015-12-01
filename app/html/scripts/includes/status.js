function showStatus(message,icon)
{
	view.status.push({
		message:message,
		icon:icon
	});

	var timestamp = new Date();
	view.log.unshift({
		message:message,
		icon:icon,
		timestamp:timestamp.toISOString()
	});

	setTimeout(function(){
		view.status.shift();
	},5000);
}

function beginLoading(id,message)
{
	if(isLoading(id)) return;
	view.loading.push({
		id:id,
		message:message
	});
}

function endLoading(id)
{
	view.loading.remove(function(item) {
		return item.id == id;
	});
}

function isLoading(id)
{
	return ko.utils.arrayFirst(view.loading(), function(item) {
        return item.id == id;
    }) != null;
}

function displayNotification(title,body,icon,tag)
{
	if(view.notificationsEnabled === false || document.hasFocus() || !Notification) return;

	var options = {
		tag: 'music-player',
		icon: '/images/icon.png'
	}

	if(typeof body !== "undefined" && body) options.body = body;
	if(typeof icon !== "undefined" && icon) options.icon = icon;
	if(typeof tag !== "undefined" && tag) options.tag = tag;
	
	try {
		var notification = new Notification(title,options);

	} catch (exception){
		view.notificationsEnabled = false;
		console.log(exception);
		return;
		// Browser does not support notifications
	}

	notification.onclick = function(event) {
		window.focus();
		this.close();
	};

	try{ // For older versions of chrome
		notification.show();	
	}catch(exception){}

	setTimeout(function(){
		notification.close();
	},6000)
}