
function parse_date(val) {
	if(val != null) {
		var match = val.match(/^(\d{4})(?:[\-\/\.](\d{1,2})(?:[\-\/\.](\d{1,2}))?)?$/)
		if(match != null) {
			return {
				year: parseInt(match[1]),
				month: match[2] != null ? parseInt(match[2]) : null,
				day: match[3] != null ? parseInt(match[3]) : null
			};
		}
	}
	return { year: null, month: null, day: null };
}

exports.parse = parse_date;

function parse_date_range(start, end) {
	start = parse_date(start);
	end = parse_date(end);

	if(start.year == null) {
		var end = new Date();
		return {
			start: new Date(end.getFullYear(), end.getMonth(), end.getDate() - 30),
			end: new Date(end.getFullYear(), end.getMonth(), end.getDate())
		};
	}
	
	if(start.month == null) {
		start.month = 1;
		start.day = 1;
		
		if(end.year == null) {
			end.year = start.year;
		}
	} else if(start.day == null) {
		start.day = 1;

		if(end.year == null) {
			end.year = start.year;
			end.month = start.month;
		}
	} else {
		if(end.year == null) {
			end.year = start.year;
			end.month = start.month;
			end.day = start.day;
		}
	}

	if(end.year != null) {
		if(end.month == null) end.month = 12;
		if(end.day == null) end.day = new Date(end.year, end.month, 0).getDate();
	}
	
	return {
		start: new Date(start.year, start.month - 1, start.day),
		end: new Date(end.year, end.month - 1, end.day)
	};
}

exports.parse_range = parse_date_range;
