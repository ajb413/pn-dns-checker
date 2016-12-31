const check  = require('./check.js');
const common = require('./common.js');
const async  = require('async');
const fs     = require('fs');

module.exports = {
	"run" : run
};

function run() {
	async.waterfall([
		  checkStart
		, bulkInsert
		, getResults
		, selectUnresolved
		, publishFailures
	]);
}

function checkStart ( callback ) {
	check.start().then(function ( doneList ) {
		callback(null, doneList);
	});
}

function bulkInsert ( doneList, callback ) {
	common.bulkInsert(doneList)
	.then(function () {
		callback();
	});
}

function getResults ( callback ) {
	common.getResults()
	.then(function ( results ) {
		callback(null, results);
	});
}

function selectUnresolved( results, callback ) {
	common.selectUnresolved(results)
	.then(function ( unresolved ) {
		callback(null, unresolved);
	});
}

function publishFailures( unresolved, callback ) {
	//count of failurs per domain per isp
	common.countFailures(unresolved)
	.then(function ( failures ) {
		pn_publish(failures);
	});

	//countries that resolve google but not pubsub.pubnub.com
	common.countryFailures(unresolved)
	.then(function ( failures ) {
		pn_publish(failures);
	});
}

function pn_publish ( failures ) {
	for (let failure of failures ) {
		common.pn_publish(failure);
	}
}
