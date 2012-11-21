/**
 * 分批遍历对象或数组
 * 
 * @param  {Array|Object} arr        目标对象
 * @param  {Function}     iterator   遍历迭代器
 * @param  {Function}     [callback] 全部完成遍历后的回调
 * @param  {Number}       [limit]    每个批次的数量，默认100
 */
module.exports.each = function (arr, iterator, callback, limit) {
	var completed = 0,
		started = 0,
		running = 0;

	if (({}).toString.call(arr) === '[object Object]') {
		arr = Object.keys(arr);
	}
	arr = [].concat(arr || []);
	callback = callback || function () {};
	limit = limit || 100;
	if (!arr.length || limit <= 0) {
		return callback();
	}

	(function batch() {
		var current;
		if (completed === arr.length) {
			return callback();
		}

		while (running < limit && started < arr.length) {
			started += 1;
			running += 1;
			current = arr[started - 1];
			iterator(current, function (err) {
				if (err) {
					callback(err);
					callback = function () {};
				} else {
					completed += 1;
					running -= 1;
					if (completed === arr.length) {
						callback();
					} else {
						batch();
					}
				}
			});
		}
	})();
};