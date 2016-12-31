// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// Constructs and sends UDP packet for DNS request
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const dgram  = require('dgram');
const isIPv4 = require('net').isIPv4;

//Similar to unix dig command 
module.exports = {
	"dig" : dig
};

//dns response status codes
const status_codes = {
	'NoError': 0,
	'FormatError': 1,
	'ServerFailure': 2,
	'NameError': 3,
	'NotImplemented': 4,
	'Refused': 5,
	'YXDomain': 6,
	'YXRRSet': 7,
	'NXRRSet': 8,
	'NotAuth': 9,
	'NotZone': 10,
	'BadSigOrVers': 16,
	'BadKey': 17,
	'BadTime': 18,
	'BadMode': 19,
	'BadName': 20,
	'BadAlgorithm': 21,
	'BadTruncation': 22
};

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// Converts a domain name from string to hex.
// Gives dots proper value in a DNS request datagram. 
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
function formatDomain ( domain ) {
	//format dots in domain for packet
	domainArray = domain.split('.');
	segmentLengths = [];

	for (let [i, segment] of domainArray.entries()) {
		//save domain substring lengths
		segmentLengths.push(segment.length);
	}

	let hexBuf = Buffer.from(domain);

	//init with first domain substring length
	let domainInHex = [segmentLengths[0]];
	let dotCount = 1;

	for (let char of hexBuf) {
		//replace dots with following substring length
		if (char === 46) {
			char = segmentLengths[dotCount];
			dotCount++;
		}

		domainInHex.push(char);
	}

	return domainInHex;
}

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// Generates a 2-byte transaction id for a DNS request.
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
function createTransactionId () {
	let id = [];
	for (let i = 0; i < 2; i++) {
		id.push(randInclusive(1, 255));
	}
	return id;
}

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// Generates a random number from a to b, a and b inclusive.
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
function randInclusive ( a, b ) {
	let n = b - a + 1;
	return a + Math.floor((Math.random() * n));
}

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// Creates buffer for node's datagram socket send method.
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
function buildPacket ( domain ) {
	let packet = [];

	let bytes = [
		  createTransactionId() // transaction id
		, [0x01, 0x00]          // flags
		, [0x00, 0x01]          // question
		, [0x00, 0x00]          // answerRR
		, [0x00, 0x00]          // authorityRR
		, [0x00, 0x00]          // additionalRR
		, formatDomain(domain)  // name
		, [0x00]                // null terminator
		, [0x00, 0x01]          // type A
		, [0x00, 0x01]          // class IN
	];

	for (let segment of bytes) {
		packet = packet.concat(segment);
	}

	return Buffer.from(packet);
}

function getStatus ( packet ) {
	let code = 1; //FormatError

	if (packet.length > 3) {
		//get decimal of lower nibble of byte 4 (response status code)
		code = parseInt((packet[3] >>> 0)
			.toString(2)
			.slice(-4), 2);
	}

	for ( let [ key, value ] of Object.entries(status_codes) ) {
		if ( value === code ) result = key;
	}

	return result;
}

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// Validates a DNS response packet. Returns ANSWER count or else 0.
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
function validateResponse ( packet ) {
	let result = 0;

	//0 0 129 128 0 1 0
	if (packet.length > 7 &&
		packet[2] === 129 &&
		packet[3] === 128 &&
		packet[4] ===   0 &&
		packet[5] ===   1 &&
		packet[6] ===   0
	) {
		result = packet[7];
	}

	return result;
}

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// Makes a DNS request to the specified DNS address.
// Returns true if DNS resolved the domain before timeout, otherwise false,
// response's status code, answer count, and response length in bytes.
// [bool, "statusCode", answerCount, responseLength]
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
function dig ( dns, domain, settings ) {
	return new Promise(( resolve, reject ) => {
		let packet = buildPacket(domain);
		let timeoutInstance;

		let IPv = isIPv4(dns) ? 4 : 6;

		let client = dgram.createSocket('udp' + IPv.toString());
		client.send(packet, settings.port, dns, (err) => {
			if (err) fail("FailToSendReq");
			else {
				timeoutInstance = setTimeout(() => {
					fail("TimeOut");
				}, settings.timeoutLength);
			}
		});

		client.on('message', ( response, server ) => {

			clearTimeout(timeoutInstance);

			try { client.close(); }
			catch (error) { console.log(error); }

			let status = getStatus(response);
			let answer = validateResponse(response);
			let didResolve = !!answer;

			resolve([didResolve, status, answer, response.length]);
		});

		function fail (code) {
			try { client.close(); }
			catch (error) { console.log(error); }
			resolve([false, code, -1, 0]);
		}
	});
}
