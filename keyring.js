var spawn = require("child_process").spawn;

function python(command, cb) {
	var stdout = [];
	var stderr = [];
	var process = spawn("python", ["-c", command]);
	process.stdout.setEncoding("utf8");
	process.stdout.on("data", on_process_stdout);
	process.stderr.setEncoding("utf8");
	process.stderr.on("data", on_process_stderr);
	process.on("close", on_process_closed);

	function on_process_stdout(data) {
		stdout.push(data.toString());
	}

	function on_process_stderr(data) {
		stderr.push(data.toString());
	}

	function on_process_closed(code) {
		if(code != 0) return cb({
			error: "python exited with code " + code,
			stdout: stdout.join(""),
			stderr: stderr.join("")
		}, null);
		cb(null, stdout.join(""));
	}
}

exports.set_password = function(system, username, password, cb) {
	python("import keyring; keyring.set_password('" + system + "', '" + username + "', '" + password + "')", cb);
};

exports.get_password = function(system, username, cb) {
	python("import keyring; print keyring.get_password('" + system + "', '" + username + "')", function(err, res) {
		if(err) return cb(err);
		
		var firstLine = /^\w*/.exec(res)[0];
		cb(null, firstLine === "None" ? null : firstLine);
	});
};

exports.delete_password = function(system, username, cb) {
	python("import keyring; keyring.delete_password('" + system + "', '" + username + "')", cb);
};
