<?php
require_once(DOC_ROOT.'/vendor/getid3/getid3.php');
global $routing,$getID3;

// Initialize getID3 engine
$getID3 = new getID3();

$file = urldecode(implode('/',array_slice($routing->route,1)));
if($file){
	printf('<pre>%1$s</pre>',$file);
	$filename = dirname(DOC_ROOT) . '/app/music/' . $file;
	printf('<pre>%1$s</pre>',$filename);
	$id3 = $getID3->analyze($filename);
	getid3_lib::CopyTagsToComments($id3);
	printf('<pre>%1$s</pre>',print_r($id3,true));
}