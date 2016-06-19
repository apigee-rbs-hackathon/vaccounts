// dependencies
var express = require('express');
var bodyParser = require('body-parser');
var apigee = require('apigee-access');
var jwt = require('jwt-simple');
var async = require('async');
var request = require('request');
var _ = require('lodash');

var app = express();

app.options('*', function(req,res){
	res.set({
		'Access-Control-Allow-Origin': "*",
		'Access-Control-Allow-Methods': "*",
		'Access-Control-Allow-Headers': "*",
		'Access-Control-Max-Age':"3628800"
	}).status(200).send("OK");

});

app.get('/', function(req,res){
	//mock stuff from VerifyToken
	apigee.setVariable(req, "rbs.custom.jwt", apigee.getVariable(req, "accesstoken.jwt"));
	apigee.setVariable(req, "rbs.custom.primarykey", "6cc47e705851419b8f535f50b8abb6f6");	


	//decode JWT
	var token = apigee.getVariable(req, "rbs.custom.jwt");
	var secret = apigee.getVariable(req, "rbs.custom.secret");
	var decoded = jwt.decode(token, secret, true, 'HS256');

	var currentAccountId = apigee.getVariable(req, "rbs.cache.currentAccountId");
	//get all transactions
	async.waterfall([
		//get transactions from bluebank
		function (callback) {
			request({
				url:'https://bluebank.azure-api.net/api/v0.6.3/accounts/' + currentAccountId + '/transactions?sortOrder=-transactionDateTime&offset=0&limit=25',
				headers:{
					Bearer: apigee.getVariable(req,"accesstoken.jwt"), 
				'Ocp-Apim-Subscription-Key': "6cc47e705851419b8f535f50b8abb6f6"
				}
			}, function (error, response, body) {
				if (!error && response.statusCode == 200) {
					var transactions = JSON.parse(body);
					callback(null, transactions);
				}
				else {
					callback("Oops" + error + JSON.stringify(response) + ":" + currentAccountId);
				}
			});
		},
		//get vaccounts from BaaS
		function(transactions, callback){
			request('https://api.usergrid.com/bbank/categories/vaccounts?id=' + currentAccountId, function (error, response, body) {
					if (!error && response.statusCode == 200) {
						var baasResponse = JSON.parse(body);
						callback(null, transactions,baasResponse.entities);
					}
					})
		},
		function(transactions, vaccounts, callback) {
			request({
				url:'https://bluebank.azure-api.net/api/v0.6.3/accounts/' + currentAccountId,
			headers:{
					Bearer: apigee.getVariable(req,"accesstoken.jwt"), 
					'Ocp-Apim-Subscription-Key': "6cc47e705851419b8f535f50b8abb6f6"
			}
			}, function (error, response, body) {
				if (!error && response.statusCode == 200) {
					var account = JSON.parse(body);
					callback(null, transactions, vaccounts, account.accountBalance, account.accountNumber);
				}
				else {
					callback("Oops");
				}
			});

		},
		//mediate
		function(transactions, vaccounts, accountBalance, accNumber, callback) {
			var responsePayload = {};
			responsePayload.accId = currentAccountId;
			responsePayload.accNo = accNumber;
			responsePayload.balance = accountBalance.toFixed(2);
			responsePayload.vaccounts = [];

			var reportedTxs = [];

			vaccounts.forEach(function(item){
				var runningTotal = 0;
				var myTransactions = [];
				transactions.forEach(function(transaction){
					//tag name is in tx description
					_.forEach( item.tags,function(i)  {
						if(transaction.transactionDescription.toLowerCase().indexOf(i.toLowerCase())>-1){
							myTransactions.push({
								desc: transaction.transactionDescription,
								amount: (transaction.transactionAmount).toFixed(2),
								txdate: transaction.transactionDateTime,
								txid: transaction.id
							});
							reportedTxs.push(transaction.id);
							runningTotal+=transaction.transactionAmount;
							return false;
						}
					});
				});

				responsePayload.vaccounts.push({
					name:item.name,
					limit:item.limit,
					balance:(Number(item.limit) + Number(runningTotal)).toFixed(2),
					txs:myTransactions
				});
			});

			//add other
			var otherTransactions = [];
			var otherTotal = 0;
			transactions.forEach(function(transaction){
				var isUsed = false;
				for(var i = 0; i < reportedTxs.length; i++){
					var id = reportedTxs[i];
					if(transaction.id === id){
						isUsed = true;
					}
				};

				if(!isUsed){
					otherTotal+=transaction.transactionAmount;
					otherTransactions.push({
						desc: transaction.transactionDescription,
						amount: (transaction.transactionAmount).toFixed(2),
						txdate: transaction.transactionDateTime,
						txid: transaction.id
					});
				}
			});
			responsePayload.vaccounts.push({
				name:"Other",
				limit:null,
				balance:(accountBalance - otherTotal).toFixed(2),
				txs:otherTransactions
			});



			callback(null, responsePayload);

		}
	], function (error, result){
		if(!error) {
			res.status(200).set({
				'Content-Type':'application/json',
				'Access-Control-Allow-Origin': "*",
				'Access-Control-Allow-Methods': "*",
				'Access-Control-Allow-Headers': "*",
				'Access-Control-Max-Age':"3628800"
			}).send(JSON.stringify(result));
		}
		else {
			res.status(500).send("Oops ):"+error);
		}
	});


	//return response

	//res.status(200).send("OK:" +JSON.stringify(decoded));
});


// start node app
app.listen(3000);
