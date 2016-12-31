const async = require("async");
const http = require("http");

// http://ip-api.com/json/(ip_address)
// returns JSON for a specified IP
// no more than 150 requests per minute are allowed

function get ( dnsList ) {
	return new Promise(( resolve, reject ) => {
		async.eachSeries(dnsList, function ( dns, callback ) {
			getOne(dns).then((updatedDns) => {
				dns = updatedDns;
				setTimeout(function () {
					callback();
				}, 500);
			});
		}, function () {
			resolve(dnsList);
		});
	});
}

function getOne ( dns ) {
	return new Promise(( resolve, reject ) => {
		http.get({
			"host" : "ip-api.com",
			"path" : "/json/" + dns.ip
		}, (res) => {
			var body = "";

			res.on("data", function( chunk ) {
				body += chunk;
			});

			res.on("end", function() {
				body = JSON.parse(body);
				dns.isp = body.isp;
				resolve(dns);
			});
		});
	});
}

module.exports = {
	  "get"    : get
	, "getOne" : getOne
};
