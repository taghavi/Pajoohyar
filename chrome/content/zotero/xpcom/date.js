/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This file is part of Zotero.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

Zotero.Date = new function(){
	this.sqlToDate = sqlToDate;
	this.dateToSQL = dateToSQL;
	this.strToDate = strToDate;
	this.formatDate = formatDate;
	this.strToISO = strToISO;
	this.strToMultipart = strToMultipart;
	this.isMultipart = isMultipart;
	this.multipartToSQL = multipartToSQL;
	this.multipartToStr = multipartToStr;
	this.isSQLDate = isSQLDate;
	this.isSQLDateTime = isSQLDateTime;
	this.sqlHasYear = sqlHasYear;
	this.sqlHasMonth = sqlHasMonth;
	this.sqlHasDay = sqlHasDay;
	this.getUnixTimestamp = getUnixTimestamp;
	this.toUnixTimestamp = toUnixTimestamp;
	this.getFileDateString = getFileDateString;
	this.getFileTimeString = getFileTimeString;
	this.getLocaleDateOrder = getLocaleDateOrder;
	
	var _localeDateOrder = null;
	var _months = null;
	
	/**
	 * Load dateFormat bundle into _dateFormatsBundle
	 */
	function _loadDateFormatsBundle() {
		var src = 'chrome://global/locale/dateFormat.properties';
		var localeService = Components.classes['@mozilla.org/intl/nslocaleservice;1'].
							getService(Components.interfaces.nsILocaleService);
		var appLocale = localeService.getApplicationLocale();
		
		var bundle =
			Components.classes["@mozilla.org/intl/stringbundle;1"]
			.getService(Components.interfaces.nsIStringBundleService).createBundle(src, appLocale);
		
		_months = {"short":[], "long":[]};
		for(let i=1; i<=12; i++) {
			_months.short.push(bundle.GetStringFromName("month."+i+".Mmm"));
			_months.long.push(bundle.GetStringFromName("month."+i+".name"));
		}
	}
	
	/**
	 * Lazy getter for reading month strings from dateFormat.properties
	 */
	this.__defineGetter__("months", function() {
		if(!_months) _loadDateFormatsBundle();
		return _months;
	});
	
	/**
	* Convert an SQL date in the form '2006-06-13 11:03:05' into a JS Date object
	*
	* Can also accept just the date part (e.g. '2006-06-13')
	**/
	function sqlToDate(sqldate, isUTC){
		try {
			var datetime = sqldate.split(' ');
			var dateparts = datetime[0].split('-');
			if (datetime[1]){
				var timeparts = datetime[1].split(':');
			}
			else {
				timeparts = [false, false, false];
			}
			
			// Invalid date part
			if (dateparts.length==1){
				return false;
			}
			
			if (isUTC){
				return new Date(Date.UTC(dateparts[0], dateparts[1]-1, dateparts[2],
					timeparts[0], timeparts[1], timeparts[2]));
			}
			
			return new Date(dateparts[0], dateparts[1]-1, dateparts[2],
				timeparts[0], timeparts[1], timeparts[2]);
		}
		catch (e){
			Zotero.debug(sqldate + ' is not a valid SQL date', 2)
			return false;
		}
	}
	
	
	/**
	* Convert a JS Date object to an SQL date in the form '2006-06-13 11:03:05'
	*
	* If _toUTC_ is true, creates a UTC date
	**/
	function dateToSQL(date, toUTC)
	{
		try {
			if (toUTC){
				var year = date.getUTCFullYear();
				var month = date.getUTCMonth();
				var day = date.getUTCDate();
				var hours = date.getUTCHours();
				var minutes = date.getUTCMinutes();
				var seconds = date.getUTCSeconds();
			}
			else {
				return date.toLocaleFormat('%Y-%m-%d %H:%M:%S');
			}
			
			year = Zotero.Utilities.lpad(year, '0', 4);
			month = Zotero.Utilities.lpad(month + 1, '0', 2);
			day = Zotero.Utilities.lpad(day, '0', 2);
			hours = Zotero.Utilities.lpad(hours, '0', 2);
			minutes = Zotero.Utilities.lpad(minutes, '0', 2);
			seconds = Zotero.Utilities.lpad(seconds, '0', 2);
			
			return year + '-' + month + '-' + day + ' '
				+ hours + ':' + minutes + ':' + seconds;
		}
		catch (e){
			Zotero.debug(date + ' is not a valid JS date', 2);
			return '';
		}
	}
	
	
	/**
	 * Convert a JS Date object to an ISO 8601 UTC date/time
	 *
	 * @param	{Date}		date		JS Date object
	 * @return	{String}				ISO 8601 UTC date/time
	 *									e.g. 2008-08-15T20:00:00Z
	 */
	this.dateToISO = function (date) {
		var year = date.getUTCFullYear();
		var month = date.getUTCMonth();
		var day = date.getUTCDate();
		var hours = date.getUTCHours();
		var minutes = date.getUTCMinutes();
		var seconds = date.getUTCSeconds();
		
		year = Zotero.Utilities.lpad(year, '0', 4);
		month = Zotero.Utilities.lpad(month + 1, '0', 2);
		day = Zotero.Utilities.lpad(day, '0', 2);
		hours = Zotero.Utilities.lpad(hours, '0', 2);
		minutes = Zotero.Utilities.lpad(minutes, '0', 2);
		seconds = Zotero.Utilities.lpad(seconds, '0', 2);
		
		return year + '-' + month + '-' + day + 'T'
			+ hours + ':' + minutes + ':' + seconds + 'Z';
	}
	
	
	/**
	 * Convert an ISO 8601–formatted UTC date/time to a JS Date
	 *
	 * Adapted from http://delete.me.uk/2005/03/iso8601.html (AFL-licensed)
	 *
	 * @param	{String}		isoDate		ISO 8601 date
	 * @return	{Date}					JS Date
	 */
	this.isoToDate = function (isoDate) {
		var re8601 = /([0-9]{4})(-([0-9]{2})(-([0-9]{2})(T([0-9]{2}):([0-9]{2})(:([0-9]{2})(\.([0-9]+))?)?(Z|(([-+])([0-9]{2}):([0-9]{2})))?)?)?)?/;
		var d = isoDate.match(re8601);
		
		var offset = 0;
		var date = new Date(d[1], 0, 1);
		
		if (d[3]) { date.setMonth(d[3] - 1); }
		if (d[5]) { date.setDate(d[5]); }
		if (d[7]) { date.setHours(d[7]); }
		if (d[8]) { date.setMinutes(d[8]); }
		if (d[10]) { date.setSeconds(d[10]); }
		if (d[12]) { date.setMilliseconds(Number("0." + d[12]) * 1000); }
		if (d[14]) {
			offset = (Number(d[16]) * 60) + Number(d[17]);
			offset *= ((d[15] == '-') ? 1 : -1);
		}
		
		offset -= date.getTimezoneOffset();
		var time = (Number(date) + (offset * 60 * 1000));
		return new Date(time);
	}
	
	
	/*
	 * converts a string to an object containing:
	 *    day: integer form of the day
	 *    month: integer form of the month (indexed from 0, not 1)
	 *    year: 4 digit year (or, year + BC/AD/etc.)
	 *    part: anything that does not fall under any of the above categories
	 *          (e.g., "Summer," etc.)
	 *
	 * Note: the returned object is *not* a JS Date object
	 */
	var _slashRe = /^(.*?)\b([0-9]{1,4})(?:([\-\/\.\u5e74])([0-9]{1,2}))?(?:([\-\/\.\u6708])([0-9]{1,4}))?((?:\b|[^0-9]).*?)$/
	var _yearRe = /^(.*?)\b((?:circa |around |about |c\.? ?)?[0-9]{1,4}(?: ?B\.? ?C\.?(?: ?E\.?)?| ?C\.? ?E\.?| ?A\.? ?D\.?)|[0-9]{3,4})\b(.*?)$/i;
	var _monthRe = null;
	var _dayRe = null;
	
	function strToDate(string) {
		// Parse 'yesterday'/'today'/'tomorrow'
		var lc = (string + '').toLowerCase();
		if (lc == 'yesterday' || lc == Zotero.getString('date.yesterday')) {
			string = Zotero.Date.dateToSQL(new Date(new Date().getTime() - 86400000)).substr(0, 10);
		}
		else if (lc == 'today' || lc == Zotero.getString('date.today')) {
			string = Zotero.Date.dateToSQL(new Date()).substr(0, 10);
		}
		else if (lc == 'tomorrow' || lc == Zotero.getString('date.tomorrow')) {
			string = Zotero.Date.dateToSQL(new Date(new Date().getTime() + 86400000)).substr(0, 10);
		}
		
		var date = new Object();
		
		// skip empty things
		if(!string) {
			return date;
		}
		
		string = string.toString().replace(/^\s+/, "").replace(/\s+$/, "").replace(/\s+/, " ");
		
		// first, directly inspect the string
		var m = _slashRe.exec(string);
		if(m &&
		  ((!m[5] || !m[3]) || m[3] == m[5] || (m[3] == "\u5e74" && m[5] == "\u6708")) &&	// require sane separators
		  ((m[2] && m[4] && m[6]) || (!m[1] && !m[7]))) {						// require that either all parts are found,
		  																		// or else this is the entire date field
			// figure out date based on parts
			if(m[2].length == 3 || m[2].length == 4 || m[3] == "\u5e74") {
				// ISO 8601 style date (big endian)
				date.year = m[2];
				date.month = m[4];
				date.day = m[6];
			} else if(m[2] && !m[4] && m[6]) {
				date.month = m[2];
				date.year = m[6];
			} else {
				// local style date (middle or little endian)
				date.year = m[6];
				var country = Zotero.locale.substr(3);
				if(country == "US" ||	// The United States
				   country == "FM" ||	// The Federated States of Micronesia
				   country == "PW" ||	// Palau
				   country == "PH") {	// The Philippines
					date.month = m[2];
					date.day = m[4];
				} else {
					date.month = m[4];
					date.day = m[2];
				}
			}
			
			if(date.year) date.year = parseInt(date.year, 10);
			if(date.day) date.day = parseInt(date.day, 10);
			if(date.month) {
				date.month = parseInt(date.month, 10);
				
				if(date.month > 12) {
					// swap day and month
					var tmp = date.day;
					date.day = date.month
					date.month = tmp;
				}
			}
			
			if((!date.month || date.month <= 12) && (!date.day || date.day <= 31)) {
				if(date.year && date.year < 100) {	// for two digit years, determine proper
													// four digit year
					var today = new Date();
					var year = today.getFullYear();
					var twoDigitYear = year % 100;
					var century = year - twoDigitYear;
					
					if(date.year <= twoDigitYear) {
						// assume this date is from our century
						date.year = century + date.year;
					} else {
						// assume this date is from the previous century
						date.year = century - 100 + date.year;
					}
				}
				
				if(date.month) date.month--;		// subtract one for JS style
				Zotero.debug("DATE: retrieved with algorithms: "+date.toSource());
				
				date.part = m[1]+m[7];
			} else {
				// give up; we failed the sanity check
				Zotero.debug("DATE: algorithms failed sanity check");
				date = {"part":string};
			}
		} else {
			Zotero.debug("DATE: could not apply algorithms");
			date.part = string;
		}
		
		// couldn't find something with the algorithms; use regexp
		// YEAR
		if(!date.year) {
			var m = _yearRe.exec(date.part);
			if(m) {
				date.year = m[2];
				date.part = m[1]+m[3];
				Zotero.debug("DATE: got year ("+date.year+", "+date.part+")");
			}
		}
		
		// MONTH
		if(!date.month) {
			// compile month regular expression
			var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul',
				'aug', 'sep', 'oct', 'nov', 'dec'];
			// If using a non-English bibliography locale, try those too
			if (Zotero.locale != 'en-US') {
				months = months.concat(Zotero.Date.months.short).concat(Zotero.Date.months.long);
				for(var i in months) months[i] = months[i].toLowerCase();
			}
			
			if(!_monthRe) {
				_monthRe = new RegExp("^(.*)\\b("+months.join("|")+")[^ ]*(?: (.*)$|$)", "i");
			}
			
			var m = _monthRe.exec(date.part);
			if(m) {
				// Modulo 12 in case we have multiple languages
				date.month = months.indexOf(m[2].toLowerCase()) % 12;
				date.part = m[1]+m[3];
				Zotero.debug("DATE: got month ("+date.month+", "+date.part+")");
			}
		}
		
		// DAY
		if(!date.day) {
			// compile day regular expression
			if(!_dayRe) {
				var daySuffixes = Zotero.getString("date.daySuffixes").replace(/, ?/g, "|");
				_dayRe = new RegExp("\\b([0-9]{1,2})(?:"+daySuffixes+")?\\b(.*)", "i");
			}
			
			var m = _dayRe.exec(date.part);
			if(m) {
				var day = parseInt(m[1], 10);
				// Sanity check
				if (day <= 31) {
					date.day = day;
					if(m.index > 0) {
						date.part = date.part.substr(0, m.index);
						if(m[2]) {
							date.part += " "+m[2];;
						}
					} else {
						date.part = m[2];
					}
					
					Zotero.debug("DATE: got day ("+date.day+", "+date.part+")");
				}
			}
		}
		
		// clean up date part
		if(date.part) {
			date.part = date.part.replace(/^[^A-Za-z0-9]+/, "").replace(/[^A-Za-z0-9]+$/, "");
		}
		
		if(date.part === "" || date.part == undefined) {
			delete date.part;
		}
		
		return date;
	}
	
	/**
	 * does pretty formatting of a date object returned by strToDate()
	 *
	 * @param {Object} date A date object, as returned from strToDate()
	 * @param {Boolean} shortFormat Whether to return a short (12/1/95) date
	 * @return A formatted date string
	 * @type String
	 **/
	function formatDate(date, shortFormat) {
		if(shortFormat) {
			var localeDateOrder = getLocaleDateOrder();
			var string = localeDateOrder[0]+"/"+localeDateOrder[1]+"/"+localeDateOrder[2];
			return string.replace("y", (date.year !== undefined ? date.year : "00"))
			             .replace("m", (date.month !== undefined ? 1+date.month : "0"))
			             .replace("d", (date.day !== undefined ? date.day : "0"));
		} else {
			var string = "";
			
			if(date.part) {
				string += date.part+" ";
			}
			
			var months = Zotero.Date.months.long;
			if(date.month != undefined && months[date.month]) {
				// get short month strings from CSL interpreter
				string += months[date.month];
				if(date.day) {
					string += " "+date.day+", ";
				} else {
					string += " ";
				}
			}
			
			if(date.year) {
				string += date.year;
			}
		}
		
		return string;
	}
	
	function strToISO(str) {
		var date = Zotero.Date.strToDate(str);
		
		if(date.year) {
			var dateString = Zotero.Utilities.lpad(date.year, "0", 4);
			if(date.month) {
				dateString += "-"+Zotero.Utilities.lpad(date.month+1, "0", 2);
				if(date.day) {
					dateString += "-"+Zotero.Utilities.lpad(date.day, "0", 2);
				}
			}
			return dateString;
		}
		return false;
	}
	
	function strToMultipart(str){
		if (!str){
			return '';
		}
		
		var parts = strToDate(str);
		
		// FIXME: Until we have a better BCE date solution,
		// remove year value if not between 1 and 9999
		if (parts.year) {
			var year = parts.year + '';
			if (!year.match(/^[0-9]{1,4}$/)) {
				delete parts.year;
			}
		}
		
		parts.month = typeof parts.month != "undefined" ? parts.month + 1 : '';
		
		var multi = (parts.year ? Zotero.Utilities.lpad(parts.year, '0', 4) : '0000') + '-'
			+ Zotero.Utilities.lpad(parts.month, '0', 2) + '-'
			+ (parts.day ? Zotero.Utilities.lpad(parts.day, '0', 2) : '00')
			+ ' '
			+ str;
		return multi;
	}
	
	// Regexes for multipart and SQL dates
	// Allow zeroes in multipart dates
	// TODO: Allow negative multipart in DB and here with \-?
	var _multipartRE = /^[0-9]{4}\-(0[0-9]|10|11|12)\-(0[0-9]|[1-2][0-9]|30|31) /;
	var _sqldateRE = /^\-?[0-9]{4}\-(0[1-9]|10|11|12)\-(0[1-9]|[1-2][0-9]|30|31)$/;
	var _sqldateWithZeroesRE = /^\-?[0-9]{4}\-(0[0-9]|10|11|12)\-(0[0-9]|[1-2][0-9]|30|31)$/;
	var _sqldatetimeRE = /^\-?[0-9]{4}\-(0[1-9]|10|11|12)\-(0[1-9]|[1-2][0-9]|30|31) ([0-1][0-9]|[2][0-3]):([0-5][0-9]):([0-5][0-9])$/;
	
	/**
	 * Tests if a string is a multipart date string
	 * e.g. '2006-11-03 November 3rd, 2006'
	 */
	function isMultipart(str){
		if (isSQLDateTime(str)) {
			return false;
		}
		return _multipartRE.test(str);
	}
	
	
	/**
	 * Returns the SQL part of a multipart date string
	 * (e.g. '2006-11-03 November 3rd, 2006' returns '2006-11-03')
	 */
	function multipartToSQL(multi){
		if (!multi){
			return '';
		}
		
		if (!isMultipart(multi)){
			return '0000-00-00';
		}
		
		return multi.substr(0, 10);
	}
	
	
	/**
	 * Returns the user part of a multipart date string
	 * (e.g. '2006-11-03 November 3rd, 2006' returns 'November 3rd, 2006')
	 */
	function multipartToStr(multi){
		if (!multi){
			return '';
		}
		
		if (!isMultipart(multi)){
			return multi;
		}
		
		return multi.substr(11);
	}
	
	
	function isSQLDate(str, allowZeroes) {
		if (allowZeroes) {
			return _sqldateWithZeroesRE.test(str);
		}
		return _sqldateRE.test(str);
	}
	
	
	function isSQLDateTime(str){
		return _sqldatetimeRE.test(str);
	}
	
	
	function sqlHasYear(sqldate){
		return isSQLDate(sqldate, true) && sqldate.substr(0,4)!='0000';
	}
	
	
	function sqlHasMonth(sqldate){
		return isSQLDate(sqldate, true) && sqldate.substr(5,2)!='00';
	}
	
	
	function sqlHasDay(sqldate){
		return isSQLDate(sqldate, true) && sqldate.substr(8,2)!='00';
	}
	
	
	function getUnixTimestamp() {
		return Math.round(Date.now() / 1000);
	}
	
	
	function toUnixTimestamp(date) {
		if (date === null || typeof date != 'object' ||
				date.constructor.name != 'Date') {
			throw ('Not a valid date in Zotero.Date.toUnixTimestamp()');
		}
		return Math.round(date.getTime() / 1000);
	}
	
	
	/**
	 * Convert a JS Date to a relative date (e.g., "5 minutes ago")
	 *
	 * Adapted from http://snipplr.com/view/10290/javascript-parse-relative-date/
	 *
	 * @param	{Date}	date
	 * @return	{String}
	 */
	this.toRelativeDate = function (date) {
		var str;
		var now = new Date();
		var timeSince = now.getTime() - date;
		var inSeconds = timeSince / 1000;
		var inMinutes = timeSince / 1000 / 60;
		var inHours = timeSince / 1000 / 60 / 60;
		var inDays = timeSince / 1000 / 60 / 60 / 24;
		var inYears = timeSince / 1000 / 60 / 60 / 24 / 365;
		
		var n;
		
		// in seconds
		if (Math.round(inSeconds) == 1) {
			var key = "secondsAgo";
		}
		else if (inMinutes < 1.01) {
			var key = "secondsAgo";
			n = Math.round(inSeconds);
		}
		
		// in minutes
		else if (Math.round(inMinutes) == 1) {
			var key = "minutesAgo";
		}
		else if (inHours < 1.01) {
			var key = "minutesAgo";
			n = Math.round(inMinutes);
		}
		
		// in hours
		else if (Math.round(inHours) == 1) {
			var key = "hoursAgo";
		}
		else if (inDays < 1.01) {
			var key = "hoursAgo";
			n = Math.round(inHours);
		}
		
		// in days
		else if (Math.round(inDays) == 1) {
			var key = "daysAgo";
		}
		else if (inYears < 1.01) {
			var key = "daysAgo";
			n = Math.round(inDays);
		}
		
		// in years
		else if (Math.round(inYears) == 1) {
			var key = "yearsAgo";
		}
		else {
			var key = "yearsAgo";
			var n = Math.round(inYears);
		}
		
		return Zotero.getString("date.relative." + key + "." + (n ? "multiple" : "one"), n);
	}
	
	
	function getFileDateString(file){
		var date = new Date();
		date.setTime(file.lastModifiedTime);
		return date.toLocaleDateString();
	}
	
	
	function getFileTimeString(file){
		var date = new Date();
		date.setTime(file.lastModifiedTime);
		return date.toLocaleTimeString();
	}
	
	/**
	 * Figure out the date order from the output of toLocaleDateString()
	 *
	 * Returns a string with y, m, and d (e.g. 'ymd', 'mdy')
	 */
	function getLocaleDateOrder(){
		if (_localeDateOrder) {
			return _localeDateOrder;
		}
		
		var date = new Date("October 5, 2006");
		var parts = date.toLocaleDateString().match(/([0-9]+)[^0-9]+([0-9]+)[^0-9]+([0-9]+)/);
		
		// The above only works on OS X and Linux,
		// where toLocaleDateString() produces "10/05/2006"
		if (!parts) {
				var country = Zotero.locale.substr(3);
				switch (country) {
					// I don't know where this country list came from, but these
					// are little-endian in Zotero.strToDate()
					case 'US': // The United States
					case 'FM': // The Federated States of Micronesia
					case 'PW':	// Palau
					case 'PH':	// The Philippines
						return 'mdy';
						break;
						
					default:
						return 'dmy';
				}
		}
		
		switch (parseInt(parts[1])){
			case 2006:
				var order = 'y';
				break;
			case 10:
				var order = 'm';
				break;
			case 5:
				var order = 'd';
				break;
		}
		switch (parseInt(parts[2])){
			case 2006:
				order += 'y';
				break;
			case 10:
				order += 'm';
				break;
			case 5:
				order += 'd';
				break;
		}
		switch (parseInt(parts[3])){
			case 2006:
				order += 'y';
				break;
			case 10:
				order += 'm';
				break;
			case 5:
				order += 'd';
				break;
		}
		
		_localeDateOrder = order;
		
		return order;
	}
}