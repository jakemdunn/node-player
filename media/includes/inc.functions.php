<?php

// Utility Functions


// Fixes MAGIC_QUOTES
function fix_slashes($arr = '')
{
	if(is_null($arr) || $arr == '') return null;
	if(!get_magic_quotes_gpc()) return $arr;
	return is_array($arr) ? array_map('fix_slashes', $arr) : stripslashes($arr);
}