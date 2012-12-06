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

##Integriter Rule

总的规则是：任何文件修改均需要提交依赖于该文件的压缩文件。  
除了seed文件`require`能指定依赖，独角兽的`import`也会建立文件间的依赖。

1、提交的文件是seed，需同时提交重新压缩的js(css)。	
比如，提交`abc.js.seed`，需要同时提交压缩文件`abc.js`

2、提交的文件新增了依赖的文件，需要同时提交新依赖的文件。  
比如，原先`abc.js.seed`依赖于`a.js`，新增了对`b.js`的依赖：

	abc.js.seed
		- a.js
		- b.js （新引用）

此时需要提交`abc.js.seed`, `abc.js, `b.js`

3、对seed文件所依赖的任意文件修改，需要同时提交修改的文件和引用此文件的压缩文件。  
比如：

	abc.js.seed
		- a.js
		- b.js
		- c.js

`abc.js`依赖于`a.js`, `b.js`, `c.js`，对这三个中任意文件修改，都需要同时提交`abc.js`。

4、文件只要有被引用，均不允许被删除。除非解除对文件的引用。  
比如：

	abc.js.seed
		- a.js
		- b.js
		- c.js

不允许提交删除`a.js`, `b.js`, `c.js`中任意文件。

除非同时删除引用了要删除或修改的文件的seed文件及压缩文件，以解除依赖。  
比如：

	ab.js.seed
		- a.js
		- b.js

	aa.js.seed
		- a.js

要删除`a.js`文件，需要同时删除 `a.js`, `ab.js.seed`, `aa.js.seed`, `ab.js`, `aa.js` 。或者修改`ab.js.seed`, `aa.js.seed`对`a.js`的引用。

5、删除文件夹，文件夹内有文件被依赖，不允许删除。  
规则同4。


![img](http://farm9.staticflickr.com/8346/8206909007_9678e37093_b.jpg)