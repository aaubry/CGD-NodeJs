var program = require("commander");
var prompt = require("prompt");
var Table = require("easy-table");
var api = require("./api");
var fs = require("fs");

prompt.start();

program
	.version("0.0.1")
	.option("-v, --verbose", "print additional information to stderr")
	.option("-u, --user <user>", "authenticate as <user>")
	.option("-o, --output <outputFile>", "output data to <outputFile>");

program
	.command("accounts")
	.description("List accounts")
	.action(authenticated(list_accounts));

program
	.command("movements <account>")
	.description("Retrieve movements")
	.option("-s, --start-date <startDate>", "get movements starting from <startDate>", parse_date)
	.option("-e, --end-date <endDate>", "get movements starting from <endDate>", parse_date)
	.action(authenticated(retrieve_movements));

program.parse(process.argv);

if(program.args.length == 0) {
	program.help();
}

function parse_date(val) {
	var match = val.match(/^(\d{4})[\-\/\.]?(\d{1,2})[\-\/\.]?(\d{1,2})$/)
	if(match != null) {
		var year = parseInt(match[1]);
		var month = parseInt(match[2]) - 1;
		var day = parseInt(match[3]);
		
		var date = new Date(year, month, day);
		var isValid = date.getFullYear() == year
			&& date.getMonth() == month
			&& date.getDate() == day;
		
		return isValid ? date : null;
	}
	return null;
}

function print_table(val) {
	if(program.output) {
		var lines = [];
		val.forEach(function(a) {
			var line = [];
			for(var name in a) {
				line.push(a[name]);
			}
			lines.push(line.join("\t"));
		});
		fs.writeFile(program.output, lines.join("\n"));
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
		
		var fields = [];
		if(program.user == null) {
			fields.push({
				name: "username",
				required: true
			});
		}
		
		fields.push({
			name: "password",
			required: true,
			hidden: true
		});
		
		prompt.get(fields, function(err, res) {
			if(err) return console.error("ERROR", err);
		
			if(res.username) program.user = res.username;
			
			api.authenticate(res.username || program.user, res.password, function(err, auth) {
				if(err) return console.error("ERROR", err);

				args.push(auth);
				action.apply(this, args);
			});
		});
	}
}

function list_accounts(args, auth) {
	api.get_accounts(auth, function(err, accounts) {
		if(err) return console.error("ERROR", err);
		print_table(accounts);
	});
}

function retrieve_movements(account, args, auth) {
	var endDate = args.endDate || new Date();
	var startDate = args.startDate || new Date(endDate.getFullYear(), endDate.getMonth() - 1, endDate.getDate());
	
	api.get_movements(auth, account, startDate, endDate, chunk_retrieved, movements_retrieved);
	
	function chunk_retrieved(movements) {
		print_table(movements);
	}
	
	function movements_retrieved(err) {
		if(err) return console.error("ERROR", err);
		console.warn("Done");
	}
}
