const common = require('./common.js');
const async  = require('async');

module.exports = {
	"start" : start
}

function start() {
	return new Promise(( resolve, reject ) => {
		common.getDnsList().then(function ( dnsList ) {
			check(dnsList).then(function ( doneList ) {
				resolve(doneList);
			});
		});
	});
}

function check ( dnsList ) {
	return new Promise(( resolve, reject ) => {
		let doneList = [];
		async.eachLimit(dnsList, common.concurrency_limit,
			function ( dns, callback ) {

				var digs = [];

				for (let domain of common.test_domains) {
					let dig = common.dig(
						dns.ip, domain.name, common.dig_settings
					);
					digs.push(dig);
				}

				Promise.all(digs).then( results => {
					//logic in settings.js
					common.createRecord( dns, results )
					.then(function ( rows ) {
						doneList = doneList.concat(rows);
						//console.log(rows);
						callback();
					});
					
				});
			}, function () {
				resolve(doneList);
		});
	});
}
