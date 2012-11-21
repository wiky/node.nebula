##Run as a Server

run server command

	node ./bin/server.js
	
run server background command 

	nohup node ./bin/server.js > /dev/null 2>&1 &

example:

	nohup node /home/sites/api.aliui.com/node_modules/node.nebula/bin/server.js > ./out/nohup-log.txt 2>&1 &
	
When server is running, you can use `url` and `name` parameter to require data.

for example:

	http://10.20.157.43:2077/build?url=http://svn.alibaba-inc.com/repos/ali_intl_share/intl-style/branches&name=20120814_165927_1
	
##Run as a Scanner

	var cluster = require('./lib/cluster'),
		clusterInc = cluster.create({
			// scan file root 
			root: ''
		});
		
		clusterInc.scanning(function () {
			// something callback
		});
		
##Run as a Interceptor

	var nebula = require('./lib/nebula'),
		nebulaInc = nabula.create({
			// commit file root
			target: '',
			// commit items
			commits: [],
			// source svn warehouse data direction
			dataDir: ''
		});
		
		nebulaInc.check();
		
		if (nebulaInc.errors.length !== 0) {
			nebulaInc.pass();
		}