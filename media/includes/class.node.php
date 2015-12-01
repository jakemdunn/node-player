<?php
require_once(DOC_ROOT.'/vendor/getid3/getid3.php');

// Initialize getID3 engine
global $getID3;
$getID3 = new getID3();

class Node{

	// Server instantiation
	private static $socket = 3002;
	private static $loop;
	private static $server;

	public static function boot()
	{
		// Create a DNode server
		Node::$loop = new React\EventLoop\StreamSelectLoop();
		Node::$server = new DNode\DNode(Node::$loop,new Node());

		try {
			Node::listen();
		} catch (Exception $e) {
			print("$e\n");
			print("Remote server already running. Attempting shutdown.\n");
			Node::$server->connect(Node::$socket, function($remote, $connection) {
				// Request that the server shut down, so we can take this port
				print("Connected to previous remote server.\n");
				$remote->shutdown(function() use ($connection) {
					print("Previous server has shutdown.\n");
					$connection->end();
					Node::listen();
				});
			});
			Node::$loop->run();
		}
	}

	private static function listen()
	{
		Node::$server->listen(Node::$socket);
		Node::$loop->run();
		print("Server running.\n");
	}

	// Our API calls

	public function getID3($filename,$callback)
	{
		global $getID3;

		// Get sound meta
		try {
			$id3 = $getID3->analyze($filename);
			getid3_lib::CopyTagsToComments($id3);
		} catch (Exception $e) {
			$callback(json_encode((object)array(
				'result'=>'error',
				'file'=>$filename,
				'error'=>$e->getMessage()
				)));
			return;
		}

		$callback(json_encode((object)$id3));
	}

	public function getImageData($filename,$callback)
	{
		global $getID3;

		// Get sound meta
		try {
			$id3 = $getID3->analyze($filename);
			getid3_lib::CopyTagsToComments($id3);
		} catch (Exception $e) {
			$callback(json_encode((object)array(
				'result'=>'error',
				'file'=>$filename,
				'error'=>$e->getMessage()
				)),'');
			return;
		}
		if(isset($id3['comments']['picture'][0]))
			$callback(base64_encode($id3['comments']['picture'][0]['data']),$id3['comments']['picture'][0]['image_mime']);
		else
			$callback('','');

	}

	// public function getMusic($callback)
	// {
	// 	// Get all sounds
	// 	$sounds = Sounds::all();
	// 	$output = array();

	// 	foreach ($sounds as $sound) {
	// 		$output []= $sound->serializableObject();
	// 	}

	// 	$output = json_encode($output);

	// 	$callback($output);
	// }

	// public function updateTrack($trackID,$attributes,$callback)
	// {
	// 	try {
	// 		$sound = Sound::find($trackID);
	// 		$sound->update_attributes($attributes);
	// 	} catch (Exception $e) {
	// 		$callback(json_encode((object)array(
	// 			'result'=>'error',
	// 			'error'=>$e->getMessage()
	// 			)));
	// 		return;
	// 	}

	// 	$callback(json_encode((object)array(
	// 		'result'=>'success'
	// 		)));
	// }

	public function shutdown($callback)
	{
		Node::$loop->stop();
		$callback();
	}
}