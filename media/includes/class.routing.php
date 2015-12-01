<?php

class Routing
{
	public $route;
	public $slug;

	public function Routing()
	{
		// Check the request
		$this->route = explode('/',preg_replace(array('!\?(.*)$!','![^a-zA-Z0-9-_/%.\(\)]!'), '', trim($_SERVER['REQUEST_URI'],'/')));
		$this->slug = $this->route[0];

		if($this->slug == '') $this->slug = 'index';
	}

	public function route()
	{
		// Default Page lookup
		$page = sprintf('%1$s/pages/%2$s.php',DOC_ROOT,strtolower($this->slug));

		if(file_exists($page)){
			require_once($page);
		}else{
			require_once(DOC_ROOT.'/pages/404.php');
		}
	}
}