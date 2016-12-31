const sqlite = require('sqlite3').verbose();
const pg     = require('pg');
const file   = "ns.sqlite";
const done = "***  Done inserting nameservers  ***";

const pg_connection = {
      "host"     : ""
	, "port"     : 0000
	, "user"     : ""
	, "password" : ""
	, "database" : ""
};

let db = new pg.Client(pg_connection);
db.connect();

getDnsList().then((list)=>{
	bulkInsert(list).then((err) => {
		db.end();
		if (err) console.log(err);
		else console.log(done);
	});
});

function getDnsList () {
	return new Promise(( resolve, reject ) => {
		let lite = new sqlite.Database(file);
		lite.serialize(function() {
			var sql = `
			SELECT * FROM nameservers
			where isp != ''
			`;

			lite.all(sql, function( err, rows ) {
				if (err) reject();
				resolve(rows);
			});
		});
	});
}

let bulkInsertQuery = `
	INSERT INTO nameservers
	(ip, name, country_id, isp)
	VALUES
	($1, $2, $3, $4)
`;

function bulkInsert ( rows ) {
	return new Promise(( resolve, reject ) => {
		let count = 0;
		rows.forEach((row) => {
			db.query(bulkInsertQuery,
			[
				  row.ip
				, row.name
				, row.country_id
				, row.isp
			],
			function(err, result) {
				if ( err ) console.log(err);
				count++;
				if ( count === rows.length ) {
					resolve();
				}
			});
		});
	});
}