#!/usr/bin/env node

var nodeFs = require('fs'),
	nodeLog = require('util').puts,
	nodePath = require('path'),
	util = require('./util'),
	_config = require('./config');

var cluster = require('./cluster'),
	log = cluster.log,
	U = 'U',
	A = 'A',
	D = 'D';
nodeLog = module.parent.exports.debugAlert;
function saveSync(data, path, name) {
	var dataDir = nodePath.join(__dirname, (path || '../out'), (name || 'out.json'));
	nodeFs.writeFileSync(dataDir, JSON.stringify(data), 'utf-8');
}

function Nebula(config) {
	this.config = util.merge(_config, config || {});
	this.dataPath = util.getJSONFile(this.config.dataPath);
	nodeLog('datapath: ' + this.dataPath);
	if (this.config.debug) {
		nodeLog = cluster.log;
	}
	this._init();
}

Nebula.prototype = {
	_init: function() {
		var config = this.config,
			existsSync = nodeFs.existsSync || nodePath.existsSync,
			dataPath = this.dataPath,
			isExistData = existsSync(dataPath),
			dataStr, data;
		
		this.errors = [];
		this.commits = this._initCommits(config.commits);
		this.stock = cluster.create(this.config);
		this.obtain = cluster.create({
			path: '.',
			root: config.target || '.',
			mutual: false
		});
		
		if (isExistData && !config.reload) {
			dataStr = nodeFs.readFileSync(dataPath, 'utf-8');
			data = JSON.parse(dataStr);
			this.stock.load(data);
		} else {
			this.stock.scanningSync();
			this.stock.save();
		}
	},

	_initCommits: function(commits) {
		var ret = {};
		util.each(commits, function(type, path) {
			var k = nodePath.normalize(path);

			if (util.isObject(type) && type.commitType) {
				type = type.commitType;
			}

			ret[k] = type.toUpperCase();
		});
		return ret;
	},

	check: function() {
		this.errors = [];
		var commits = this.commits,
			obtain = this.obtain,
			stock = this.stock,
			data, commitsArr = Object.keys(commits);
		if (!this.stock.hasData()) {
			nodeLog('[warning] no check because no data');
			return;
		}
		obtain.scanningSync();
		data = obtain.getData();

		commitsArr.forEach(function(p) {
			this._checkOne(p);
		}, this);

		//saveSync(data, '', 'commits.json');
		//saveSync(this.errors, '', 'errors.json');

		nodeLog('pass: ' + (this.errors.length === 0));
	},

	_checkOne: function(path) {
		var commits = this.commits,
			obtain = this.obtain,
			stock = this.stock,
			commitNeed = obtain.getNeed(path),
			commitUseIn = stock.getUseIn(path),
			zip = path.replace(/\.seed$/, ''),
			commitType = commits[path],
			type = obtain.getType(path) || stock.getType(path);

		nodeLog(['commitType:', path, commitType, type].join(' '));
		// new add
		if (commitType === U && type !== 'folder') {
			// [1]提交的文件是seed，对应的js(css)已存在，需同时提交重新压缩的js(css)
			if (type === '.seed' && !(this.isAdd(zip) || this.isUp(zip))) {
				this.warning('File "{commit}" has changed but it\'s compressed file "{need}"  has no commit!', {
					commit: path,
					need: zip
				});
			}

			// 依赖
			commitNeed.forEach(function(c) {
				// 提交的文件依赖的文件不存在于库中且未新提交
				if (!stock.isExist(c) && !this.isAdd(c)) {
					this.warning('File "{need}" which "{commit}" required has no commit!', {
						commit: path,
						need: c
					});
				}

				// 依赖文件被删除
				if (this.isDel(c)) {
					this.warning('File "{commit}" which "{useIn}" required can\'t be delete!', {
						commit: c,
						useIn: path
					});
				}
			}, this);
			// 反依赖
			commitUseIn.forEach(function(c) {
				var type = stock.getType(c),
					zip = c.replace(/\.seed$/, '');
				// 依赖本次修改的文件的seed文件已经存在。
				// 1、提交新增的压缩文件
				// 2、压缩文件被修改
				// 3、seed文件和压缩文件均被删除
				// seed文件新增的情况，走[1]流程。
				if (type === '.seed' && !(this.isAdd(zip) || this.isUp(zip) || this.isDel(zip))) {
					this.warning('File "{commit}" is required by "{seed}" but it\'s compressed file "{useIn}"  has no commit!', {
						commit: path,
						seed: c,
						useIn: zip
					});
				}
			}, this);
		}

		if (commitType === A && type !== 'folder') {
			// 提交的是seed文件，其对应的js文件必需提交
			if (type === '.seed' && !(this.isAdd(zip) || this.isUp(zip))) {
				this.warning('File "{commit}" has changed but it\'s compressed file "{need}"  has no commit!', {
					commit: path,
					need: zip
				});
			}
			// 依赖
			commitNeed.forEach(function(c) {
				// 提交的文件依赖的文件不存在于库中且未新提交
				if (!stock.isExist(c) && !this.isAdd(c)) {
					this.warning('File "{need}" which "{commit}" required has no commit!', {
						commit: path,
						need: c
					});
				}

				// 依赖文件被删除
				if (this.isDel(c)) {
					this.warning('File "{commit}" which "{useIn}" require can\'t be delete!', {
						commit: c,
						useIn: path
					});
				}
			}, this);
		}

		if (commitType === D) {
			if (type !== 'folder') {
				commitUseIn.forEach(function(c) {
					// 依赖于提交删除文件的文件，没有被提交删除且没有被修改
					if (!this.isUp(c) && !this.isDel(c)) {
						this.warning('File "{commit}" required by "{useIn}" can\'t be delete!', {
							commit: path,
							useIn: c
						});
					}
					// 或修改后依然依赖，逻辑在检测修改的代码中
				}, this);
			} else {
				var list = stock.getFolderList(path);
				list.forEach(function(p) {
					var useIn = stock.getUseIn(p);
					useIn.forEach(function(c) {
						if (!this.isUp(c) && !this.isDel(c)) {
							this.warning('Folder "{commit}" child file "{file}" require "{useIn}" can\'t be delete!', {
								commit: path,
								file: p,
								useIn: c
							});
						}
					}, this);
				}, this);
			}
		}
	},

	isAdd: function(path) {
		return this.commits[path] === A;
	},

	isDel: function(path) {
		return this.commits[path] === D;
	},

	isUp: function (path) {
		return this.commits[path] === U;
	},

	pass: function() {
		var commits = this.commits,
			obtain = this.obtain,
			stock = this.stock;
		
		util.each(commits, function (commitType, commit) {
			var obtainMap = obtain.getData().map,
				data = obtainMap && obtainMap[commit];

			// 获取提交文件所有依赖项和原库中的文件依赖项比较
			if (this.isUp(commit) && data) {
				stock.update(commit, data);
			} else if (this.isAdd(commit) && data) {
				stock.add(commit, data);
			} else if (this.isDel(commit)) {
				stock.remove(commit);
			}
		}, this);

		nodeLog('pass');
		this.stock.save();
	},

	warning: function(msg, obj) {
		var warn = {
			raw: msg,
			reason: util.substitute(msg, obj),
			source: obj
		};
		this.errors.push(warn);
		return warn;
	}
};

module.exports = {
	create: function(config) {
		return new Nebula(config);
	}
};