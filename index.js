require('babel-core');
require("babel/register");

var generator = require('./lib/generatorConfig.js');

generator.run();
