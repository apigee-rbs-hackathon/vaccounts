// dependencies
var express = require('express');
var bodyParser = require('body-parser');
var apigee = require('apigee-access');

var app = express();

app.get('/', function(req,res){
	res.status(418).send("OK");
});

// define supported routes
app.post('/', function(req, res) {

	var cache = apigee.getCache('cache', {
		'resource': 'myCache',
		'scope': 'global'
	});

	cache.put('key', 'hello world', 120, function(error) {
		var body = {};
		if (!error) {
			res.set({
				'Content-Type': 'application/json',
			});
			res.status(200);
			body = {
				"success": true,
				"message": "Success"
			};
			res.send(JSON.stringify(body));
		} else {
			res.set({
				'Content-Type': 'application/json',
			});
			res.status(500);
			body = {
				"success": false,
				"message": "Error: " + error
			};
			res.send(JSON.stringify(body));
		}
	});


});

// start node app
app.listen(3000);
