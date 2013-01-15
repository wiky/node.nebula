/**
 * check out or update svn and init data
 */
var nodeExec = require('child_process').exec,
	nodeFs = require('fs'),
	nodePath = require('path'),
	nodeLog = require('util').puts,
	util = require('./util'),
	cluster = require('./cluster');

var defaultConfig = {
	svnURI: '',
	branchName: '',
	branchPath: '',
	svnDir: '',
	dataDir: '/home/sites/api.aliui.com/nebula_server_data/',
	backupData: false,
	waitCo: true
};

var onRunning = {};

exports.run = function(customConfig, callback) {
	var config = util.merge(defaultConfig, customConfig || {}),
		exists = nodeFs.exists || nodePath.exists;

	//没有分支名的时候，直接返回
	if (!config.branchName) {
		return;
	}
	var branchName = config.branchName,
		svnUrl = config.svnURI.replace(/\/$/, '') + '/' + (config.branchPath || config.branchName),
		subDir = util.urlToDir(svnUrl),
		svnDir = config.svnDir,
		dataPath = nodePath.join(config.dataDir, subDir),
		clusterInc, startTime = new Date().getTime(),
		svnTimeConsume = 0;

	nodeLog('branchName: ' + branchName);
	nodeLog('svnDir: ' + svnDir);
	nodeLog('dataPath: ' + dataPath);
	nodeLog('onRunning: ' + JSON.stringify(onRunning));

	// 同一个分支，运行中的话，跳过。
	if (onRunning[svnUrl]) {
		nodeLog('[warning] Command is ignored!');
		return;
	} else {
		onRunning[svnUrl] = true;
	}
	exists(svnDir, function(existed) {
		if (!existed) {
			nodeLog('[warning] filePath is not existed!');
			// 找不到路径时，创建文件夹
			util.mkdirDeep(svnDir);
		}

		var fullPath = nodePath.join(svnDir, branchName),
			cmd = '',
			root = nodePath.resolve(fullPath, 'deploy/htdocs');

		exists(fullPath, function(existed) {
			if (existed) {
				cmd = 'cd ' + fullPath + ' && svn up --quiet';
				nodeLog('[info] svn up ...');
			} else {
				cmd = 'svn co --quiet ' + svnUrl + ' ' + fullPath;
				nodeLog('[info] svn co ...');
			}
			nodeLog('[info] CMD: ');
			nodeLog(cmd);
			nodeLog('[info] Please wait ...');

			nodeExec(cmd, function(error, stdout, stderr) {
				if (error !== null) {
					nodeLog('[error] exec error: ' + error);
					if (typeof callback === 'function') {
						callback(null, stderr);
					}
					return;
				}

				nodeLog('[info] svn exec finish!');
				nodeLog('[info] root: ' + root);
				svnTimeConsume = new Date().getTime() - startTime;
				clusterInc = cluster.create({
					root: root,
					basename: branchName,
					dataPath: dataPath
				});

				clusterInc.scanning(function() {
					if (config.backupData) {
						clusterInc.save();
					}
					delete onRunning[svnUrl];
					totleTimeConsume = new Date().getTime() - startTime;
					nodeLog('[info] SVN time:   ' + svnTimeConsume + 'ms');
					nodeLog('[info] Scan time:  ' + (totleTimeConsume - svnTimeConsume) + 'ms');
					nodeLog('[info] Total time: ' + totleTimeConsume + 'ms');
					if (typeof callback === 'function') {
						callback(clusterInc);
					}
					if (fullPath.length > 10) {
						nodeExec('rm -rf ' + fullPath, function () {
							nodeLog('[info] success delete: ' + fullPath);
						});
					}
				});
			});
			
			/**
			 * 代码需要co，但被设置了不等待co，可把co的动作异步，请求直接返回空内容
			 */
			if (!existed && !config.waitCo) {
				if (typeof callback === 'function') {
					callback(null);
				}
			}
		});
	});
};