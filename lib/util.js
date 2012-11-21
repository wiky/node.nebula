var nodeFs = require('fs'),
	nodePath = require('path'),
	nodeLog = require('util').puts;

(function(global, undefined) {
	var util = {
		each: function(obj, iterator, context) {
			if (obj == null) return;
			for (var k in obj) {
				context = context || global;
				if (obj.hasOwnProperty(k)) {
					iterator.call(context, obj[k], k, obj);
				}
			}
		},
		copy: function(obj) {
			return JSON.parse(JSON.stringify(obj));
		},
		merge: function(a, b) {
			var ret = this.copy(a);
			this.each(b, function(v, k) {
				ret[k] = v;
			});
			return ret;
		},
		diff: function(a, b) {
			var ret = {
				'add': [],
				'del': [],
				'up': []
			},
				keys = [];

			if (this.isObject(a) && this.isObject(b)) {
				keys = Object.keys(this.merge(a, b));
			} else if (this.isArray(a) && this.isArray(b)) {
				var tmp = {},
					mergers = {};
				a.forEach(function(v) {
					tmp[v] = true;
					mergers[v] = true;
				});
				a = tmp;
				tmp = {};
				b.forEach(function(v) {
					tmp[v] = true;
					mergers[v] = true;
				});
				b = tmp;
				tmp = {};
				keys = Object.keys(mergers);
			} else {
				return ret;
			}

			keys.forEach(function(k) {
				var action = '';
				if (a[k] && !b[k]) {
					action = 'del';
				}
				if (b[k] && !a[k]) {
					action = 'add';
				}
				if (a[k] && b[k] && a[k] !== b[k]) {
					action = 'up';
				}
				if (action) {
					ret[action].push(k);
				}
			});

			return ret;
		},
		substitute: function(str, obj) {
			if (typeof str === 'string' && this.isObject(obj)) {
				str = str.replace(/\{(\w+)\}/gi, function(s, k) {
					return (typeof obj[k] === 'undefined') ? s : obj[k];
				}).replace(/(\\\{)|\\\}/g, function(s, k) {
					return k ? '{' : '}';
				});
			}
			return str;
		},
		isObject: function(obj) {
			return ({}).toString.call(obj) === '[object Object]';
		},
		isArray: function(arr) {
			return ({}).toString.call(arr) === '[object Array]';
		},
		mkdirDeep: function(dir, mode, complete) {
			var arr = dir.replace(/\/$/, '').split("/"),
				existsSync = nodeFs.existsSync || nodePath.existsSync;
			mode = mode || '0755';
			complete = complete || (function() {});
			if (arr[0] === ".") { //处理 ./aaa
				arr.shift();
			}
			if (arr[0] == "..") { //处理 ../ddd/d
				arr.splice(0, 2, arr[0] + "/" + arr[1]);
			}

			function inner(cur) {
				if (cur && !existsSync(cur)) { //不存在就创建一个
					nodeFs.mkdirSync(cur, mode);
				}
				if (arr.length) {
					inner(cur + "/" + arr.shift());
				} else {
					complete();
				}
			}
			if (arr.length) {
				inner(arr.shift());
			}
		},

		getJSONFile: function (path) {
			var extname = '.json';
			if (path.lastIndexOf(extname) === -1) {
				path = path + extname;
			}
			return path; 
		},
		
		urlToDir: function (url) {
			var ret = '',
				matches;

			if (typeof url === 'string') {
				matches = url.replace(/\/$/, '').match(/.*\:\/\/(.*\/?)$/);
				if (matches && matches[1]) {
					ret = matches[1];
				}
			}

			return ret;
		},

		saveData: function (data, path) {
			var existed,
				existsSync = nodeFs.existsSync || nodePath.existsSync;
			nodeLog('[info] will save file to ' + path);
			if (data && path) {
				path = this.getJSONFile(path);
				if (typeof data === 'object') {
					data = JSON.stringify(data);
				}
				existed = existsSync(path);
				if (!existed) {
					nodeLog('[warn] Path is not existed and try to create it');
					this.mkdirDeep(path.replace(/\/[^\/]+\.json$/, ''));
				} 
				nodeLog('[info] Save file to ' + path);
				nodeFs.writeFileSync(path, data, 'utf8');
			} else {
				nodeLog('[warn] no data or no path');
			}
		}
	};
	if (typeof module !== 'undefined' && module.exports !== undefined) {
		module.exports = util;
	} else {
		global.util = util;
	}
})(this);