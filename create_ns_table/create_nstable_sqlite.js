// This script creates a Sqlite DB with a table called
// nameservers. The nameservers are all DNS from the 
// list on http://public-dns.info/ (nameservers.csv). 
// The columns of the table created are ip, name, 
// country_id, isp. The SQLite file created is ns.sqlite.
// This Sqlite DB can be used as a resource for another 
// script which fills the nameservers table in the 
// Postgres DB on amazon. This script adds 1 ISP to the
// Sqlite table at a time, 2 per second, to avoid hitting
// the http://ip-api.com/ limit of 150 req/minute. If the
// script fails, it can be run again, and will fill the 
// Sqlite DB where it left off on its last run.

const fs        = require('fs');
const sqlite    = require('sqlite3').verbose();
const Converter = require('csvtojson').Converter;
const ispApi    = require('./isp_api.js');

//nameserver list and sqlite db that is created
const csv  = 'nameservers.csv';
const file = 'ns.sqlite';

fs.exists(file, function(exists) {
	if (!exists) {
		createDb().then(()=>{
			run();
		});
	}
	else run();
});

function run () {
	getDnsList().then((dnsList)=>{
		getOne(0);
		function getOne (iteration) {
			ispApi.getOne(dnsList[iteration])
			.then((updated)=>{
				update([updated]).then(()=>{
					if (iteration < dnsList.length-1) {
						setTimeout(() => {
							getOne(iteration+1);
						}, 500); //api limit 150 req/min
					}
				});
			});
		}
	});
}

function createDb () {
	return new Promise(( resolve, reject ) => {
		let db = new sqlite.Database(file);
		db.serialize(function() {
			//create the table in the db
			db.run(`
				CREATE TABLE nameservers
				(
					ip VARCHAR(255),
					name VARCHAR(255),
					country_id VARCHAR(255),
					isp VARCHAR(255)
				);
			`);

			var csvConverter = new Converter({});

			//end_parsed will be emitted once parsing finished
			csvConverter.on("end_parsed",function( dnss ){
				dnss.forEach(function ( dns, i ) {
					db.run(`INSERT OR IGNORE INTO nameservers (
						ip,
						name,
						country_id,
						isp
					) VALUES (?,?,?,?)`,
					[
						dns.ip,
						dns.name,
						dns.country_id,
						'',
					]);
					if ( i === dnss.length-1 ) resolve();
				});
			});

			//read from file
			fs.createReadStream(csv).pipe(csvConverter);
		});
	});
}

function update (dnsList) {
	return new Promise(( resolve, reject ) => {
		let db = new sqlite.Database(file);
		db.serialize(function() {
			dnsList.forEach(function (dns, i) {
				db.run(`
					UPDATE nameservers
					SET isp=?
					WHERE ip=?;
				`, [dns.isp, dns.ip]);
				if ( i === dnsList.length-1 ) resolve();
			});
		});
	});
}

function getDnsList () {
	return new Promise(( resolve, reject ) => {
		let db = new sqlite.Database(file);
		db.serialize(function() {
			var sql = "SELECT * FROM nameservers where ISP=''";

			db.all(sql, function( err, rows ) {
				if (err) reject();
				resolve(rows);
			});
		});
	});
}