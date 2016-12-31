const postgres_settings = {
	  "host"     : ""
	, "port"     : 0000
	, "user"     : ""
	, "password" : ""
	, "database" : ""
};

//number of DNS to test in parallel
const concurrency_limit = 150;

//send alert to librato if # nameservers
//failed for an isp is greater than this
const failPerIsp = 1;

const dig_settings = {
	  "timeoutLength" : 5000
	, "retries"       : 3
	, "port"          : 53
};

//PubNub connection
const pn_settings = {
	  "pn_pub_key" : ""
	, "pn_sub_key" : ""
	, "secret_key" : ""
	, "pn_channel" : "dns_check"
};

//testing domains
const test_domains = [
	  { "name" : "google.com",        "key" : "google" }
	//, { "name" : "baidu.com",         "key" : "baidu" }
	//, { "name" : "wikipedia.com",     "key" : "wiki" }
	, { "name" : "pubsub.pubnub.com", "key" : "pubnub" }
	, { "name" : "ps.pndsn.com",      "key" : "pndsn" }
	, { "name" : "pubsub.pubnub.net", "key" : "pnnet" }
];

//Unix Time UTC of program start
//will not fit in postgres after 01/19/2038 @ 3:14am (UTC)
const runId = Math.floor(new Date().getTime()/1000);

// logic for updating a DB row for a DNS after a dig for
// every domain in the test_domains returns or timeouts
function createRecord ( check, results ) {
	return new Promise(( resolve, reject ) => {
		//row for each domain dig per nameserver
		rows = [];

		for (let [i, dig] of results.entries()) {
			rows[i] = {
				  "ip"           : check['ip']
				, "runId"        : runId
				, "domain"       : test_domains[i]['name']
				, "status"       : dig[1]
				, "answer"       : dig[2]
				, "response_len" : dig[3]
			};
		}

		resolve(rows);
	});
}

function selectUnresolved (rows) {
	return new Promise(( resolve, reject ) => {
		let unresolved = [];
		rows.forEach((row, i) => {
			var answers  = row.answer.split(', ').map(Number);
			var statuses = row.status.split(', ');
			var lengths  = row.response_len.split(', ').map(Number);

			//google resolves, "ps.pndsn.com" did not
			if (answers[0] > 0 && answers[1] < 1) {
				unresolved.push({
					  "isp"        : row.isp
					, "ip"         : row.ip
					, "country_id" : row.country_id
					, "domain"     : "ps.pndsn.com"
					, "answer"     : answers[1]
					, "status"     : statuses[1]
					, "length"     : lengths[1]
				});
			}

			//google resolves, "pubsub.pubnub.com" did not
			if (answers[0] > 0 && answers[2] < 1) {
				unresolved.push({
					  "isp"        : row.isp
					, "ip"         : row.ip
					, "country_id" : row.country_id
					, "domain"     : "pubsub.pubnub.com"
					, "answer"     : answers[2]
					, "status"     : statuses[2]
					, "length"     : lengths[2]
				});
			}

			//google resolves, pspnnet did not
			if (answers[0] > 0 && answers[3] < 1) {
				unresolved.push({
					  "isp"        : row.isp
					, "ip"         : row.ip
					, "country_id" : row.country_id
					, "domain"     : "pubsub.pubnub.net"
					, "answer"     : answers[3]
					, "status"     : statuses[3]
					, "length"     : lengths[3]
				});
			}
			if ( i === rows.length-1 ) resolve(unresolved);
		});
	});
}

function countFailures ( unresolved ) {
	return new Promise(( resolve, reject ) => {
		let failures = {
			  "com" : {}
			, "dsn" : {}
			, "net" : {}
		}

		let toPublish = [];

		for ( let failure of unresolved ) {
			if (failure.domain === "pubsub.pubnub.com") {
				let key = failure.isp
				let count = failures.com[key];
				failures.com[key] = count ? count+1 : 1;
			}
			if (failure.domain === "ps.pndsn.com") {
				let key = failure.isp
				let count = failures.dsn[key];
				failures.dsn[key] = count ? count+1 : 1;
			}
			if (failure.domain === "pubsub.pubnub.net") {
				let key = failure.isp
				let count = failures.net[key];
				failures.net[key] = count ? count+1 : 1;
			}
		}

		for ( let [domainKey, isp] of Object.entries(failures) ) {
			let domain = "";
			if (domainKey === "com") {
				domain = "pubsub.pubnub.com";
			}
			if (domainKey === "dsn") {
				domain = "ps.pndsn.com";
			}
			if (domainKey === "net") {
				domain = "pubsub.pubnub.net";
			}
			for ( let [name, count] of Object.entries(isp) ) {
				if ( count > failPerIsp ) {
					toPublish.push({
						  "isp"    : name
						, "count"  : count
						, "domain" : domain
					});
				}
			}
		}

		resolve(toPublish);
	});
}

function countryFailures ( unresolved ) {
	return new Promise(( resolve, reject ) => {
		let toPublish = [];
		let countries = {};
		for ( let failure of unresolved ) {
			if (failure.domain === "pubsub.pubnub.com") {
				let id = failure['country_id'];
				countries[id] = countries[id] ? countries[id]+1 : 1;
			}
		}

		for ( let [key, value] of Object.entries(countries) ) {
			toPublish.push({
				  "country_id" : key
				, "count"      : value
			});
		}

		resolve(toPublish);
	});
}

module.exports = {
	  "concurrency_limit" : concurrency_limit
	, "runId"             : runId
	, "dig_settings"      : dig_settings
	, "postgres_settings" : postgres_settings
	, "pn_settings"       : pn_settings
	, "test_domains"      : test_domains
	, "createRecord"      : createRecord
	, "selectUnresolved"  : selectUnresolved
	, "countFailures"     : countFailures
	, "countryFailures"   : countryFailures
}