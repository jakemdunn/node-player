jQuery(document).ready(function($){

	view.loggedIn.subscribe(function(value){
		if(value) setupUploader();
	});

	function setupUploader(){
		// Setup event listeners for on file drag
		$('#container').bind('dragenter dragexit dragleave dragend dragover drop',$.throttle( 250, dragEventHandler ));

		var uploader = new plupload.Uploader({
			runtimes : 'gears,html5,flash,silverlight,browserplus',
			browse_button : 'upload',
			container: 'upload-wrapper',
			drop_element: 'wrapper',
			max_file_size : '100mb',
			chunk_size : '100mb',
			url : '/upload',
			flash_swf_url : '/scripts/lib/plupload.flash.swf',
			silverlight_xap_url : '/scripts/lib/plupload.silverlight.xap',
			multipart_params:{
				'connect.sid':$.cookie('connect.sid')
			}
		});

		var $totalProgress = $('#upload-wrapper .total-progress');

		// Events
		uploader.bind('Error', function(uploader, error) {
			switch(error.code){
				case plupload.INIT_ERROR:
					showStatus('You have none of the necessary runtimes for uploading installed. Uploads are disabled.','');
					break;
				case plupload.FILE_SIZE_ERROR:
					showStatus('Maximum upload size is 100mb. What were you trying to upload?!?','');
					break;
				default:
					showStatus(error.message,'');
					break;
			}

			if(error.file) $('#'+error.file.id).stop().remove();
		});

		uploader.bind('BeforeUpload', function(uploader, file) {
			// Set the an album for this upload, if it's an image and dropped on an album cover
			if(file.name.match(/\.(m4a|mp3|ogg|oga|webma|wav)$/) && $intro.length > 0)
				uploader.settings.url = '/upload-entry?user='
					+ escape($intro.data('user'));
			else if(file.name.match(/\.(gif|jpg|jpeg|png)$/) && $cover.length > 0)
				uploader.settings.url = '/upload-cover?album='
					+ escape($cover.data('album'))
					+ '&artist='
					+ escape($cover.data('artist'));
			else
				uploader.settings.url = '/upload';
		});

		var layoutFiles = function(uploader)
		{
			for (var i in uploader.files) {
				var file = uploader.files[i],
					size = file.size / uploader.total.size * 100 + '%';
					$file = $('#'+file.id);
				$file.css({width:size});
			};
		}

		uploader.bind('FilesAdded', function(uploader, files) {
			for (var i in files) {
				$file = $('<li id="' + files[i].id + '" class="new"></li>').appendTo('#filelist').removeClass('new');
			}

			$cover.removeClass('dragged-over');
			layoutFiles(uploader);

	        setTimeout(function () { uploader.start(); }, 100);
		});

		uploader.bind('UploadProgress', function(uploader, file) {
			layoutFiles(uploader);

			if(uploader.total.percent < 100)
				$totalProgress.addClass('in-progress')
					.css({width:uploader.total.percent + '%'})
					.find('.percentage').text(uploader.total.percent);
		});

		uploader.bind('FileUploaded', function(uploader, file, response) {

			var json = $.parseJSON(response.response);
			if(!json){
				showStatus('Unknown response recieved from server.','');
				console.log(response);
			}else if(json.error){
				showStatus(json.error.message,'');
				console.log(response);
			}else if(json.result && json.result != ''){
				if (json.result.entry){
					$('input[data-user="'+json.result.entry.user+'"').val(json.result.entry.url).change();
				}
				if (json.result.coverUrl) {
					$('img[data-album="'+json.result.album+'"]').attr('src',json.result.coverUrl+"?cachebuster=Heyo");
				};
			}

			if(uploader.total.percent == 100){
				$totalProgress.removeClass('in-progress').css({width:0});
				$('#filelist').empty();
			}
		});

		uploader.init();
	}

	var $cover = $()
	  , $intro = $();
	function dragEventHandler(event)
	{
		switch(event.type){
			case 'dragenter':
			case 'dragover':
				$('body').addClass('dragged-over');
				$src = $(event.target);
				$cover.add($intro).removeClass('dragged-over');
				$cover = $src.filter('.cover');
				$intro = $src.filter('.intro');
				$cover.add($intro).addClass('dragged-over');
				break;
			case 'drop':
				$('body').removeClass('dragged-over');
				break;
			case 'dragexit':
			case 'dragleave':
			case 'dragend':
				$('body').removeClass('dragged-over');
				break;
		}
	}

});