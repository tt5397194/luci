'use strict';

var rpcRequestID = 1,
    rpcSessionID = L.env.sessionid || '00000000000000000000000000000000',
    rpcBaseURL = L.url('admin/ubus');

return L.Class.extend({
	call: function(req, cb) {
		var q = '';

		if (Array.isArray(req)) {
			if (req.length == 0)
				return Promise.resolve([]);

			for (var i = 0; i < req.length; i++)
				q += '%s%s.%s'.format(
					q ? ';' : '/',
					req[i].params[1],
					req[i].params[2]
				);
		}
		else {
			q += '/%s.%s'.format(req.params[1], req.params[2]);
		}

		return L.Request.post(rpcBaseURL + q, req, {
			timeout: (L.env.rpctimeout || 5) * 1000,
			credentials: true
		}).then(cb);
	},

	handleListReply: function(req, msg) {
		var list = msg.result;

		/* verify message frame */
		if (typeof(msg) != 'object' || msg.jsonrpc != '2.0' || !msg.id || !Array.isArray(list))
			list = [ ];

		req.resolve(list);
	},

	handleCallReply: function(req, res) {
		var type = Object.prototype.toString,
		    msg = null;

		if (!res.ok)
			L.error('RPCError', 'RPC call failed with HTTP error %d: %s',
				res.status, res.statusText || '?');

		msg = res.json();

		/* fetch response attribute and verify returned type */
		var ret = undefined;

		/* verify message frame */
		if (typeof(msg) == 'object' && msg.jsonrpc == '2.0') {
			if (typeof(msg.error) == 'object' && msg.error.code && msg.error.message)
				req.reject(new Error('RPC call failed with error %d: %s'
					.format(msg.error.code, msg.error.message || '?')));
			else if (Array.isArray(msg.result) && msg.result[0] == 0)
				ret = (msg.result.length > 1) ? msg.result[1] : msg.result[0];
		}
		else {
			req.reject(new Error('Invalid message frame received'));
		}

		if (req.expect) {
			for (var key in req.expect) {
				if (ret != null && key != '')
					ret = ret[key];

				if (ret == null || type.call(ret) != type.call(req.expect[key]))
					ret = req.expect[key];

				break;
			}
		}

		/* apply filter */
		if (typeof(req.filter) == 'function') {
			req.priv[0] = ret;
			req.priv[1] = req.params;
			ret = req.filter.apply(this, req.priv);
		}

		req.resolve(ret);
	},

	list: function() {
		var msg = {
			jsonrpc: '2.0',
			id:      rpcRequestID++,
			method:  'list',
			params:  arguments.length ? this.varargs(arguments) : undefined
		};

		return this.call(msg, this.handleListReply);
	},

	declare: function(options) {
		return Function.prototype.bind.call(function(rpc, options) {
			var args = this.varargs(arguments, 2);
			return new Promise(function(resolveFn, rejectFn) {
				/* build parameter object */
				var p_off = 0;
				var params = { };
				if (Array.isArray(options.params))
					for (p_off = 0; p_off < options.params.length; p_off++)
						params[options.params[p_off]] = args[p_off];

				/* all remaining arguments are private args */
				var priv = [ undefined, undefined ];
				for (; p_off < args.length; p_off++)
					priv.push(args[p_off]);

				/* store request info */
				var req = {
					expect:  options.expect,
					filter:  options.filter,
					resolve: resolveFn,
					reject:  rejectFn,
					params:  params,
					priv:    priv
				};

				/* build message object */
				var msg = {
					jsonrpc: '2.0',
					id:      rpcRequestID++,
					method:  'call',
					params:  [
						rpcSessionID,
						options.object,
						options.method,
						params
					]
				};

				/* call rpc */
				rpc.call(msg, rpc.handleCallReply.bind(rpc, req));
			});
		}, this, this, options);
	},

	getSessionID: function() {
		return rpcSessionID;
	},

	setSessionID: function(sid) {
		rpcSessionID = sid;
	},

	getBaseURL: function() {
		return rpcBaseURL;
	},

	setBaseURL: function(url) {
		rpcBaseURL = url;
	}
});
