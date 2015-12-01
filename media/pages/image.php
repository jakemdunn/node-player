<?php
global $routing;
$soundID = (int)$routing->route[1];
if($soundID){
	$sound = Sound::find($soundID);
	header('Content-Type:'.$sound->imageMime());
	print($sound->imageData());
}