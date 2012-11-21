#!/usr/bin/env node

var nodeFs = require('fs'),
	nodePath = require('path'),
	util = require('./util'),
	_async = require('./async'),
	_config = require('./config'),
	nodeLog = _config.debug ? require('util').puts : (function () {});

function readFile(file, callback) {
	nodeFs.readFile(file, 'utf-8', callback);
}

function readFileSync(file) {
	return nodeFs.readFileSync(file, 'utf-8');
}

var log = (function() {
	var logs = [];
	return function() {
		var dir = nodePath.join(__dirname, '../out/log.txt');
		var args = Array.prototype.slice.call(arguments);
		var msg = args.join(' ');
		nodeLog(msg);
		logs.push(msg);
		nodeFs.writeFileSync(dir, logs.join('\n'), 'utf-8');
	};
})();

function Cluster(config) {
	var config = this.config = util.merge(_config, config || {});
	this.root = nodePath.normalize(config.root || '');
	this.map = {};
	this.notExist = {};
	this._init();
}

Cluster.prototype = {
	/**
	 * 初始化
	 *
	 * @private
	 */
	_init: function() {
		var config = this.config,
			path = [].concat(config.path),
			root = this.root,
			mutual = false;

		this._path = [];
		this._noScanned = true;
		path.forEach(function(p) {
			var absolutePath = this.absoluteRoot(p);
			this._path.push(absolutePath);
		}, this);
		if (path.length === 1) {
			this._path = this._path[0];
			mutual = true;
		}

		if (typeof config.mutual === 'undefined') {
			this._mutual = mutual;
		} else {
			this._mutual = config.mutual;
		}
	},
	/**
	 * 加载数据
	 *
	 * @public
	 * @param {Object} data 数据源
	 */
	load: function(data) {
		if (data && data.map) {
			this.root = data.root;
			this.map = data.map;
			this.notExist = data.notExist;
		}
	},
	/**
	 * 重置数据
	 *
	 * @public
	 */
	reset: function() {
		this.root = nodePath.normalize(this.config.root);
		this.map = {};
		this.notExist = {};
	},
	/**
	 * 异步扫描路径下文件
	 *
	 * @public
	 * @param  {String|Array}   path     扫描的路径
	 * @param  {Function}       callback 扫描完成后回调
	 * @param  {Boolean}        [noDeep] 不深度扫描，默认是深度扫描
	 */
	scanning: function(path, callback, noDeep) {
		if (typeof path === 'function') {
			noDeep = callback;
			callback = path;
			path = null;
		}
		callback = callback || (function() {});
		this._scan(path, !noDeep, callback);
	},

	/**
	 * 同步扫描路径下文件
	 * @param  {String|Array} path     扫描的路径
	 * @param  {Boolean}      [noDeep] 不深度扫描，默认是深度扫描
	 */
	scanningSync: function(path, noDeep) {
		this._scan(path, !noDeep);
	},
	/**
	 * 扫描路径下文件
	 *
	 * @private
	 * @param  {String|Array}   path     扫描的路径
	 * @param  {Boolean}        deep     是否深度扫描
	 * @param  {Function}       callback 扫描后回调，如果传入值则使用异步扫描，否则为同步扫描
	 */
	_scan: function(path, deep, callback) {
		path = path || this._path;
		path = [].concat(path);
		this._noScanned = false;

		path.forEach(function(p) {
			this._scanDir(p, deep);
		}, this);

		this._scanFiles(callback);
	},
	/**
	 * 扫描目录
	 *
	 * @private
	 * @param  {String}   path     扫描的路径
	 * @param  {Boolean}        deep     是否深度扫描
	 */
	_scanDir: function(path, deep) {
		var _self = this,
			config = this.config,
			root = this.root,
			map = this.map,
			extname = config.extname,
			exclude = config.exclude;

		// 扫描迭代器
		(function doScan(path) {
			var existsSync = nodeFs.existsSync || nodePath.existsSync,
				stat = path && existsSync(path) && nodeFs.statSync(path),
				// 当前文件(夹)相对于根目录的路径
				relativePath = _self.relativeRoot(path) || '.',
				// 文件夹或文件类型
				type = 'folder',
				// 当前文件夹的子文件(夹)列表
				subPaths = [];

			nodeLog('[Index] ' + relativePath);
			// 类型为文件
			if (stat && stat.isFile()) {
				// 文件类型
				type = nodePath.extname(path);
				// 如果文件类型属于扫描类型
				if (extname[type]) {
					map[relativePath] = {
						'=': type
					};
				}
			} else if (stat && stat.isDirectory()) { // 类型为文件夹
				// folder
				map[relativePath] = {
					'=': type
				};
				if (deep) {
					// 读取子目录
					subPaths = nodeFs.readdirSync(path);
					// 遍历子文件\子文件夹
					subPaths.forEach(function(subPath) {
						var absoluteSub, relativeSub;

						// 从当前文件(夹)到子文件(夹)的绝对路径
						absoluteSub = nodePath.join(path, subPath);
						// 从根目录到子文件(夹)的相对路径
						relativeSub = _self.relativeRoot(absoluteSub);
						// 不在过滤规则内
						if (!exclude[subPath] && !exclude[absoluteSub] && !exclude[relativeSub]) {
							// 递归扫描子文件(夹)
							doScan(absoluteSub);
							// 子文件(夹)依赖于父文件夹
							_self.createDependent(relativeSub, relativePath);
						}
					});
				}
			} else {
				_self._noScanned = true;
			}
		})(path);
	},
	/**
	 * 扫描文件，提取依赖
	 *
	 * @private
	 * @param  {Function} [callback] 回调，如果指定回调则以异步的方式扫描，否则为同步方式。
	 */
	_scanFiles: function(callback) {
		//nodeLog('callback:', callback);
		var _self = this,
			config = this.config,
			root = this.root,
			relative = config.relative,
			rules = config.rule,
			map = this.map,
			mapArr = Object.keys(map);

		if (callback) {
			_async.each(mapArr, function(p, fn) {
				// 系统根目录到此文件类型根目录的相对路径
				var type = map[p]['='],
					fileRoot = relative[type],
					rule = rules[type],
					filePath;

				if (typeof fileRoot !== 'undefined' && rule) {
					nodeLog('[Extract] ' + p);
					filePath = _self.absoluteRoot(p);
					readFile(filePath, function(err, content) {
						if (err) {
							fn(err);
							return;
						}
						fn();
						_self._extractFileDependent(content, filePath, fileRoot, rule);
					});
				} else {
					fn();
				}
			}, callback, 100);
		} else {
			mapArr.forEach(function(p) {
				// 系统根目录到此文件类型根目录的相对路径
				var type = map[p]['='],
					fileRoot = relative[type],
					rule = rules[type],
					filePath, content;

				if (typeof fileRoot !== 'undefined' && rule) {
					nodeLog('[Extract] ' + p);
					filePath = _self.absoluteRoot(p);
					content = readFileSync(filePath);
					this._extractFileDependent(content, filePath, fileRoot, rule);
				}
			}, this);
		}
	},
	/**
	 * 提取文件对其他文件的依赖
	 *
	 * @private
	 * @param {String} filePath 文件位置，绝对路径
	 * @param {String} fileRoot 文件内描述的依赖的根目录
	 */
	_extractFileDependent: function(content, filePath, fileRoot, rule) {
		if (!rule) {
			return;
		}
		// 当前文件所引用的文件列表
		var requires = content.match(new RegExp(rule, 'gm')) || [],
			// 从根目录到当前文件的相对路径
			relativeRoot = this.relativeRoot(filePath);

		requires.forEach(function(item) {
			var matches = item.trim().match(new RegExp(rule)) || [],
				// 从根目录到当前文件所引用的文件相对路径
				rootToFile = '';
			// 从根目录到当前文件所在目录相对路径
			dirname = nodePath.dirname(relativeRoot);

			// 相对于文件根目录
			if (matches[1] === '<') {
				rootToFile = nodePath.join(fileRoot, matches[2]);
			} else if (matches[1] === '"') { // 相对于当前文件所在目录
				rootToFile = nodePath.join(dirname, matches[2]);
			}

			if (rootToFile) {
				this.createDependent(relativeRoot, rootToFile);
			}
		}, this);
	},

	/**
	 * 获取从根目录到另外一个目录的相对路径
	 *
	 * @public
	 * @param {String} path 完整目标路径
	 * @return {String} 相对路径
	 */
	relativeRoot: function(path) {
		var root = this.root;
		path = nodePath.normalize(path);
		if (path.substr(0, root.length) === root) {
			path = nodePath.relative(root, path);
		}
		return path;
	},
	/**
	 * 获取一个相对根目录的目录的绝对路径
	 *
	 * @public
	 * @param  {String} path 相对根目录的路径
	 * @return {String}      绝对路径
	 */
	absoluteRoot: function(path) {
		var root = this.root;
		path = nodePath.normalize(path);
		if (path.substr(0, root.length) !== root) {
			path = nodePath.join(root, path);
		}
		return path;
	},

	/**
	 * 建立依赖，a依赖于b
	 *
	 * @public
	 * @param {String} a 依赖于，主动方，相对于根目录的路径
	 * @param {String} b 被依赖，被动方，相对于根目录的路径
	 */
	createDependent: function(a, b) {
		var map = this.map,
			config = this.config;
		
		if (!map[a]) {
			return;
		}

		if (!this._mutual || (this._mutual && map[b])) {
			// 把b写入a的'依赖于( > )'中
			map[a]['>'] = map[a]['>'] || {};
			map[a]['>'][nodePath.relative(a, b)] = 1;
		}
		// 双向依赖
		if (this._mutual && map[b]) {
			// 把a写入b的'被依赖( < )'中
			map[b]['<'] = map[b]['<'] || {};
			map[b]['<'][nodePath.relative(b, a)] = 1;
		} else if (this._mutual && !map[b]) {
			nodeLog('[WARNING]: "' + b + '" is not exist!');
			this.notExist[b] = this.notExist[b] || [];
			this.notExist[b].push(a);
		}
	},
	/**
	 * 添加数据
	 *
	 * @public
	 * @param {String} path 新增路径，相对路径
	 * @param {Object} obj  路径的依赖信息
	 */
	add: function(path, obj) {
		if (this.isExist(path) || !obj) {
			return;
		}
		var newNeed = obj['>'],
			dirname = nodePath.dirname(path);

		this.map[path] = {};
		this.map[path]['='] = obj['='];
		// 依赖上级文件夹
		this.createDependent(path, dirname);
		// 依次新增依赖
		util.each(newNeed, function(v, k) {
			this.createDependent(path, nodePath.join(path, k));
		}, this);

	},

	/**
	 * 移除一条记录，并解除与该数据相关的依赖
	 *
	 * @public
	 * @param  {String} path 记录路径
	 */
	remove: function(path) {
		if (!this.isExist(path)) {
			return;
		}
		var need = this.getNeed(path),
			useIn = this.getUseIn(path);

		need.forEach(function(n) {
			var type = this.getType(n);
			if (type === 'folder') {
				this.detachDependent(path, n);
			} else {
				this.detachDependent(path, nodePath.join(path, n));
			}
		}, this);

		useIn.forEach(function(n) {
			this.detachDependent(n, nodePath.join(path, n));
		}, this);

		delete this.map[path];
	},

	update: function(path, obj) {
		if (!this.isExist(path) || !obj) {
			return;
		}
		var newNeed = obj['>'],
			oldNeed = this.map[path]['>'],
			diff = util.diff(oldNeed, newNeed);

		diff['del'].forEach(function(p) {
			this.detachDependent(path, nodePath.join(path, p));
		}, this);
		diff['add'].forEach(function(p) {
			this.createDependent(path, nodePath.join(path, p));
		}, this);
	},
	/**
	 * 解除a对b依赖，b不传入时，解除a的所有依赖
	 *
	 * @public
	 * @param {String} a   依赖于，主动方，相对于根目录的路径
	 * @param {String} [b] 被依赖，被动方，相对于根目录的路径
	 */
	detachDependent: function(a, b) {
		var map = this.map,
			deps = [];

		if (a && b) {
			if (map[a] && map[a]['>']) {
				delete map[a]['>'][nodePath.relative(a, b)];
			}
			if (map[b] && map[b]['<']) {
				delete map[b]['<'][nodePath.relative(b, a)];
			}
		} else if (map[a] && !b && map[a]['>']) {
			deps = Object.keys(map[a]['>']);
			deps.forEach(function(p) {
				detachDependent(a, nodePath.join(a, p));
			});
		}
	},

	/**
	 * 文件是否存在于库中
	 *
	 * @public
	 * @param  {String}  path 文件(夹)路径
	 * @return {Boolean}      是否存在
	 */
	isExist: function(path) {
		path = this.relativeRoot(path);
		return !!this.map && !!this.map[path];
	},

	/**
	 * 获取依赖
	 * @param  {String} path 文件（夹）地址
	 * @param  {String} key  类型（依赖或被依赖）
	 * @return {Array} 结果集
	 */
	_getDependentByKey: function(path, key) {
		var ret = [],
			map = this.map,
			vals;
		path = this.relativeRoot(path);

		if (map[path] && map[path][key]) {
			vals = Object.keys(map[path][key]);
			vals.forEach(function(val) {
				ret.push(nodePath.join(path, val));
			}, this);
		}

		return ret;
	},

	/**
	 * 获取指定的文件（夹）所依赖的文件
	 * @param  {String} path 文件(夹)路径
	 * @return {Array} 结果集
	 */
	getNeed: function(path) {
		return this._getDependentByKey(path, '>');
	},

	/**
	 * 获取指定的文件（夹）被依赖的文件
	 * @param  {String} path 文件(夹)路径
	 * @return {Array} 结果集
	 */
	getUseIn: function(path) {
		return this._getDependentByKey(path, '<');
	},

	/**
	 * 获取文件(夹)类型
	 *
	 * @public
	 * @param  {String} path 文件(夹)路径
	 * @return {String}      类型
	 */
	getType: function(path) {
		var ret = '',
			map = this.map;

		path = this.relativeRoot(path);

		return (map[path] && map[path]['=']) || '';
	},
	/**
	 * 文件夹路径下所有有效文件
	 *
	 * @public
	 * @param  {String} path 文件夹路径
	 * @return {Array}       文件列表
	 */
	getFolderList: function(path) {
		var ret = [],
			iterator;

		path = this.relativeRoot(path);

		if (this.getType(path) === 'folder') {
			var iterator = function(path) {
					var useIn = this.getUseIn(path);
					useIn.forEach(function(p) {
						if (this.getType(p) === 'folder') {
							iterator.call(this, p);
						} else {
							ret.push(p);
						}
					}, this);

				};
			iterator.call(this, path);
		}
		return ret;
	},
	
	/**
	 * 是否已经扫描
	 * @return {Boolean} 是否已经扫描
	 */
	hasScanned: function () {
		return !this._noScanned;
	},

	/**
	 * 是否有数据
	 * @return {Boolean} 是否有数据
	 */
	hasData: function () {
		var hasData = false;
		this.map = this.map || {};
		for (var k in this.map) {
			hasData = true;
			break;
		}
		return hasData;
	},

	/**
	 * 保存数据源文件
	 */
	save: function (path) {
		var dataPath = path || this.config.dataPath || '',
			resolvePath = nodePath.resolve(dataPath),
			data = this.getData();

		
		if (dataPath && this.hasData()) {
			nodeLog('[info] save to: ' + dataPath);
			util.saveData(data, resolvePath);
		} else {
			nodeLog('[warn] No save');
		}
	},

	/**
	 * 获取数据
	 * @return {Object} 数据
	 */
	getData: function() {
		return {
			root: this.root,
			map: this.map,
			notExist: this.notExist
		};
	},

	/**
	 * 校验某个文件依赖和被依赖
	 * @param  {String} path 文件路径
	 * @return {Array}      依赖不存在和被依赖不存在的文件集合
	 */
	check: function(path) {
		path = this.relativeRoot(path);
		var need = this.getNeed(path),
			useIn = this.getUseIn(path),
			needNotExist = [],
			useInNotExist = [];

		need.forEach(function(n) {
			if (!this.isExist(n)) {
				needNotExist.push(n);
			}
		}, this);

		useIn.forEach(function(n) {
			if (!this.isExist(n)) {
				useInNotExist.push(n);
			}
		}, this);

		return [needNotExist, useInNotExist];
	}
};


module.exports = {
	create: function(config) {
		return new Cluster(config);
	},
	log: log
};