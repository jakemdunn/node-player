<?php

class Rating extends ActiveRecord\Model
{
	static $validates_numericality_of = array(
		array('rating', 'less_than_or_equal_to' => 5, 'greater_than_or_equal_to' => 0, 'only_integer' => true)
	);
}