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

Zotero.DBConnection = function(dbName) {
	if (!dbName) {
		throw ('DB name not provided in Zotero.DBConnection()');
	}
	
	this.skipBackup = false;
	this.transactionVacuum = false;
	
	// JS Date
	this.__defineGetter__('transactionDate', function () {
		if (this._transactionDate) {
			this._lastTransactionDate = this._transactionDate;
			return this._transactionDate;
		}
		
		Zotero.debug("Zotero.DB.transactionDate retrieved with no transaction", 2);
		
		// Use second granularity rather than millisecond
		// for comparison purposes
		var d = new Date(Math.floor(new Date / 1000) * 1000);
		this._lastTransactionDate = d;
		return d;
	});
	// SQL DATETIME
	this.__defineGetter__('transactionDateTime', function () {
		var d = this.transactionDate;
		return Zotero.Date.dateToSQL(d, true);
	});
	// Unix timestamp
	this.__defineGetter__('transactionTimestamp', function () {
		var d = this.transactionDate;
		return Zotero.Date.toUnixTimestamp(d);
	});
	
	// Private members
	this._dbName = dbName;
	this._shutdown = false;
	this._connection = null;
	this._transactionDate = null;
	this._lastTransactionDate = null;
	this._transactionRollback = null;
	this._transactionNestingLevel = 0;
	this._callbacks = { begin: [], commit: [], rollback: [] };
	this._dbIsCorrupt = null
	this._self = this;
}

/////////////////////////////////////////////////////////////////
//
// Public methods
//
/////////////////////////////////////////////////////////////////

/**
 * Test a read-only connection to the database, throwing any errors that occur
 *
 * @return	void
 */
Zotero.DBConnection.prototype.test = function () {
	this._getDBConnection();
}

/*
 * Run an SQL query
 *
 *  Optional _params_ is an array of bind parameters in the form
 *		[1,"hello",3] or [{'int':2},{'string':'foobar'}]
 *
 * 	Returns:
 *  	 - Associative array (similar to mysql_fetch_assoc) for SELECT's
 *	 - lastInsertId for INSERT's
 *	 - TRUE for other successful queries
 *	 - FALSE on error
 */
Zotero.DBConnection.prototype.query = function (sql,params) {
	//<abszh>
	//refer to columnQuery method for some illustrating comments
	var sqlObject=new Object();
	sqlObject.str=sql;
	var cparams=abregexp(sqlObject,params);
	if (cparams==null) {
		cparams=params;
	} else { 
		sql=sqlObject.str;
	}
	//Zotero.Utilities.writeToDiagFile("query:\r\n sql is: "+sql+"\r\n");
	//if (cparams) Zotero.Utilities.writeToDiagFile("cparams is: "+cparams+"\r\n");
	//</abszh>
	var db = this._getDBConnection();
	
	try {
		// Parse out the SQL command being used
		var op = sql.match(/^[^a-z]*[^ ]+/i);
		if (op) {
			op = op.toString().toLowerCase();
		}
		
		// If SELECT statement, return result
		if (op == 'select') {
			// Until the native dataset methods work (or at least exist),
			// we build a multi-dimensional associative array manually
			
			var statement = this.getStatement(sql, cparams, true);
			
			// Get column names
			var columns = [];
			var numCols = statement.columnCount;
			for (var i=0; i<numCols; i++) {
				columns.push(statement.getColumnName(i));
			}
			
			var dataset = [];
			while (statement.executeStep()) {
				var row = [];
				for(var i=0; i<numCols; i++) {
					row[columns[i]] = this._getTypedValue(statement, i);
				}
				dataset.push(row);
			}
			statement.reset();
			
			return dataset.length ? dataset : false;
		}
		else {
			if (cparams) {
				var statement = this.getStatement(sql, cparams, true);
				statement.execute();
			}
			else {
				this._debug(sql,5);
				db.executeSimpleSQL(sql);
			}
			
			if (op == 'insert' || op == 'replace') {
				return db.lastInsertRowID;
			}
			// DEBUG: Can't get affected rows for UPDATE or DELETE?
			else {
				return true;
			}
		}
	}
	catch (e) {
		this.checkException(e);
		
		var dberr = (db.lastErrorString!='not an error')
			? ' [ERROR: ' + db.lastErrorString + ']' : '';
		throw(e + ' [QUERY: ' + sql + ']' + dberr);
	}
}


/*
 * Query a single value and return it
 */
Zotero.DBConnection.prototype.valueQuery = function (sql,params) {
	//<abszh>
	//Zotero.Utilities.writeToDiagFile("valueQuery:\r\n sql is: "+sql+"\r\n");
	//if (params) Zotero.Utilities.writeToDiagFile("params is: "+params+"\r\n");
	//</abszh>
	var statement = this.getStatement(sql, params, true);
	
	// No rows
	if (!statement.executeStep()) {
		statement.reset();
		return false;
	}
	
	var value = this._getTypedValue(statement, 0);
	statement.reset();
	return value;
}


/*
 * Run a query and return the first row
 */
Zotero.DBConnection.prototype.rowQuery = function (sql,params) {
	//<abszh>
	//Zotero.Utilities.writeToDiagFile("rowQuery:\r\n sql is: "+sql+"\r\n");
	//if (params) Zotero.Utilities.writeToDiagFile("params is: "+params+"\r\n");
	//</abszh>

	var result = this.query(sql,params);
	if (result) {
		return result[0];
	}
}


//<abszh>
//modifies sql in sqlObject.str and iparams and returns params if any arabic or persian
//character that requires modification is found in iparams
//otherwise returns null
function abregexp(sqlObject,iparams) {
	var en1;
	var pen1=Zotero.Prefs.get('crcis.persianSearch');
	if (typeof(pen1)=="boolean") {
		en1=pen1;
	} else {
		en1=(pen1=="true");
	}
	
	var comeIn=false;
	if (en1) {
		if ((sqlObject.str.match(/select/i)) && (sqlObject.str.match(/like/i)) && (params)) {
			for (var i=0; i<params.length; i++) {
				if (typeof params[i] === 'string') {
					if ((params[i].match(/[0-9\u0600-\u06ff]/)) && ((params[i].match(/%$/)) || (params[i].match(/^%/)))) {
						comeIn=true;
						break;
					}
				}
			}
		}
	}
	
	
	if (comeIn) {
		var params=iparams.concat();
		//Zotero.Utilities.writeToDiagFile("I came in!\r\n");
		
		var output="";
		var sql=sqlObject.str;
		var sqlParts=sql.split('?');
		for (var i=0; i<params.length; i++) {
			//typeof params[i] must be checked to prevent error when running match function on it
			if ((typeof params[i] === 'string') && ((params[i].match(/%$/)) || (params[i].match(/^%/)))) {
				//\u0600-\u06ff covers all persian and arabic letters
				if ((params[i].match(/[0-9\u0600-\u06ff]/)) && (params[i].match(/[0-9\u0660-\u0669\u06f0-\u06f9\u0020\u200C\u0643\u06a9\u0649\u06cc]/))) {
					//replacing numbers should be the very first act
					//or \u0020 may be replaced with \u0۰۰0۰۰2۲۲... (?)
					function replacer(str) {
						var n=0;
						var cc=str.charCodeAt(0);
						if (cc<=0x39) n=cc-0x30;	//latin digit
						else if (cc<=0x0669) n=cc-0x0660;	//arabic digit
						else if (cc<=0x06f9) n=cc-0x06f0;	//persian digit
						var englishForm=String.fromCharCode(n+0x30);
						var arabicForm=String.fromCharCode(n+0x0660);
						var persianForm=String.fromCharCode(n+0x06f0);
						return ("["+englishForm+arabicForm+persianForm+"]");
					}
					//converts LIKE 456 to REGEXP [4٤۴][5٥۵][6٦۶]
					//tmpstr is used to prevent endless loops in replacements.
					var tmpstr=params[i].replace(/[0-9\u0660-\u0669\u06f0-\u06f9]/g,replacer);
					params[i]=tmpstr;
					
					tmpstr=params[i].replace(/[\u0020\u200C]/g,"[\u0020\u200C]");	//space and half space
					params[i]=tmpstr;
					tmpstr=params[i].replace(/[\u0643\u06a9]/g,"[\u0643\u06a9]");	//two forms of kaaf letter
					params[i]=tmpstr;
					tmpstr=params[i].replace(/[\u0649\u06cc\u064a]/g,"[\u0649\u06cc\u064a]");	//three forms of ye letter
					params[i]=tmpstr;

					if ((params[i].match(/%$/)) && !(params[i].match(/^%/))) {
						params[i]=params[i].replace(/(.*)%$/,"^$1");
					}
					params[i]=params[i].replace(/^%/,"");
					params[i]=params[i].replace(/%$/,"");
					
					sqlParts[i]=sqlParts[i].replace("LIKE","REGEXP");
				} 
			}
			output=output+sqlParts[i]+'?';
		}
		var lastPartIndex=sqlParts.length-1;
		output=output+sqlParts[lastPartIndex];
		sqlObject.str=output;
		return params;

		//Zotero.Utilities.writeToDiagFile("sql is: "+sql+"\r\n params is: ");
		//if (params) {
			//Zotero.Utilities.writeToDiagFile(params.toSource()+"\r\n");
		//} else {
			//Zotero.Utilities.writeToDiagFile("null \r\n");
		//}
	} else {
		return null;
	}
}
//</abszh>

/*
 * Run a query and return the first column as a numerically-indexed array
 */
Zotero.DBConnection.prototype.columnQuery = function (sql,params) {
	//<abszh>
	//without using an object changes to string will be lost on return
	//wrap the sql string into an object so that changes made in abregexp are transferred to this caller function
	var sqlObject=new Object();
	sqlObject.str=sql;
	var cparams=abregexp(sqlObject,params);
	if (cparams==null) {
		cparams=params;
	} else { 
		sql=sqlObject.str;
	}
	//Zotero.Utilities.writeToDiagFile("columnQuery:\r\n sql is: "+sql+"\r\n");
	//if (cparams) Zotero.Utilities.writeToDiagFile("cparams is: "+cparams+"\r\n");
	
	
	//</abszh>

	var statement = this.getStatement(sql, cparams, true);
	
	if (statement) {
		var column = new Array();
		while (statement.executeStep()) {
			column.push(this._getTypedValue(statement, 0));
		}
		statement.reset();
		return column.length ? column : false;
	}
	return false;
}


/*
/*
 * Get a raw mozStorage statement from the DB for manual processing
 *
 * This should only be used externally for manual parameter binding for
 * large repeated queries
 *
 *  Optional _params_ is an array of bind parameters in the form
 *		[1,"hello",3] or [{'int':2},{'string':'foobar'}]
 */
Zotero.DBConnection.prototype.getStatement = function (sql, params, checkParams) {
	// TODO: limit to Zotero.DB, not all Zotero.DBConnections?
	if (Zotero.waiting) {
		throw ("Cannot access database layer during active Zotero.wait()");
	}
	
	var db = this._getDBConnection();
	
	// First, determine the type of query using first word
	var matches = sql.match(/^[^\s\(]*/);
	var queryMethod = matches[0].toLowerCase();
	
	if (params) {
		// If single scalar value or single non-array object, wrap in an array
		if (typeof params != 'object' || params === null ||
				(params && typeof params == 'object' && !params.length)) {
			var params = [params];
		}
		
		// Since we might make changes, only work on a copy of the array
		var params = params.concat();
		
		// Replace NULL bound parameters with hard-coded NULLs
		var nullRE = /\s*=?\s*\?/g;
		// Reset lastIndex, since regexp isn't recompiled dynamically
		nullRE.lastIndex = 0;
		var lastNullParamIndex = -1;
		for (var i=0; i<params.length; i++) {
			if (typeof params[i] != 'object' || params[i] !== null) {
				continue;
			}
			
			// Find index of this parameter, skipping previous ones
			do {
				var matches = nullRE.exec(sql);
				lastNullParamIndex++;
			}
			while (lastNullParamIndex < i);
			lastNullParamIndex = i;
			
			if (matches[0].indexOf('=') == -1) {
				// mozStorage supports null bound parameters in value lists (e.g., "(?,?)") natively
				continue;
				//var repl = 'NULL';
			}
			else if (queryMethod == 'select') {
				var repl = ' IS NULL';
			}
			else {
				var repl = '=NULL';
			}
			
			var subpos = matches.index;
			var sublen = matches[0].length;
			sql = sql.substring(0, subpos) + repl + sql.substr(subpos + sublen);
			
			//Zotero.debug("Hard-coding null bound parameter " + i);
			
			params.splice(i, 1);
			i--;
			lastNullParamIndex--;
			continue;
		}
		if (!params.length) {
			params = undefined;
		}
	}
	
	try {
		this._debug(sql,5);
		var statement = db.createStatement(sql);
	}
	catch (e) {
		var dberr = (db.lastErrorString!='not an error')
			? ' [ERROR: ' + db.lastErrorString + ']' : '';
		throw(e + ' [QUERY: ' + sql + ']' + dberr);
	}
	
	var numParams = statement.parameterCount;
	
	if (params) {
		if (checkParams) {
			if (numParams == 0) {
				throw ("Parameters provided for query without placeholders");
			}
			else if (numParams != params.length) {
				throw ("Incorrect number of parameters provided for query "
					+ "(" + params.length + ", expecting " + numParams + ")");
			}
		}
		
		for (var i=0; i<params.length; i++) {
			if (params[i] === undefined) {
				Zotero.debug(params);
				var msg = 'Parameter ' + i + ' is undefined in Zotero.DB.getStatement() [QUERY: ' + sql + ']';
				Zotero.debug(msg);
				Components.utils.reportError(msg);
				throw (msg);
			}
				
			// Integer
			if (params[i]!==null && typeof params[i]['int'] != 'undefined') {
				var type = 'int';
				var value = params[i]['int'];
			}
			// String
			else if (params[i]!==null && typeof params[i]['string'] != 'undefined') {
				var type = 'string';
				var value = params[i]['string'];
			}
			// Automatic (trust the JS type)
			else {
				switch (typeof params[i]) {
					case 'string':
						var type = 'string';
						break;
					case 'number':
						var type = 'int';
						break;
					// Object
					default:
						if (params[i]===null) {
							var type = 'null';
						}
						else {
							var msg = 'Invalid bound parameter ' + params[i]
								+ ' in ' + Zotero.varDump(params)
								+ ' [QUERY: ' + sql + ']';
							Zotero.debug(msg);
							throw(msg);
						}
				}
				var value = params[i];
			}
			
			// Bind the parameter as the correct type
			switch (type) {
				case 'int':
					var intVal = parseInt(value);
					if (isNaN(intVal)) {
						throw ("Invalid integer value '" + value + "'")
					}
					
					// Store as 32-bit signed integer
					if (intVal <= 2147483647) {
						this._debug('Binding parameter ' + (i+1)
							+ ' of type int: ' + value, 5);
						statement.bindInt32Parameter(i, intVal);
					}
					// Store as 64-bit signed integer
					// 2^53 is JS's upper-bound for decimal integers
					else if (intVal < 9007199254740992) {
						this._debug('Binding parameter ' + (i+1)
							+ ' of type int64: ' + value, 5);
						statement.bindInt64Parameter(i, intVal);
					}
					else {
						throw ("Integer value '" + intVal + "' too large");
					}
					
					break;
					
				case 'string':
					this._debug('Binding parameter ' + (i+1)
						+ ' of type string: "' + value + '"', 5);
					statement.bindUTF8StringParameter(i, value);
					break;
					
				case 'null':
					this._debug('Binding parameter ' + (i+1) + ' of type NULL', 5);
					statement.bindNullParameter(i);
					break;
			}
		}
	}
	else {
		if (checkParams && numParams > 0) {
			throw ("No parameters provided for query containing placeholders");
		}
	}
	return statement;
}


/*
 * Only for use externally with this.getStatement()
 */
Zotero.DBConnection.prototype.getLastInsertID = function () {
	var db = this._getDBConnection();
	return db.lastInsertRowID;
}


/*
 * Only for use externally with this.getStatement()
 */
Zotero.DBConnection.prototype.getLastErrorString = function () {
	var db = this._getDBConnection();
	return db.lastErrorString;
}


Zotero.DBConnection.prototype.beginTransaction = function () {
	// TODO: limit to Zotero.DB, not all Zotero.DBConnections?
	if (Zotero.waiting) {
		var msg = "Cannot access database layer during active Zotero.wait()";
		Zotero.debug(msg, 2);
		throw (msg);
	}
	
	var db = this._getDBConnection();
	
	if (db.transactionInProgress) {
		this._transactionNestingLevel++;
		this._debug('Transaction in progress -- increasing level to '
			+ this._transactionNestingLevel, 5);
	}
	else {
		this._debug('Beginning DB transaction', 5);
		db.beginTransaction();
		
		// Set a timestamp for this transaction
		this._transactionDate = new Date(Math.floor(new Date / 1000) * 1000);
		
		// If transaction time hasn't changed since last used transaction time,
		// add a second -- this is a hack to get around a sync problem when
		// multiple sync sessions run within the same second
		if (this._lastTransactionDate &&
				this._transactionDate.getTime() <= this._lastTransactionDate.getTime()) {
			this._transactionDate = new Date(this._lastTransactionDate.getTime() + 1000)
		}
		
		// Run callbacks
		for (var i=0; i<this._callbacks.begin.length; i++) {
			if (this._callbacks.begin[i]) {
				this._callbacks.begin[i]();
			}
		}
	}
}


Zotero.DBConnection.prototype.commitTransaction = function () {
	var db = this._getDBConnection();
	
	if (this._transactionNestingLevel) {
		this._transactionNestingLevel--;
		this._debug('Decreasing transaction level to ' + this._transactionNestingLevel, 5);
	}
	else if (this._transactionRollback) {
		this._debug('Rolling back previously flagged transaction', 5);
		this.rollbackTransaction();
	}
	else {
		this._debug('Committing transaction',5);
		
		// Clear transaction time
		if (this._transactionDate) {
			this._transactionDate = null;
		}
		
		try {
			db.commitTransaction();
			
			if (this.transactionVacuum) {
				Zotero.debug('Vacuuming database');
				db.executeSimpleSQL('VACUUM');
				this.transactionVacuum = false;
			}
			
			// Run callbacks
			for (var i=0; i<this._callbacks.commit.length; i++) {
				if (this._callbacks.commit[i]) {
					this._callbacks.commit[i]();
				}
			}
		}
		catch(e) {
			var dberr = (db.lastErrorString!='not an error')
				? ' [ERROR: ' + db.lastErrorString + ']' : '';
			throw(e + dberr);
		}
	}
}


Zotero.DBConnection.prototype.rollbackTransaction = function () {
	var db = this._getDBConnection();
	
	if (!db.transactionInProgress) {
		this._debug("Transaction is not in progress in rollbackTransaction()", 2);
		return;
	}
	
	if (this._transactionNestingLevel) {
		this._transactionNestingLevel--;
		this._transactionRollback = true;
		this._debug('Flagging nested transaction for rollback', 5);
	}
	else {
		this._debug('Rolling back transaction', 5);
		this._transactionRollback = false;
		try {
			db.rollbackTransaction();
			
			// Run callbacks
			for (var i=0; i<this._callbacks.rollback.length; i++) {
				if (this._callbacks.rollback[i]) {
					this._callbacks.rollback[i]();
				}
			}
		}
		catch(e) {
			var dberr = (db.lastErrorString!='not an error')
				? ' [ERROR: ' + db.lastErrorString + ']' : '';
			throw(e + dberr);
		}
	}
}


Zotero.DBConnection.prototype.addCallback = function (type, cb) {
	switch (type) {
		case 'begin':
		case 'commit':
		case 'rollback':
			break;
			
		default:
			throw ("Invalid callback type '" + type + "' in DB.addCallback()");
	}
	
	var id = this._callbacks[type].length;
	this._callbacks[type][id] = cb;
	return id;
}


Zotero.DBConnection.prototype.removeCallback = function (type, id) {
	switch (type) {
		case 'begin':
		case 'commit':
		case 'rollback':
			break;
			
		default:
			throw ("Invalid callback type '" + type + "' in DB.removeCallback()");
	}
	
	delete this._callbacks[type][id];
}


Zotero.DBConnection.prototype.transactionInProgress = function () {
	var db = this._getDBConnection();
	return db.transactionInProgress;
}


/**
 * Safety function used on shutdown to make sure we're not stuck in the
 * middle of a transaction
 *
 * NOTE: No longer used
 */
Zotero.DBConnection.prototype.commitAllTransactions = function () {
	if (this.transactionInProgress()) {
		var level = this._transactionNestingLevel;
		this._transactionNestingLevel = 0;
		try {
			this.commitTransaction();
		}
		catch (e) {}
		return level ? level : true;
	}
	return false;
}


/*
 * Used on shutdown to rollback all open transactions
 */
Zotero.DBConnection.prototype.rollbackAllTransactions = function () {
	if (this.transactionInProgress()) {
		var level = this._transactionNestingLevel;
		this._transactionNestingLevel = 0;
		try {
			this.rollbackTransaction();
		}
		catch (e) {}
		return level ? level : true;
	}
	return false;
}


Zotero.DBConnection.prototype.tableExists = function (table) {
	return this._getDBConnection().tableExists(table);
}


Zotero.DBConnection.prototype.getColumns = function (table) {
	var db = this._getDBConnection();
	
	try {
		var sql = "SELECT * FROM " + table + " LIMIT 1";
		var statement = this.getStatement(sql);
		var cols = new Array();
		for (var i=0,len=statement.columnCount; i<len; i++) {
			cols.push(statement.getColumnName(i));
		}
		statement.reset();
		return cols;
	}
	catch (e) {
		this._debug(e,1);
		return false;
	}
}


Zotero.DBConnection.prototype.getColumnHash = function (table) {
	var cols = this.getColumns(table);
	var hash = {};
	if (cols.length) {
		for (var i=0; i<cols.length; i++) {
			hash[cols[i]] = true;
		}
	}
	return hash;
}


/**
* Find the lowest unused integer >0 in a table column
*
* Note: This retrieves all the rows of the column, so it's not really
*	meant for particularly large tables.
**/
Zotero.DBConnection.prototype.getNextID = function (table, column) {
	var sql = 'SELECT ' + column + ' FROM ' + table + ' ORDER BY ' + column;
	var vals = this.columnQuery(sql);
	
	if (!vals) {
		return 1;
	}
	
	if (vals[0] === '0') {
		vals.shift();
	}
	
	for (var i=0, len=vals.length; i<len; i++) {
		if (vals[i] != i+1) {
			break;
		}
	}
	
	return i+1;
}


/**
* Find the next lowest numeric suffix for a value in table column
*
* For example, if "Untitled" and "Untitled 2" and "Untitled 4",
* returns "Untitled 3"
*
* DEBUG: doesn't work once there's an "Untitled 10"
*
* If _name_ alone is available, returns that
**/
Zotero.DBConnection.prototype.getNextName = function (table, field, name)
{
	var sql = "SELECT " + field + " FROM " + table + " WHERE " + field
		+ " LIKE ? ORDER BY " + field + " COLLATE NOCASE";
	var untitleds = this.columnQuery(sql, name + '%');
	
	if (!untitleds || untitleds[0]!=name) {
		return name;
	}
	
	var i = 1;
	var num = 2;
	while (untitleds[i] && untitleds[i]==(name + ' ' + num)) {
		while (untitleds[i+1] && untitleds[i]==untitleds[i+1]) {
			this._debug('Next ' + i + ' is ' + untitleds[i]);
			i++;
		}
		
		i++;
		num++;
	}
	
	return name + ' ' + num;
}


/*
 * Implements nsIObserver
 */
Zotero.DBConnection.prototype.observe = function(subject, topic, data) {
	switch (topic) {
		case 'idle':
			this.backupDatabase();
			break;
	}
}


Zotero.DBConnection.prototype.integrityCheck = function () {
	var ok = this.valueQuery("PRAGMA integrity_check");
	return ok == 'ok';
}


Zotero.DBConnection.prototype.checkException = function (e) {
	if (e.name && e.name == 'NS_ERROR_FILE_CORRUPTED') {
		// Write corrupt marker to data directory
		var file = Zotero.getZoteroDatabase(this._dbName, 'is.corrupt');
		Zotero.File.putContents(file, '');
		
		this._dbIsCorrupt = true;
		
		var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
								.getService(Components.interfaces.nsIPromptService);
		
		var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
			+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_IS_STRING);
		
		var index = ps.confirmEx(null,
			Zotero.getString('general.error'),
			Zotero.getString('db.dbCorrupted', this._dbName) + '\n\n' + Zotero.getString('db.dbCorrupted.restart'),
			buttonFlags,
			Zotero.getString('general.restartNow'),
			Zotero.getString('general.restartLater'),
			null, null, {});
		
		if (index == 0) {
			var appStartup = Components.classes["@mozilla.org/toolkit/app-startup;1"]
					.getService(Components.interfaces.nsIAppStartup);
			appStartup.quit(Components.interfaces.nsIAppStartup.eRestart);
			appStartup.quit(Components.interfaces.nsIAppStartup.eAttemptQuit);
		}
		
		Zotero.skipLoading = true;
		return false;
	}
	return true;
}


Zotero.DBConnection.prototype.closeDatabase = function () {
	var db = this._getDBConnection();
	db.close();
}


Zotero.DBConnection.prototype.backupDatabase = function (suffix) {
	if (!suffix) {
		var numBackups = Zotero.Prefs.get("backup.numBackups");
		if (numBackups < 1) {
			return false;
		}
		if (numBackups > 24) {
			numBackups = 24;
		}
	}
	
	if (Zotero.locked) {
		this._debug("Zotero is locked -- skipping backup of DB '" + this._dbName + "'", 2);
		return false;
	}
	
	if (this.transactionInProgress()) {
		//this._debug("Transaction in progress--skipping backup of DB '" + this._dbName + "'", 2);
		return false;
	}
	
	var corruptMarker = Zotero.getZoteroDatabase(this._dbName, 'is.corrupt').exists();
	
	if (this.skipBackup || Zotero.skipLoading) {
		this._debug("Skipping backup of database '" + this._dbName + "'", 1);
		return false;
	}
	else if (this._dbIsCorrupt || corruptMarker) {
		this._debug("Database '" + this._dbName + "' is marked as corrupt--skipping backup", 1);
		return false;
	}
	
	var file = Zotero.getZoteroDatabase(this._dbName);
	
	// For standard backup, make sure last backup is old enough to replace
	if (!suffix) {
		var backupFile = Zotero.getZoteroDatabase(this._dbName, 'bak');
		if (backupFile.exists()) {
			var currentDBTime = file.lastModifiedTime;
			var lastBackupTime = backupFile.lastModifiedTime;
			if (currentDBTime == lastBackupTime) {
				//Zotero.debug("Database '" + this._dbName + "' hasn't changed -- skipping backup");
				return;
			}
			
			var now = new Date();
			var intervalMinutes = Zotero.Prefs.get('backup.interval');
			var interval = intervalMinutes * 60 *  1000;
			if ((now - lastBackupTime) < interval) {
				//Zotero.debug("Last backup of database '" + this._dbName
				//	+ "' was less than " + intervalMinutes + " minutes ago -- skipping backup");
				return;
			}
		}
	}
	
	this._debug("Backing up database '" + this._dbName + "'");
	
	// Copy via a temporary file so we don't run into disk space issues
	// after deleting the old backup file
	var tmpFile = Zotero.getZoteroDatabase(this._dbName, 'tmp');
	if (tmpFile.exists()) {
		try {
			tmpFile.remove(false);
		}
		catch (e) {
			if (e.name == 'NS_ERROR_FILE_ACCESS_DENIED') {
				alert("Cannot delete " + tmpFile.leafName);
			}
			throw (e);
		}
	}
	
	// Turn off DB locking before backup and reenable after, since otherwise
	// the lock is lost
	var dbLockExclusive = Zotero.Prefs.get('dbLockExclusive');
	var hadDummyStatement = !!this._dummyStatement;
	try {
		if (dbLockExclusive) {
			Zotero.DB.query("PRAGMA locking_mode=NORMAL");
		}
		if (hadDummyStatement) {
			Zotero.DB.stopDummyStatement();
		}
		
		var store = Components.classes["@mozilla.org/storage/service;1"].
			getService(Components.interfaces.mozIStorageService);
		store.backupDatabaseFile(file, tmpFile.leafName, file.parent);
	}
	catch (e) {
		Zotero.debug(e);
		Components.utils.reportError(e);
		return false;
	}
	finally {
		if (dbLockExclusive) {
			Zotero.DB.query("PRAGMA locking_mode=EXCLUSIVE");
		}
		if (hadDummyStatement) {
			Zotero.DB.startDummyStatement();
		}
	}
	
	// Opened database files can't be moved on Windows, so we have to skip
	// the extra integrity check (unless we wanted to write two copies of
	// the database, but that doesn't seem like a great idea)
	if (!Zotero.isWin) {
		try {
			var store = Components.classes["@mozilla.org/storage/service;1"].
				getService(Components.interfaces.mozIStorageService);
				
			var connection = store.openDatabase(tmpFile);
		}
		catch (e){
			this._debug("Database file '" + tmpFile.leafName + "' is corrupt--skipping backup");
			if (tmpFile.exists()) {
				tmpFile.remove(null);
			}
			return false;
		}
	}
	
	// Special backup
	if (!suffix && numBackups > 1) {
		var zdir = Zotero.getZoteroDirectory();
		
		// Remove oldest backup file
		var targetFile = Zotero.getZoteroDatabase(this._dbName, (numBackups - 1) + '.bak')
		if (targetFile.exists()) {
			targetFile.remove(false);
		}
		
		// Shift old versions up
		for (var i=(numBackups - 1); i>=1; i--) {
			var targetNum = i;
			var sourceNum = targetNum - 1;
			
			var targetFile = Zotero.getZoteroDatabase(
				this._dbName, targetNum + '.bak'
			);
			var sourceFile = Zotero.getZoteroDatabase(
				this._dbName, sourceNum ? sourceNum + '.bak' : 'bak'
			);
			
			if (!sourceFile.exists()) {
				continue;
			}
			
			Zotero.debug("Moving " + sourceFile.leafName + " to " + targetFile.leafName);
			sourceFile.moveTo(zdir, targetFile.leafName);
		}
	}
	
	var backupFile = Zotero.getZoteroDatabase(
		this._dbName, (suffix ? suffix + '.' : '') + 'bak'
	);
	
	// Remove old backup file
	if (backupFile.exists()) {
		backupFile.remove(false);
	}
	
	Zotero.debug("Backed up to " + backupFile.leafName);
	tmpFile.moveTo(tmpFile.parent, backupFile.leafName);
	
	return true;
}


/*
 * Keep the SQLite shared cache live between transactions with a dummy statement,
 * which speeds up DB access dramatically (at least on Windows and Linux--OS X
 * seems to be much faster already, perhaps due to its own disk cache)
 *
 * This is the same technique used by Mozilla code. The one downside is that it
 * prevents schema changes, so this is called after schema updating. If the
 * schema really needs to be updated at another point, use stopDummyStatement().
 *
 * See http://developer.mozilla.org/en/docs/Storage:Performance for more info.
 */
Zotero.DBConnection.prototype.startDummyStatement = function () {
	try {
		if (!this._dummyConnection) {
			this._debug("Opening database '" + this._dbName + "' for dummy statement");
			// Get the storage service
			var store = Components.classes["@mozilla.org/storage/service;1"].
				getService(Components.interfaces.mozIStorageService);
			var file = Zotero.getZoteroDatabase(this._dbName);
			this._dummyConnection = store.openDatabase(file);
		}
		
		if (this._dummyStatement) {
			Zotero.debug("Dummy statement is already open");
			return;
		}
		
		Zotero.debug("Initializing dummy statement for '" + this._dbName + "'");
		
		var sql = "CREATE TABLE IF NOT EXISTS zoteroDummyTable (id INTEGER PRIMARY KEY)";
		this._dummyConnection.executeSimpleSQL(sql);
		
		sql = "INSERT OR IGNORE INTO zoteroDummyTable VALUES (1)";
		this._dummyConnection.executeSimpleSQL(sql);
		
		sql = "SELECT id FROM zoteroDummyTable LIMIT 1"
		this._dummyStatement = this._dummyConnection.createStatement(sql)
		this._dummyStatement.executeStep()
	
	}
	catch (e) {
		Components.utils.reportError(e);
		Zotero.debug(e);
	}
}


/*
 * Stop the dummy statement temporarily to allow for schema changess
 *
 * The statement needs to be started again or performance will suffer.
 */
Zotero.DBConnection.prototype.stopDummyStatement = function () {
	if (!this._dummyStatement) {
		return;
	}
	
	Zotero.debug("Stopping dummy statement for '" + this._dbName + "'");
	this._dummyStatement.reset();
	this._dummyStatement = null;
}


/**
 * Determine the necessary data type for SQLite parameter binding
 *
 * @return	int		0 for string, 32 for int32, 64 for int64
 */
Zotero.DBConnection.prototype.getSQLDataType = function(value) {
	var strVal = value + '';
	if (strVal.match(/^[1-9]+[0-9]*$/)) {
		// These upper bounds also specified in Zotero.DB
		//
		// Store as 32-bit signed integer
		if (value <= 2147483647) {
			return 32;
		}
		// Store as 64-bit signed integer
		// 2^53 is JS's upper-bound for decimal integers
		else if (value < 9007199254740992) {
			return 64;
		}
	}
	return 0;
}


/////////////////////////////////////////////////////////////////
//
// Private methods
//
/////////////////////////////////////////////////////////////////

/*
 * Retrieve a link to the data store
 */
Zotero.DBConnection.prototype._getDBConnection = function () {
	if (this._connection) {
		return this._connection;
	}
	
	this._debug("Opening database '" + this._dbName + "'");
	
	// Get the storage service
	var store = Components.classes["@mozilla.org/storage/service;1"].
		getService(Components.interfaces.mozIStorageService);
	
	var file = Zotero.getZoteroDatabase(this._dbName);
	var backupFile = Zotero.getZoteroDatabase(this._dbName, 'bak');
	
	var fileName = this._dbName + '.sqlite';
	
	if (this._dbName == 'zotero' && ZOTERO_CONFIG['DB_REBUILD']) {
		if (confirm('Erase all user data and recreate database from schema?')) {
			// Delete existing Zotero database
			if (file.exists()) {
				file.remove(null);
			}
			
			// Delete existing storage folder
			var dir = Zotero.getStorageDirectory();
			if (dir.exists()) {
				dir.remove(true);
			}
		}
	}
	
	catchBlock: try {
		var corruptMarker = Zotero.getZoteroDatabase(this._dbName, 'is.corrupt');
		if (corruptMarker.exists()) {
			throw({ name: 'NS_ERROR_FILE_CORRUPTED' })
		}
		this._connection = store.openDatabase(file);
	}
	catch (e) {
		if (e.name=='NS_ERROR_FILE_CORRUPTED') {
			this._debug("Database file '" + file.leafName + "' corrupted", 1);
			
			// No backup file! Eek!
			if (!backupFile.exists()) {
				this._debug("No backup file for DB '" + this._dbName + "' exists", 1);
				
				// Save damaged filed
				this._debug('Saving damaged DB file with .damaged extension', 1);
				var damagedFile = Zotero.getZoteroDatabase(this._dbName, 'damaged');
				Zotero.moveToUnique(file, damagedFile);
				
				// Create new main database
				var file = Zotero.getZoteroDatabase(this._dbName);
				this._connection = store.openDatabase(file);
				
				if (corruptMarker.exists()) {
					corruptMarker.remove(null);
				}
				
				alert(Zotero.getString('db.dbCorruptedNoBackup', fileName));
				break catchBlock;
			}
			
			// Save damaged file
			this._debug('Saving damaged DB file with .damaged extension', 1);
			var damagedFile = Zotero.getZoteroDatabase(this._dbName, 'damaged');
			Zotero.moveToUnique(file, damagedFile);
			
			// Test the backup file
			try {
				this._connection = store.openDatabase(backupFile);
			}
			// Can't open backup either
			catch (e) {
				// Create new main database
				var file = Zotero.getZoteroDatabase(this._dbName);
				this._connection = store.openDatabase(file);
				
				alert(Zotero.getString('db.dbRestoreFailed', fileName));
				
				if (corruptMarker.exists()) {
					corruptMarker.remove(null);
				}
				
				break catchBlock;
			}
			
			this._connection = undefined;
			
			// Copy backup file to main DB file
			this._debug("Restoring database '" + this._dbName + "' from backup file", 1);
			try {
				backupFile.copyTo(backupFile.parent, fileName);
			}
			catch (e) {
				// TODO: deal with low disk space
				throw (e);
			}
			
			// Open restored database
			var file = Zotero.getZoteroDirectory();
			file.append(fileName);
			this._connection = store.openDatabase(file);
			this._debug('Database restored', 1);
			var msg = Zotero.getString('db.dbRestored', [
				fileName,
				Zotero.Date.getFileDateString(backupFile),
				Zotero.Date.getFileTimeString(backupFile)
			]);
			alert(msg);
			
			if (corruptMarker.exists()) {
				corruptMarker.remove(null);
			}
			
			break catchBlock;
		}
		
		// Some other error that we don't yet know how to deal with
		throw (e);
	}
	
	// Exclusive locking mode (default) prevents access to Zotero database
	// while Firefox is open -- normal mode is more convenient for development
	if (Zotero.Prefs.get('dbLockExclusive')) {
		Zotero.DB.query("PRAGMA locking_mode=EXCLUSIVE");
	}
	else {
		Zotero.DB.query("PRAGMA locking_mode=NORMAL");
	}
	
	// Register idle and shutdown handlers to call this.observe() for DB backup
	var idleService = Components.classes["@mozilla.org/widget/idleservice;1"]
			.getService(Components.interfaces.nsIIdleService);
	idleService.addIdleObserver(this, 60);
	idleService = null;
	
	// User-defined functions
	// TODO: move somewhere else?
	
	// Levenshtein distance UDF
	var lev = {
		onFunctionCall: function (arg) {
			var a = arg.getUTF8String(0);
			var b = arg.getUTF8String(1);
			return Zotero.Utilities.levenshtein(a, b);
		}
	};
	this._connection.createFunction('levenshtein', 2, lev);
	
	// Regexp UDF
	var rx = {
		onFunctionCall: function (arg) {
			var re = new RegExp(arg.getUTF8String(0));
			var str = arg.getUTF8String(1);
			return re.test(str);
		}
	};
	this._connection.createFunction('regexp', 2, rx);
	
	// text2html UDF
	var rx = {
		onFunctionCall: function (arg) {
			var str = arg.getUTF8String(0);
			return Zotero.Utilities.text2html(str, true);
		}
	};
	this._connection.createFunction('text2html', 1, rx);
	
	return this._connection;
}


Zotero.DBConnection.prototype._debug = function (str, level) {
	var prefix = this._dbName == 'zotero' ? '' : '[' + this._dbName + '] ';
	Zotero.debug(prefix + str, level);
}


Zotero.DBConnection.prototype._getTypedValue = function (statement, i) {
	var type = statement.getTypeOfIndex(i);
	switch (type) {
		case statement.VALUE_TYPE_INTEGER:
			return statement.getInt64(i);
		case statement.VALUE_TYPE_TEXT:
			return statement.getUTF8String(i);
		case statement.VALUE_TYPE_NULL:
			return null;
		case statement.VALUE_TYPE_FLOAT:
			return statement.getDouble(i);
		case statement.VALUE_TYPE_BLOB:
			return statement.getBlob(i, {});
	}
}


// Initialize main database connection
Zotero.DB = new Zotero.DBConnection('zotero');
