var read = require('fs').readFileSync,
	_path = require('path');
/**
 * config path
 * @type {String}
 */
var	path = _path.join(__dirname, '../config.json');

var config = JSON.parse(read(path, 'utf-8').replace(/^\s*\/\/.*[\r\n]/gim, ''));

/**
 * 数组转成对象
 * @param  {Array} arr  目标数组
 * @return {Object}     结果对象
 */
function arrToObj(arr) {
	var obj = {};

	arr.forEach(function (a) {
		obj[a] = true;
	});

	return obj;
}

// 把extname数组转换成对象，便于检索
config.extname = arrToObj(config.extname);
// 把filter数组转换成对象
config.exclude = arrToObj(config.exclude);
// 导出config
module.exports = config;