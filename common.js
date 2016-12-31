// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// Imports
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const settings = require('./settings.js');
const pubnub   = require('pubnub');
const dig      = require('./datagram.js')['dig'];
const pg       = require('pg');
const copyFrom = require('pg-copy-streams').from;

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// PubNub
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
let pn = new pubnub({
	  "publishKey"   : settings.pn_settings.pn_pub_key
	, "subscribeKey" : settings.pn_settings.pn_sub_key
	, "secretKey"    : settings.pn_settings.secret_key
});

function pn_publish ( msg ) {
	pn.publish({
		  "channel" : settings.pn_settings.pn_channel
		, "message" : msg
	});
}

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// DB - Postgres
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
function getDbConnection () {
	return new pg.Client(settings.postgres_settings);
}

function getDnsList (query) {
	return new Promise(( resolve, reject ) => {
		let db = getDbConnection();
		db.connect();
		if (!query) {
			query = `
				SELECT * FROM nameservers
			`;
		}

		db.query(query, (err, result) => {
			db.end();
			if ( err || !result.rows ) reject(); 
			else resolve(result.rows);
		});
	});
}

let bulkInsertQuery = `
	insert into queries
	(ip, runId, domain, answer, status, response_len)
	values
	($1, $2, $3, $4, $5, $6)
`;

function bulkInsert ( rows ) {
	return new Promise(( resolve, reject ) => {
		let db = getDbConnection();

		db.connect(function(err, client) {
			var stream = client.query(copyFrom('COPY queries FROM STDIN'));
			stream.on('error', done);
			stream.on('end', done);
			//convert array of json to tsv stream
			for ( let row of rows ) {
				stream.write(row.ip           + '\t');
				stream.write(row.runId        + '\t');
				stream.write(row.domain       + '\t');
				stream.write(row.answer       + '\t');
				stream.write(row.status       + '\t');
				stream.write(row.response_len + '\n');
			}
			stream.end();
		});

		function done (err) {
			console.log(err);
			db.end();
			resolve();
		}
	});
}

function getResults () {
	return new Promise(( resolve, reject ) => {
		let db = getDbConnection();
		db.connect();
		query = `
			SELECT
				queries.ip,
				queries.runid,
				nameservers.isp,
				nameservers.country_id,
				answer,
				status,
				response_len
			FROM (
				SELECT
					queries.ip,
					queries.runid,
					string_agg((answer::text), ', ' ORDER BY queries.domain) AS answer,
					string_agg((status::text), ', ' ORDER BY queries.domain) AS status,
					string_agg((response_len::text), ', ' ORDER BY queries.domain) AS response_len
				FROM queries
				GROUP BY
					queries.ip,
					queries.runid
			)
			queries JOIN nameservers ON queries.ip = nameservers.ip
			WHERE
				queries.runid=$1;
			`;

		db.query(query, [ settings.runId ], (err, result) => {
			db.end();
			if ( err || !result.rows ) reject(); 
			else resolve(result.rows);
		});
	});
}

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// Executes dig settings.dig_retries times before deciding it has failed
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
function digController ( dnsToTest, domainToTest, digSettings ) {
	return new Promise(( resolve, reject ) => {
		seriesLoop(0, digSettings.retries);

		function seriesLoop ( iteration, length ) {
			dig(dnsToTest, domainToTest, digSettings)
			.then(function ( result ) {
				if (result[0]) {
					resolve(result);
				}
				if (!result[0] && iteration+1 < length) {
					seriesLoop(iteration+1, length);
				}
				else {
					resolve(result);
				}
			});
		}
	});
}

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// Exports
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
module.exports = {
	  "bulkInsert"        : bulkInsert
	, "getResults"        : getResults
	, "getDnsList"        : getDnsList
	, "pn_publish"        : pn_publish
	, "dig"               : digController
	, "dig_settings"      : settings.dig_settings
	, "concurrency_limit" : settings.concurrency_limit
	, "test_domains"      : settings.test_domains
	, "createRecord"      : settings.createRecord
	, "selectUnresolved"  : settings.selectUnresolved
	, "countFailures"     : settings.countFailures
	, "countryFailures"   : settings.countryFailures
};
