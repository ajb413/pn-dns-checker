# dns-checker

Check if a site is blocked using node.js to do `dig @ip domain`. Writes results to a local sqlite db.

Currently has google.com as a control domain.

Does not work if too many digs are run at a time.

Application settings are in settings.js



Public DNS list from http://public-dns.info/

## To run:
Get DNS csv.
```
npm install
npm start
```



```
//dependency versions tested with:
	"csvtojson"  : "1.0.3",
	"native-dns" : "0.7.0",
	"async"      : "2.1.4",
	"cron"       : "1.2.1"
	"sqlite3"    : "3.1.8",
	"pubnub"     : "4.3.2"
```




## TODO:
- Make this db agnostic.
- Make adding other domains to test simpler. Right now you have to add it in several places.
- Determine what causes the concurrency bottleneck and attempt to optimize.
 