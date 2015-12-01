<?php

require_once DOC_ROOT.'/vendor/php-activerecord/ActiveRecord.php';

class Config
{
	private $options = array(
		'^(localhost|dev.media.player.phenomblue.com)$'=>array(
			'web_root'=>'http://dev.media.player.phenomblue.com',
			'db_name'=>'phenom_player',
			'db_user'=>'webuser',
			'db_pass'=>'phenomblue!00',
			'db_host'=>'127.0.0.1'
			)
		);

	private $config;

	public function __get($property) {
		if (isset($this->config[$property])) {
			return $this->config[$property];
		}
	}

	public function Config()
	{
		global $config;
		$config = $this;
		$host = getenv('HTTP_HOST');

		if(php_sapi_name() == 'cli')
			$host = 'localhost';
		
		foreach ($this->options as $urls => $option) {
			if(preg_match('#'.$urls.'#', $host)){
				$this->config = $option;
				break;
			}
		}

		$this->checkConfig();
		$this->defineConfig();
		
		ActiveRecord\Config::initialize(function($cfg)
		{
			global $config;
			$url = sprintf('mysql://%1$s:%2$s@%3$s/%4$s',
				$config->db_user,
				$config->db_pass,
				$config->db_host,
				$config->db_name
				);
		    $cfg->set_model_directory(DOC_ROOT.'/models');
		    $cfg->set_connections(array('development' => $url));
		});
	}

	private function checkConfig()
	{
		if (!isset($this->config)) {
            die('<h1>Where am I?</h1> <p>You need to setup your server names in <code>'.__FILE__.'</code></p>
                 <p><code>$_SERVER[\'HTTP_HOST\']</code> reported <code>' . $_SERVER['HTTP_HOST'] . '</code></p>');
		}
	}

	private function defineConfig()
	{
		foreach ($this->config as $key => $value) {
			define(strtoupper($key), $value);
		}
	}
}

$config = new Config();