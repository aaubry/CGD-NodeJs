var request = require("request");

var baseUrl = "https://app.caixadirecta.cgd.pt/apps/r/";

var appHeaders = {
	"X-CGD-APP-Device": "w8",
	"X-CGD-APP-Version": "3.2"
};

function handle_error(handler, cb) {
	return function (err, response, body) {
		if(err) return cb(err);
		if(response.statusCode != 200) {
			console.warn(body);
			return cb("HTTP status code " + response.statusCode, null);
		}
		handler(response, body);
	};
}

function pad_number(val, length, padding) {
	padding = padding || "0";
	
	val = parseInt(val);
	var isNegative = val < 0;
	if(isNegative) val = -val;
	
	val = val.toString();
	
	while(val.length < length) {
		val = padding + val;
	}
	
	return isNegative ? "-" + val : val;
}

function format_date(date, hour) {
	hour = hour != null ? hour : "00:00:00";
	
	var year = pad_number(date.getFullYear(), 4);
	var month = pad_number(date.getMonth() + 1, 2);
	var day = pad_number(date.getDate(), 2);
	return year + "-" + month + "-" + day + " " + hour;
}

function parse_date(val) {
	return val.match(/^(\d{4}-\d{2}-\d{2})/)[1];
}

function string_to_date(val) {
	var match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
	return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
}

function compare_dates(first, second) {
	var diff = first.getFullYear() - second.getFullYear();
	if(diff == 0) {
		diff = first.getMonth() - second.getMonth();
		if(diff == 0) {
			diff = first.getDate() - second.getDate();
		}
	}
	
	return diff;
}

function parse_money(val) {
	return pad_number(val, 3).replace(/^(-?\d*)(\d\d)$/, "$1,$2");
}

exports.authenticate = function(username, password, cb) {
	
	console.warn("Sending authentication request");
	var auth = request.jar();
	request({
		url: baseUrl + "co/li?u=" + username,
		headers: appHeaders,
		jar: auth,
		json: {},
		auth: {
			user: username,
			pass: password
		}
	}, handle_error(authentication_complete, cb));
	
	function authentication_complete(response, body) {
		console.warn("Successfully authenticated");
		cb(null, auth);
	}
}

exports.get_accounts = function(auth, cb) {
	var pendingRequests = 2;
	var accounts = [];
	
	console.warn("Requesting account list");
	request({
		url: baseUrl + "pg/l",
		headers: appHeaders,
		jar: auth,
		json: {}
	}, handle_error(accounts_retrieved, cb));
	
	console.warn("Requesting card list");
	request({
		url: baseUrl + "c/dc",
		headers: appHeaders,
		jar: auth,
		json: {}
	}, handle_error(cards_retrieved, cb));
	
	function accounts_retrieved(response, body) {
		console.warn("Account list retrieved");
		
		for(var name in body) {
			body[name].forEach(function(e) {
				e.ttl.forEach(function(l) {
					l.cttl.forEach(function(a) {
						accounts.push({
							id: a.cntk,
							name: a.cnt,
							type: a.tc,
							balance: parse_money(a.scnt)
						});
					});
				});
			});
		}
		
		if(--pendingRequests == 0) cb(null, accounts);
	}

	function cards_retrieved(response, body) {
		console.warn("Card list retrieved");
		
		body.cl.forEach(function(c) {
			accounts.push({
				id: c.ccc,
				name: c.dcc,
				type: c.tc,
				balance: null
			});
		});
		
		if(--pendingRequests == 0) cb(null, accounts);
	}
}

exports.get_movements = function(auth, account, startDate, endDate, chunkCb, cb) {
	if(/^PT /.test(account)) {
		get_account_movements(auth, account, startDate, endDate, chunkCb, cb);
	} else {
		get_card_movements(auth, account, startDate, endDate, chunkCb, cb);
	}	
}

function get_account_movements(auth, account, startDate, endDate, chunkCb, cb) {
	console.warn("Requesting movements of account " + account + " between " + format_date(startDate, "") + "and " + format_date(endDate, ""));
	
	var query = {
		cnt: account,
		dti: format_date(startDate, "00:00:00"),
		dtf: format_date(endDate, "23:59:59")
	};
	
	retrieve_next_page();

	function retrieve_next_page() {
		request({
			url: baseUrl + "cnt/dc/m",
			headers: appHeaders,
			jar: auth,
			method: "POST",
			json: query
		}, handle_error(movements_retrieved, cb));
	}
	
	function movements_retrieved(response, body) {
		console.warn("Movement chunk retrieved");
		
		var movements = null;
		
		if(body.lmovdpe != null) {
			movements = [];
			
			var today = new Date();
			body.lmovdpe.forEach(function(m) {
				/*
					{ moe: 'EUR',
					   tj: 330,
					   dta: '2012-07-05 00:00:00',
					   nsd: 6,
					   mcnt: 50000,
					   dtpv: '2014-07-05 00:00:00',
					   dtij: null,
					   mit: null,
					   dst: null,
					   dspe: null,
					   dsp: '730 dias',
					   dspr: 'CaixaNet24M Nº 6',
					   dsr: null,
					   dsttc: null,
					   msgb1: null,
					   msgb2: null,
					   msgh: null,
					   dt: '2012-07-05 00:00:00',
					   mon: 50000,
					   des: null,
					   tpm: null,
					   saps: 50000 }
				*/
				
				movements.push({
					description: m.dspr,
					date: parse_date(m.dt),
					value_date: parse_date(m.dtpv),
					number: m.nsd,
					debit: "0,00",
					credit: parse_money(m.mon),
					balance: parse_money(m.saps)
				});
				
				var expirationDate = string_to_date(m.dtpv);
				if(compare_dates(today, expirationDate) >= 0) {
					movements.push({
						description: m.dspr,
						date: parse_date(m.dt),
						value_date: parse_date(m.dtpv),
						number: m.nsd,
						debit: parse_money(m.mon),
						credit: "0,00",
						balance: parse_money(m.saps)
					});
				}
			});
		} else if(body.lmov != null) {
			movements = body.lmov.map(function(m) {
				/*
					{ tj: 0,
					  moeo: 'EUR',
					  monmo: 1180,
					  dtv: '2013-01-01 00:00:00',
					  sdaps: 47659,
					  ndc: 0,
					  nmv: 732,
					  estor: '',
					  apor: 'VR',
					  dt: '2013-01-01 00:00:00',
					  mon: 1180,
					  des: 'Compras LIDL 29 12',
					  tpm: 'D',
					  saps: 47659 }
				*/
				
				return {
					description: m.des,
					date: parse_date(m.dt),
					value_date: parse_date(m.dtv),
					number: m.nmv,
					debit: m.tpm == "D" ? parse_money(m.mon) : "0,00",
					credit: m.tpm == "C" ? parse_money(m.mon) : "0,00",
					balance: parse_money(m.saps)
				};
			});
		} else {
			console.error(body);
			return cb("Unexpected response");
		}
		
		chunkCb(movements);
		
		if(body.lp) {
			console.warn("All movements have been retrieved");
			cb(null);
		} else {
			query.pkl = body.pkl;
			retrieve_next_page();
		}
	}
}

function get_card_movements(auth, account, startDate, endDate, chunkCb, cb) {
	
	var monthDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
	
	retrieve_next_page();

	function retrieve_next_page() {
		console.warn("Requesting movements of card " + account + " for month " + format_date(monthDate).substr(0, 7));

		request({
			url: baseUrl + "c/mc/" + encodeURIComponent(account) + "/" + encodeURIComponent(format_date(monthDate, "00:00:00")),
			headers: appHeaders,
			jar: auth,
			json: {}
		}, handle_error(movements_retrieved, cb));
	}
	
	function movements_retrieved(response, body) {
		console.warn("Movement chunk retrieved");
		
		var movements = [];
		
		if(body.lmov.cl == null) {
			console.error(body);
			return cb("Unexpected response");
		}
		
		body.lmov.cl.push({ mcl: body.lmov.movccl });
		
		body.lmov.cl.forEach(function(g) {
			g.mcl.forEach(function(m) {
				/*
					{
						"dt":"2013-04-16 00:00:00",
						"cred":321,
						"deb":null,
						"pnp":null,
						"numc":"",
						"dtv":"2013-04-16 00:00:00",
						"crtd":"10057469750 - EUR - Leve",
						"movd":"CASHBACK PARA PPR CARTAO LEVE"
					 }
				*/
				movements.push({
					description: m.movd,
					date: parse_date(m.dt),
					value_date: parse_date(m.dtv),
					number: null,
					debit: m.deb != null ? parse_money(m.deb) : "0,00",
					credit: m.cred != null ? parse_money(m.cred) : "0,00",
					balance: null
				});
			});
		});
		
		chunkCb(movements);
		
		monthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
		if(compare_dates(monthDate, endDate) <= 0) {
			retrieve_next_page();
		} else {
			console.warn("All movements have been retrieved");
			cb(null);
		}
	}
}

