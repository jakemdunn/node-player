<?php
require_once(dirname(__FILE__).'/includes/inc.master.php');

// Route our request
global $routing;
$routing = new Routing();
$routing->route();