<?php
require_once(DOC_ROOT.'/vendor/getid3/getid3.php');

// Initialize getID3 engine
global $getID3;
$getID3 = new getID3();

class Sound extends ActiveRecord\Model
{
	static $has_many = array(
		array('ratings')
		);

	static $validates_numericality_of = array(
		array('rating', 'less_than_or_equal_to' => 5, 'greater_than_or_equal_to' => 0, 'only_integer' => true)
	);

	static $before_save = array('apply_ratings');
	static $after_save = array('init');
	static $after_construct = array('init');

	private $_id3;
	private $_url;
	private $_imageUrl;

	public function id3(){return $this->_id3;}
	public function url(){return $this->_url;}
	public function imageUrl(){return $this->_imageUrl;}
	public function imageData(){return $this->_id3['comments']['picture'][0]['data'];}
	public function imageMime(){return $this->_id3['comments']['picture'][0]['image_mime'];}

	public function apply_ratings()
	{
		$average = 0;
		$ratings = count($this->ratings) > 0
			? $this->ratings
			: array((object)array('rating'=>2));

		foreach ($ratings as $rating) {
			$average += $rating->rating;
		}

		$this->rating = $average / count($ratings);
	}

	public function init()
	{
		global $getID3;
		if(file_exists($this->filename) && !isset($this->_id3)){
			$this->_id3 = $getID3->analyze($this->filename);
			getid3_lib::CopyTagsToComments($this->_id3);
			$this->_url = WEB_ROOT . str_replace(array(DOC_ROOT,'\\'), array('','/'), $this->filename);
			$this->_imageUrl = isset($this->_id3['comments']['picture'][0])
				? WEB_ROOT . '/image/' . $this->id
				: '';
		}
	}

	public function serializableObject()
	{
		$attributes = $this->attributes();
		$attributes['url'] = $this->url();
		$attributes['artist'] = $this->_id3['comments']['artist'][0];
		$attributes['album'] = $this->_id3['comments']['album'][0];
		$attributes['title'] = $this->_id3['comments']['title'][0];
		$attributes['playtime_seconds'] = $this->_id3['playtime_seconds'];
		$attributes['playtime_string'] = $this->_id3['playtime_string'];
		$attributes['imageUrl'] = $this->imageUrl();
		$attributes['trackNumber'] = (int)array_shift(explode('/',$this->_id3['comments']['track_number'][0]));

		unset($attributes['filename']);

		return (object)$attributes;
	}
}