<?php

define('PLAYER', true);
date_default_timezone_set('America/Chicago');

// Autoloading
spl_autoload_register('framework_autoload');

// Determine our absolute document root
define('DOC_ROOT', realpath(dirname(__FILE__) . '/../'));

// Global include files
require DOC_ROOT . '/includes/inc.functions.php';
require DOC_ROOT . '/includes/inc.config.php';
require DOC_ROOT . '/vendor/autoload.php';

// Fix magic quotes
if(get_magic_quotes_gpc())
{
    $_POST    = fix_slashes($_POST);
    $_GET     = fix_slashes($_GET);
    $_REQUEST = fix_slashes($_REQUEST);
    $_COOKIE  = fix_slashes($_COOKIE);
}

function framework_autoload($class_name)
{
    $filename = DOC_ROOT . '/includes/class.' . strtolower($class_name) . '.php';
    if(file_exists($filename))
        require $filename;
}