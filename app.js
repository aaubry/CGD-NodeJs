var program = require("commander");
var prompt = require("prompt");
var Table = require("easy-table");
var api = require("./api");
var keyring = require("./keyring");
var date = require("./date");
var fs = require("fs");
var ofx = require("ofx");

prompt.start();

program
	.version("0.0.1")
	.option("-v, --verbose", "print additional information to stderr")
	.option("-u, --user <user>", "authenticate as <user>")
	.option("-p, --save-password", "load / save password from keyring")
	.option("-o, --output <outputFile>", "output data to <outputFile>")
	.option("-f, --format <format>", "output data to <format> [tsv|ofx|qif]", "tsv");

program
	.command("accounts")
	.description("List accounts")
	.action(authenticated(list_accounts));

program
	.command("movements <account>")
	.description("Retrieve movements")
	.option("-s, --start-date <startDate>", "get movements starting from <startDate>")
	.option("-e, --end-date <endDate>", "get movements starting from <endDate>")
	.option("-g, --group", "group movements by month")
	.action(authenticated(retrieve_movements));

program.parse(process.argv);

if(program.args.length == 0) {
	program.help();
}

var export_formats = {
	tsv: function(val, fileName) {
		var lines = [];
		val.forEach(function(a) {
			var line = [];
			for(var name in a) {
				line.push(a[name]);
			}
			lines.push(line.join("\t"));
		});
		fs.writeFile(fileName, lines.join("\n"));
	},
	qif: function(val, fileName) {
		var lines = ["!type:Bank"];
		val.forEach(function(a) {
			lines.push("D" + a.date);
			if(a.debit != null) {
				lines.push("T-" + a.debit);
			} else {
				lines.push("T" + a.credit);
			}
			lines.push("M" + a.description);
			lines.push("N" + a.number);
			lines.push("^");
		});
		fs.writeFile(fileName, lines.join("\n"));
	},
	ofx: function(val, fileName) {
		/*var header = {
			OFXHEADER: "100",
			DATA: "OFXSGML",
			VERSION: "103",
			SECURITY: "NONE",
			ENCODING: "USASCII",
			CHARSET: "1252",
			COMPRESSION: "NONE",
			OLDFILEUID: "NONE",
			NEWFILEUID: "unique id here"
		};
		
		var body = {
			SIGNONMSGSRQV1: {
			  SONRQ: {
				DTCLIENT: "value",
				USERID: "user id",
				USERPASS: "password",
				LANGUAGE: "ENG",
				FI: {
				  ORG: "org",
				  FID: "fid"
				},
				APPID: "QWIN",
				APPVER: "2100",
				CLIENTUID: "needed by some places"
			  }
			}
		};

		var ofx_string = ofx.serialize(header, body);
		fs.writeFile(fileName, ofx_string);		
		*/ 
	}
};

function print_table(val, suffix) {
	if(program.output) {
		var fileName = program.output;
		if(suffix != null) {
			var fileNameMatch = /^(.*)\.(\w+)$/.exec(program.output);
			fileName = [fileNameMatch[1], suffix, fileNameMatch[2]].join(".");
		}
			
		export_formats[program.format](val, fileName);
	} else {
		var tbl = Table.printArray(val);
		console.log(tbl.toString());
	}
}

function authenticated(action) {
	return function() {
		
		var args = Array.prototype.slice.call(arguments);
		
		if(program.verbose != true) {
			console.warn = function() {}
		}
		
		if(program.user == null) {
			prompt.get(
				[{
					name: "username",
					required: true
				}],
				function(err, res) {
					program.user = res.username;
					username_available(err);
				}
			);
		} else {
			username_available(null);
		}
		
		function username_available(err) {
			if(err) return console.error("ERROR", err);

			if(program.savePassword) {
				keyring.get_password("CGD", program.user, function(err, pass) {
					if(err) return console.error("ERROR", err);
					
					if(pass != null) {
						program.password = pass;
						password_available(null);
					} else {
						prompt_password(function(err) {
							if(err) return console.error("ERROR", err);
							
							keyring.set_password("CGD", program.user, program.password, password_available);
						});
					}
				});
			} else {
				prompt_password(password_available);
			}
		}
		
		function prompt_password(cb) {
			prompt.get(
				[{
					name: "password",
					required: true,
					hidden: true
				}],
				function(err, res) {
					program.password = res.password;
					cb(err);
				}
			);
		}
		
		function password_available(err) {
			if(err) return console.error("ERROR", err);
			
			api.authenticate(program.user, program.password, function(err, auth) {
				if(err) return console.error("ERROR", err);

				args.push(auth);
				action.apply(this, args);
			});
		}
	}
}

function list_accounts(args, auth) {
	api.get_accounts(auth, function(err, accounts) {
		if(err) return console.error("ERROR", err);
		print_table(accounts);
	});
}

function retrieve_movements(account, args, auth) {
	
	var dateRange = date.parse_range(args.startDate, args.endDate);
	api.get_movements(auth, account, dateRange.start, dateRange.end, chunk_retrieved, movements_retrieved);
	
	var movements = [];
	
	function chunk_retrieved(chunk) {
		movements.push.apply(movements, chunk);
	}
	
	function movements_retrieved(err) {
		if(err) return console.error("ERROR", err);
		console.warn("Done");
		
		if(args.group && movements.length > 0) {
			
			var group = [];
			var currentMonth = movements[0].date.substr(0, 7);
			movements.push({ date: "XXXX-XX-XX" });
			movements.forEach(function(m) {
				var month = m.date.substr(0, 7);
				if(month != currentMonth) {
					print_table(group, currentMonth);
					group = [];
					currentMonth = month;
				}
				group.push(m);
			});
			
		} else {
			print_table(movements);
		}
	}
}
