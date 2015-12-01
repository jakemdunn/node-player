(function ($) {
	// Live versions of our UI methods - we have a lot of DOM modification going on
	$.fn.liveDraggable = function (selector,opts) {
		this.on('mousemove',selector+':not(.ui-draggable)',function(){
			$(this).draggable(opts);
		}).disableSelection();;
		return this;
	};
	$.fn.liveDroppable = function (selector,opts) {
		var $this = this;
		$this.on('mousemove',selector+':not(.ui-droppable)',function(){
			$(this).droppable(opts);
		});
		$(document).on('update-playlist',function(){
			$(selector+':not(.ui-droppable)',$this).droppable(opts);
		}).trigger('update-playlist');
		return this;
	};
	$.fn.liveSortable = function (selector,opts) {
		var $this = this;
		$this.on('mousemove',selector+':not(.ui-sortable)',function(){
			$(this).sortable(opts).disableSelection();;
		});
		$(document).on('update-playlist',function(){
			$(selector+':not(.ui-droppable)',$this).sortable(opts).disableSelection();;
		}).trigger('update-playlist');
		return this;
	};
	$.fn.liveAutocomplete = function (selector,opts) {
		var $this = this;
		$this.on('focus',selector+':not(.ui-autocomplete-input)',function(){
			$(this).libcomplete(opts);
		}).enableSelection();
		return $this;
	};
	$.fn.showDialog = function(options) {
		var defaults = {
			title:'Alert',
			modal: true,
			resizable: false,
			draggable: false,
			text: 'No text given...',
			buttons:{
				Cancel: function(){
					$(this).dialog('close');
				}
			}
		};

		options = $.extend({}, defaults, options);

		var $dialog = $('<div/>',{
			'class':'dialog',
			'title':options.title
		}).append($('<p/>',{
			'text':options.text
		})).appendTo($(this))
		.dialog(options);

		return $dialog;
	}

	// Our customizations to autocomplete
	$.widget('custom.libcomplete', $.ui.autocomplete, {
		_renderMenu: function( ul, items ) {
			var $list = this
			  , currentCat = ''
			  , maxPerCat = 5
			  , curForCat = 0;

			$.each( items, function( index, item ) {
				if ( item.category != currentCat ) {
					if(currentCat != '' && curForCat > maxPerCat){
						ul.append( "<li class='overflow'>And " + (curForCat - maxPerCat) + " others</li>" );
					}

					ul.append( "<li class='ui-autocomplete-category'>" + item.category + "</li>" );
					currentCat = item.category;
					curForCat = 0;
				}

				if(curForCat <= maxPerCat){
					$list._renderItem( ul, item );
				}
				curForCat++;
			});

			if(currentCat != '' && curForCat > maxPerCat){
				ul.append( "<li class='overflow'>And " + (curForCat - maxPerCat) + " others</li>" );
			}
			if($('#help-tips',ul).length == 0)
				ul.append($('#help-tips').clone());
		}
	});

	// Our help
	$('body').on('click','#help-tips pre',function(){
		view.search($(this).text());
		$('#search').libcomplete('close');
	});
}(jQuery));

function selectIDS(ids,user){
	// To select our just inserted elements
	$ = jQuery;
	if(user == view.username()) $('.selected').removeClass('selected')
	else if($('.selected').length > 0) return;
	$('.playlist>li').each(function(){
		if(ids.indexOf($(this).data('id')) != -1){
			$(this).addClass('selected');
		}
	});
}

jQuery(document).ready(function($){

	setupSelection('.song');
	setupSelection('.playlist>li');
	setupDragging();
	setupDeletion();
	setupSortable();
	setupChannels();
	setupAutocomplete();

	function setupAutocomplete(){
		var onUpdate = function(){
			view.search($("#search").val());
		}
		$('#container').liveAutocomplete('#search',{
			source:function(term,response){
				var items = []
				  , artists = []
				  , albums = []
				  , query = term.term;

				query = query.replace(/^[^:]+:/,'');
				if(/^\?/.test(query)){
					try{
						query = new RegExp(query.replace(/^\?/,''),'i');
					}catch(error){
						query = new RegExp($.ui.autocomplete.escapeRegex(query),'i');
					}
				}else if(/^\@/.test(query)){
					response([]);
					return;
				// Want an exact match
				}else if(/^".*"$/.test(query)){
					query = query.replace(/(^"|"$)/g,'');
					query = new RegExp('^'+$.ui.autocomplete.escapeRegex(query)+'$','i');
				}else{
					query = new RegExp($.ui.autocomplete.escapeRegex(query),'i');
				}
				
				ko.utils.arrayForEach(view.library(), function(song) {
					if(song.title.match(query))
						items.push({label:song.artist + ": " + song.title,value:'title:"'+song.title+'"',category:'Songs'});
					if(song.artist.match(query) && artists.indexOf(song.artist) == -1)
						artists.push(song.artist);
					if(song.album.match(query) && albums.indexOf(song.album) == -1)
						albums.push(song.album);
				});

				ko.utils.arrayForEach(artists, function(artist) {
					items.push({label:artist,value:'artist:"'+artist+'"',category:'Artists'});
				});

				ko.utils.arrayForEach(albums, function(album) {
					items.push({label:album,value:'album:"'+album+'"',category:'Albums'});
				});

				response(items);
			},
			appendTo:'#search-form',
			change:onUpdate,
			close:onUpdate
		});
	}

	function setupChannels(){
		// Update our channels list
		var channelsParams = {
				allow_single_deselect:true,
				no_results_text:'<input type="submit" value="Add a new channel!" id="add-new"/>'
			},
			updateChannels = function(){
				var $select = $('.channels select');
				$select.hide();
				if(view.libraryOpen()) setTimeout(function(){
					$select.chosen(channelsParams).trigger("liszt:updated");
				},200);
			}

		view.channel.subscribe(updateChannels);
		view.channels.subscribe(updateChannels);
		view.libraryOpen.subscribe(updateChannels);

		$('#container').on('click keyup','.chzn-drop input',function(event){
			if(event.keyCode != 13 && event.type != 'click') return;

			var newChannel = $('.chzn-drop input').val();
			if(newChannel == '') return;

			socket.emit('addChannel',newChannel);
			beginLoading('channelsUpdate','Adding channel');
			return false;
		});

		$('#container').on('change','.channels select',function(){
			if(view.updatingFromServer) return;
			var channel = view.channel();
			socket.emit('setChannel',channel);
			beginLoading('playlistUpdate','Changing channel');
		});
	}

	function setupDragging(){

		$('#container').liveDroppable('.playlist>li',{
			hoverClass:'dragged-over',
			scope: "library",
			drop:function(event,ui){
				var $listItem = $(this);

				// Get our insert info
				var index = $listItem.index(),
					selectedIDs = [];

				$('.song.selected').each(function(){
					selectedIDs.push($(this).data('id'));
				});

				socket.emit('insertTracks',index,selectedIDs);
				beginLoading('playlistUpdate','Inserting Tracks');
			}
		});

		$('#container').liveDraggable('.song',{
			appendTo:'body',
			cursor: "move",
			scope: "library",
			cursorAt: { top: 35, left: -5 },
			helper: function(event) {
				var $selected = $('.song.selected'),
					$helper = $('<div class="drag-helper"></div>')
					channel = (typeof view.selectedChannel().name == 'undefined') ? 'all' : view.selectedChannel().name;
				$helper.text('Inserting ' + $selected.length + ' song' + ($selected.length > 1 ? 's' : '') + ' into "' + channel + '"');
				return $helper;
			},
			stop:function(event,ui){
			}
		});
	}

	function setupSortable()
	{
		$('#container').liveSortable('.playlist',{
			axis:'y',
			placeholder:'sortable-placeholder',
			distance:15,
			//containment:'parent',
			helper:function(event,$element){
				var $helper = $('<li/>',{class:'helper'}),
					primaryOffset = $element.offset(),
					scrollOffset = $(window).scrollTop();

				$helper.css({
					width:$element.outerWidth(),
					height:$element.outerHeight()
				});

				var offset = 5;
				$('.playlist>li.selected').each(function(){
					var $this = $(this),
						$clone = $this.clone();

					$clone.css({
						position:'absolute',
						top:$this.offset().top - scrollOffset,
						left:0,
						width:$this.width()
					}).show();

					if(this == $element[0]){
						$clone.addClass('primary');
					}else{
						$clone.animate({
							top:primaryOffset.top - offset - scrollOffset,
							left:offset,
							width:$this.width() - offset * 2,
							opacity:1-(offset/100)
						},200);
						offset += 5;
					}

					$helper.append($clone);
				});

				$('.playlist>li.selected').hide();
				
				return $helper;
			},
			beforeStop:function(event,ui){
				var $placeholder = $('.playlist>*.sortable-placeholder'),
					$selected = $('.playlist>li.selected');
				$selected.remove().insertAfter($placeholder).show();

				// Get our insert info
				var index = $placeholder.index(),
					ids = [];

				$selected.each(function(){
					ids.push($(this).data('id'));
				});

				socket.emit('moveTracks',index,ids);
				beginLoading('playlistUpdate','Moving Tracks');
			}
		});
	}

	function setupSelection(selector){
		var $lastSelected,hasFocus = false;

		var takeFocus = function(){
			if(hasFocus) return;
			$('html').trigger('click.deselect');
			hasFocus = true;
		}

		$('#container').on('click.selectable',selector,function(event){
			if($(event.target).is('a')) //Don't hande link clicks
            	return true;

            // So we can have multiple lists
            takeFocus();

            // Wish we could just cache this, but it's in flux
            var $songs = $(selector);

            // add selected class to group draggable objects
            if(event.ctrlKey || event.metaKey){ // Keep the last selected object's state, toggle the current one
            	$(this).toggleClass('selected');
            }else if(event.shiftKey && $lastSelected != null){ // Select everything between this and the last
            	var lastIndex = $songs.index($lastSelected),
            		currIndex = $songs.index($(this));
            	if(lastIndex < currIndex){
					$songs.filter(':gt('+lastIndex+')').filter(':lt('+(currIndex-lastIndex)+')').addClass('selected');
            	}else{
					$songs.filter(':gt('+currIndex+')').filter(':lt('+(lastIndex-currIndex)+')').addClass('selected');
            	}
            	$(this).addClass('selected');
            }else{ //Just this one
            	$songs.removeClass('selected');
            	$(this).addClass('selected');
            }
            $lastSelected = $(this);

           	return false;
		}).on('mousedown.selectable',selector,function(event){
			if(event.ctrlKey || event.metaKey || event.shiftKey || $(this).hasClass('selected')) return; //We'll handle this on click

            // So we can have multiple lists
            takeFocus();

			$(selector).removeClass('selected');
        	$(this).addClass('selected');
		});

		$('html').live('click.deselect',function(event){
			if(!$(event.target).is('a')){ //Don't hande link clicks
				hasFocus = false;
        		$(selector).removeClass('selected');
        		$lastSelected = null;
        	}
		});

		// Key events for file selection
		$('html').bind('keydown.selection',function(event){
			if($lastSelected == null) return;

            var $songs = $(selector),
				index = $songs.index($lastSelected);

			switch(event.keyCode){
				case 38: // up
					index--;
					break;
				case 40: // down
					index++;
					break;
				default:
					return;
			}

			if(index >= $songs.length)
				index = $songs.length - 1;
			else if(index < 0)
				index = 0;

			$nextSelected = $songs.eq(index);

			if(!event.shiftKey)
				$songs.removeClass('selected');
			else if($nextSelected.hasClass('selected'))
				$lastSelected.removeClass('selected');

			$lastSelected = $nextSelected;
			$lastSelected.addClass('selected');

			return false;
		});

		// multi file download
		// $('html').bind('keyup.download',function(event){
		// 	if(event.keyCode != 13) return; // Enter Key
		// 	var $selected = $('.song.selected');
		//     if($selected.length == 0) return;

		//     var ids = [];
		//     $selected.each(function(){
		//     	ids.push($(this).attr('id').replace(/[^\d]/g,''));
		//     });

		//     window.open('/archive/files/?ids='+escape(ids.join(',')));
		// });
	}

	function setupDeletion()
	{
		//multi file deletion
		$('html').on('keyup.deletion',function(e){
			if(e.keyCode != 46) return; // Delete key

			var $playlistSelected = $('.playlist>li.selected')
			  , $librarySelected = $('.library li.selected')
			  , ids = [];

			// Remove from playlist
			if($playlistSelected.length > 0){
				$playlistSelected.each(function(){
					ids.push($(this).data('id'));
				});

				socket.emit('removeTracks',ids);
				beginLoading('playlistUpdate','Removing Tracks');

			// Confirm, then delete from library
			}else if($librarySelected.length > 0 && view.actions.enabledelete()){
				$librarySelected.each(function(){
					ids.push($(this).data('id'));
				});

				$('body').showDialog({
					title:'Confirm Deletion',
					text:'Are you sure you want to delete ' + ids.length + ' file' + ((ids.length > 1) ? 's' : '' ) + '?',
					buttons:{
						'Don\'t question me!':function(){
							socket.emit('deleteSongs',ids);
							$(this).dialog('close');
						},
						'Cancel':function(){
							$(this).dialog('close');
						}
					}
				})

			}

			e.stopPropagation();
		});

	}
});