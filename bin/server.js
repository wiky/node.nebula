var http = require('http'),
	nodeLog = require('util').puts,
	nodeParse = require('url').parse,
	build = require('../lib/build'),
	util = require('../lib/util');

var config = {
	/**
	 * 服务端口号
	 * @type {Number}
	 */
	port: 2077,
	/**
	 * 服务地址
	 * @type {String}
	 */
	host: '10.20.157.43',
	/**
	 * 建立的svn文件夹地址
	 * @type {String}
	 */
	svnDir: '/home/svn_proxy_base/hook/hooks/temp-svntail-original/',
	/**
	 * 默认的svn地址
	 */
	url: 'http://svn.alibaba-inc.com/repos/ali_intl_share/intl-style/branches/',
	/**
	 * 同时在server端备份数据
	 * @type {Boolean}
	 */
	backupData: true,
	/**
	 * 等待svn co 代码
	 * @type {Boolean}
	 */
	waitCo: false,
	/**
	 * 自动移除svn代码
	 * 完成扫描后
	 * @type {Boolean}
	 */
	autoDelete: true
};

this.onRunning = {};

/**
 * 创建服务
 */
http.createServer(function (req, res) {
	var query = nodeParse(req.url, true).query || {},
		name = query.name,
		url = query.url || config.url,
		bak = query.bak ? query.bak !== 'false' : config.backupData,
		waitCo = query.waitCo === 'true' || config.waitCo,
		autoDelete = query.autoDelete ? query.autoDelete !== 'false' : config.autoDelete;

	if (name && url) {
		nodeLog('[info] Start build, URL:' + url);
		build.run({
			svnURI: url,
			branchName: name,
			svnDir: config.svnDir + util.urlToDir(url),
			backupData: bak,
			waitCo: waitCo,
			autoDelete: autoDelete
		}, function (inc, err) {
			res.writeHead(200, {'Content-Type': 'application/json'});
			if (err) {
				res.end(JSON.stringify({
					error: err.toString()
				}));
				return;
			}
			var data = inc ? inc.getData() : '';
			nodeLog('[info] Finish');
			
			res.end(data && JSON.stringify(data));
		});
	} else {
		res.end('server is running but without build data.');
	}
}).listen(config.port, config.host);

nodeLog('Server running at http://' + config.host + ':' + config.port);