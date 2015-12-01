<?php

class Sounds
{
	public static function all()
	{
		$sounds = Sound::all();

		// Parse any newly added files
		foreach (glob(DOC_ROOT.'/uploads/*') as $filename){
			if(!is_dir($filename)){
				$sound = Sounds::parseSoundFile($filename);
				if($sound) array_push($sounds, $sound);
			}
		}

		// Make sure files exist for all sounds
		foreach ($sounds as $key => $sound) {
			if (!file_exists($sound->filename)) {
				$sound->delete();
				unset($sounds[$key]);
			}
		}

		return $sounds;
	}

	public static function parseSoundFile($filename)
	{
		global $getID3;

		// Get sound meta
		$id3 = $getID3->analyze($filename);
		getid3_lib::CopyTagsToComments($id3);

		// Validate
		if(!Sounds::validateID3($id3)){
			unlink($filename);
			return false;
		}
		
		// Make our directory
		$artist = @$id3['comments']['artist'][0];
		$album = @$id3['comments']['album'][0];
		$dir = DOC_ROOT.'/music/'.Sounds::safeDirectory($artist).'/'.Sounds::safeDirectory($album);
		if(!is_dir($dir)) mkdir($dir,0777,true);

		// Our new filename
		$moved = $dir.'/'.basename($filename);

		// Already exists! Madness!
		if(file_exists($moved)){
			unlink($filename);
			return false;
		}

		// Move
		rename($filename, $moved);

		// Create and Save
		$sound = new Sound(array(
			'filename'=>$moved,
			));
		$sound->save();

		return $sound;
	}

	public static function validateID3($id3)
	{
		// Our required fields for this song to parse correctly
		$artist = @$id3['comments']['artist'][0];
		$album = @$id3['comments']['album'][0];
		$title = @$id3['comments']['title'][0];
		$track = @$id3['comments']['track_number'][0];
		$playtime = @$id3['playtime_seconds'];

		// Make sure this checks out, or delete (Yes, we're harsh)
		if (is_null($artist) || is_null($album) || is_null($title) || is_null($track) || is_null($playtime)) {
			return false;
		}

		return true;
	}

	private static function safeDirectory($dir)
	{
		return preg_replace('#[^a-zA-Z0-9_-\s\(\)\[\]]+#', '', $dir);
	}
}