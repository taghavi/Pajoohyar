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

// Enumeration of types of translators
const TRANSLATOR_TYPES = {"import":1, "export":2, "web":4, "search":8};

/**
 * Singleton to handle loading and caching of translators
 * @namespace
 */
Zotero.Translators = new function() {
	var _cache, _translators;
	var _initialized = false;
	
	/**
	 * Initializes translator cache, loading all relevant translators into memory
	 */
	this.init = function() {
		_initialized = true;
		
		var start = (new Date()).getTime();
		var transactionStarted = false;
		
		Zotero.UnresponsiveScriptIndicator.disable();
		
		// Use try/finally so that we always reset the unresponsive script warning
		try {
			_cache = {"import":[], "export":[], "web":[], "search":[]};
			_translators = {};
			
			var dbCacheResults = Zotero.DB.query("SELECT leafName, translatorJSON, "+
				"code, lastModifiedTime FROM translatorCache");
			var dbCache = {};
			for each(var cacheEntry in dbCacheResults) {
				dbCache[cacheEntry.leafName] = cacheEntry;
			}
			
			var i = 0;
			var filesInCache = {};
			var contents = Zotero.getTranslatorsDirectory().directoryEntries;
			while(contents.hasMoreElements()) {
				var file = contents.getNext().QueryInterface(Components.interfaces.nsIFile);
				var leafName = file.leafName;
				if(!leafName || leafName[0] == ".") continue;
				var lastModifiedTime = file.lastModifiedTime;
				
				var dbCacheEntry = false;
				if(dbCache[leafName]) {
					filesInCache[leafName] = true;
					if(dbCache[leafName].lastModifiedTime == lastModifiedTime) {
						dbCacheEntry = dbCache[file.leafName];
					}
				}
				
				if(dbCacheEntry) {
					// get JSON from cache if possible
					var translator = new Zotero.Translator(file, dbCacheEntry.translatorJSON, dbCacheEntry.code);
					filesInCache[leafName] = true;
				} else {
					// otherwise, load from file
					var translator = new Zotero.Translator(file);
				}
				
				if(translator.translatorID) {
					if(_translators[translator.translatorID]) {
						// same translator is already cached
						translator.logError('Translator with ID '+
							translator.translatorID+' already loaded from "'+
							_translators[translator.translatorID].file.leafName+'"');
					} else {
						// add to cache
						_translators[translator.translatorID] = translator;
						for(var type in TRANSLATOR_TYPES) {
							if(translator.translatorType & TRANSLATOR_TYPES[type]) {
								_cache[type].push(translator);
							}
						}
						
						if(!dbCacheEntry) {
							// Add cache misses to DB
							if(!transactionStarted) {
								transactionStarted = true;
								Zotero.DB.beginTransaction();
							}
							Zotero.Translators.cacheInDB(leafName, translator.metadataString, translator.cacheCode ? translator.code : null, lastModifiedTime);
							delete translator.metadataString;
						}
					}
				}
				
				i++;
			}
			
			// Remove translators from DB as necessary
			for(var leafName in dbCache) {
				if(!filesInCache[leafName]) {
					Zotero.DB.query("DELETE FROM translatorCache WHERE leafName = ?", [leafName]);
				}
			}
			
			// Close transaction
			if(transactionStarted) {
				Zotero.DB.commitTransaction();
			}
			
			// Sort by priority
			var collation = Zotero.getLocaleCollation();
			var cmp = function (a, b) {
				if (a.priority > b.priority) {
					return 1;
				}
				else if (a.priority < b.priority) {
					return -1;
				}
				return collation.compareString(1, a.label, b.label);
			}
			for(var type in _cache) {
				_cache[type].sort(cmp);
			}
		}
		finally {
			Zotero.UnresponsiveScriptIndicator.enable();
		}
		
		Zotero.debug("Cached "+i+" translators in "+((new Date()).getTime() - start)+" ms");
	}
	
	/**
	 * Gets the translator that corresponds to a given ID
	 */
	this.get = function(id) {
		if(!_initialized) this.init();
		return _translators[id] ? _translators[id] : false;
	}
	
	/**
	 * Gets all translators for a specific type of translation
	 */
	this.getAllForType = function(type) {
		if(!_initialized) this.init();
		return _cache[type].slice(0);
	}
	
	/**
	 * @param	{String}		label
	 * @return	{String}
	 */
	this.getFileNameFromLabel = function(label) {
		return Zotero.File.getValidFileName(label) + ".js";
	}
	
	
	/**
	 * @param	{String}		metadata
	 * @param	{String}		metadata.translatorID		Translator GUID
	 * @param	{Integer}		metadata.translatorType		See TRANSLATOR_TYPES in translate.js
	 * @param	{String}		metadata.label				Translator title
	 * @param	{String}		metadata.creator			Translator author
	 * @param	{String|Null}	metadata.target				Target regexp
	 * @param	{String|Null}	metadata.minVersion
	 * @param	{String}		metadata.maxVersion
	 * @param	{String|undefined}	metadata.configOptions
	 * @param	{String|undefined}	metadata.displayOptions
	 * @param	{Integer}		metadata.priority
	 * @param	{Boolean}		metadata.inRepository
	 * @param	{String}		metadata.lastUpdated		SQL date
	 * @param	{String}		code
	 * @return	{nsIFile}
	 */
	this.save = function(metadata, code) {
		if (!metadata.translatorID) {
			throw ("metadata.translatorID not provided in Zotero.Translators.save()");
		}
		
		if (!metadata.translatorType) {
			var found = false;
			for each(var type in TRANSLATOR_TYPES) {
				if (metadata.translatorType & type) {
					found = true;
					break;
				}
			}
			if (!found) {
				throw ("Invalid translatorType '" + metadata.translatorType + "' in Zotero.Translators.save()");
			}
		}
		
		if (!metadata.label) {
			throw ("metadata.label not provided in Zotero.Translators.save()");
		}
		
		if (!metadata.priority) {
			throw ("metadata.priority not provided in Zotero.Translators.save()");
		}
		
		if (!metadata.lastUpdated) {
			throw ("metadata.lastUpdated not provided in Zotero.Translators.save()");
		}
		
		if (!code) {
			throw ("code not provided in Zotero.Translators.save()");
		}
		
		var fileName = Zotero.Translators.getFileNameFromLabel(metadata.label);
		var destFile = Zotero.getTranslatorsDirectory();
		destFile.append(fileName);
		
		// JSON.stringify (FF 3.5.4 and up) has the benefit of indenting JSON
		var metadataJSON = JSON.stringify(metadata,null,8);
		
		var str = metadataJSON + "\n\n" + code;
		
		var translator = Zotero.Translators.get(metadata.translatorID);
		if (translator && destFile.equals(translator.file)) {
			var sameFile = true;
		}
		
		if (!sameFile && destFile.exists()) {
			var msg = "Overwriting translator with same filename '"
				+ fileName + "'";
			Zotero.debug(msg, 1);
			Zotero.debug(metadata, 1);
			Components.utils.reportError(msg + " in Zotero.Translators.save()");
		}
		
		if (translator && translator.file.exists()) {
			translator.file.remove(false);
		}
		
		Zotero.debug("Saving translator '" + metadata.label + "'");
		Zotero.debug(str);
		Zotero.File.putContents(destFile, str);
		
		return destFile;
	}
	
	this.cacheInDB = function(fileName, metadataJSON, code, lastModifiedTime) {
		Zotero.DB.query("REPLACE INTO translatorCache VALUES (?, ?, ?, ?)",
			[fileName, metadataJSON, code, lastModifiedTime]);
	}
}

/**
 * @class Represents an individual translator
 * @constructor
 * @param {nsIFile} file File from which to generate a translator object
 * @property {String} translatorID Unique GUID of the translator
 * @property {Integer} translatorType Type of the translator (use bitwise & with TRANSLATOR_TYPES to read)
 * @property {String} label Human-readable name of the translator
 * @property {String} creator Author(s) of the translator
 * @property {String} target Location that the translator processes
 * @property {String} minVersion Minimum Zotero version
 * @property {String} maxVersion Minimum Zotero version
 * @property {Integer} priority Lower-priority translators will be selected first
 * @property {String} browserSupport String indicating browser supported by the translator
 *     g = Gecko (Firefox)
 *     c = Google Chrome (WebKit & V8)
 *     s = Safari (WebKit & Nitro/Squirrelfish Extreme)
 *     i = Internet Explorer
 * @property {Object} configOptions Configuration options for import/export
 * @property {Object} displayOptions Display options for export
 * @property {Boolean} inRepository Whether the translator may be found in the repository
 * @property {String} lastUpdated SQL-style date and time of translator's last update
 * @property {String} code The executable JavaScript for the translator
 */
Zotero.Translator = function(file, json, code) {
	const codeGetterFunction = function() { return Zotero.File.getContents(this.file); }
	// Maximum length for the info JSON in a translator
	const MAX_INFO_LENGTH = 4096;
	const infoRe = /^\s*{[\S\s]*?}\s*?[\r\n]/;
	
	this.file = file;
	
	var fStream, cStream;
	if(json) {
		var info = JSON.parse(json);
	} else {
		fStream = Components.classes["@mozilla.org/network/file-input-stream;1"].
			createInstance(Components.interfaces.nsIFileInputStream);
		cStream = Components.classes["@mozilla.org/intl/converter-input-stream;1"].
			createInstance(Components.interfaces.nsIConverterInputStream);
		fStream.init(file, -1, -1, 0);
		cStream.init(fStream, "UTF-8", 8192,
			Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
		
		var str = {};
		cStream.readString(MAX_INFO_LENGTH, str);
		
		// We assume lastUpdated is at the end to avoid running the regexp on more than necessary
		var lastUpdatedIndex = str.value.indexOf('"lastUpdated"');
		if (lastUpdatedIndex == -1) {
			this.logError("Invalid or missing translator metadata JSON object in " + file.leafName);
			fStream.close();
			return;
		}
		
		// Add 50 characters to clear lastUpdated timestamp and final "}"
		var header = str.value.substr(0, lastUpdatedIndex + 50);
		var m = infoRe.exec(header);
		if (!m) {
			this.logError("Invalid or missing translator metadata JSON object in " + file.leafName);
			fStream.close();
			return;
		}
		
		this.metadataString = m[0];
		
		try {
			var info = JSON.parse(this.metadataString);
		} catch(e) {
			this.logError("Invalid or missing translator metadata JSON object in " + file.leafName);
			fStream.close();
			return;
		}
	}
	
	var haveMetadata = true;
	// make sure we have all the properties
	for each(var property in ["translatorID", "translatorType", "label", "creator", "target", "minVersion", "maxVersion", "priority", "lastUpdated", "inRepository"]) {
		if(info[property] === undefined) {
			this.logError('Missing property "'+property+'" in translator metadata JSON object in ' + file.leafName);
			haveMetadata = false;
			break;
		} else {
			this[property] = info[property];
		}
	}
	if(!haveMetadata) {
		if(fStream) fStream.close();
		return;
	}
	
	this._configOptions = info["configOptions"] ? info["configOptions"] : {};
	this._displayOptions = info["displayOptions"] ? info["displayOptions"] : {};
	this.browserSupport = info["browserSupport"] ? info["browserSupport"] : "g";
	
	if(this.translatorType & TRANSLATOR_TYPES["import"]) {
		// compile import regexp to match only file extension
		try {
			this.importRegexp = this.target ? new RegExp("\\."+this.target+"$", "i") : null;
		} catch(e) {
			this.logError("Invalid target in " + file.leafName);
			this.importRegexp = null;
			if(fStream) fStream.close();
			return;
		}
	}
		
	this.cacheCode = false;
	if(this.translatorType & TRANSLATOR_TYPES["web"]) {
		// compile web regexp
		try {
			this.webRegexp = this.target ? new RegExp(this.target, "i") : null;
		} catch(e) {
			if(fStream) fStream.close();
			this.logError("Invalid target in " + file.leafName);
			this.webRegexp = null;
			if(fStream) fStream.close();
			return;
		}
		
		if(!this.target) {
			this.cacheCode = true;
			
			if(json) {
				// if have JSON, also have code
				this.code = code;
			} else {
				// for translators used on every page, cache code in memory
				var strs = [str.value];
				var amountRead;
				while(amountRead = cStream.readString(8192, str)) strs.push(str.value);
				this.code = strs.join("");
			}
		}
	}
	
	if(!this.cacheCode) this.__defineGetter__("code", codeGetterFunction);
	if(!json) cStream.close();
}

Zotero.Translator.prototype.__defineGetter__("displayOptions", function() {
	return Zotero.Utilities.deepCopy(this._displayOptions);
});
Zotero.Translator.prototype.__defineGetter__("configOptions", function() {
	return Zotero.Utilities.deepCopy(this._configOptions);
});

/**
 * Log a translator-related error
 * @param {String} message The error message
 * @param {String} [type] The error type ("error", "warning", "exception", or "strict")
 * @param {String} [line] The text of the line on which the error occurred
 * @param {Integer} lineNumber
 * @param {Integer} colNumber
 */
Zotero.Translator.prototype.logError = function(message, type, line, lineNumber, colNumber) {
	var ios = Components.classes["@mozilla.org/network/io-service;1"].
		getService(Components.interfaces.nsIIOService);
	Zotero.log(message, type ? type : "error", ios.newFileURI(this.file).spec);
}