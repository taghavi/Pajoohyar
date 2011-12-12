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


/*
 * Base function for retrieving ids and names of static types stored in the DB
 * (e.g. creatorType, fileType, charset, itemType)
 *
 * Extend using the following code within a child constructor:
 *
 * 	Zotero.CachedTypes.apply(this, arguments);
 *  this.constructor.prototype = new Zotero.CachedTypes();
 *
 * And the following properties:
 *
 *	this._typeDesc = 'c';
 *	this._idCol = '';
 *	this._nameCol = '';
 *	this._table = '';
 *	this._ignoreCase = false;
 * 
 */
Zotero.CachedTypes = function() {
	var _types = [];
	var _typesLoaded;
	var self = this;
	
	// Override these variables in child classes
	this._typeDesc = '';
	this._idCol = '';
	this._nameCol = '';
	this._table = '';
	this._ignoreCase = false;
	this._hasCustom = false;
	
	this.getName = getName;
	this.getID = getID;
	this.getTypes = getTypes;
	
	function getName(idOrName) {
		if (!_typesLoaded) {
			_load();
		}
		
		if (this._ignoreCase) {
			idOrName = idOrName + '';
			idOrName = idOrName.toLowerCase();
		}
		
		if (!_types['_' + idOrName]) {
			Zotero.debug('Invalid ' + this._typeDesc + ' ' + idOrName, 1);
			return '';
		}
		
		return _types['_' + idOrName]['name'];
	}
	
	
	function getID(idOrName) {
		if (!_typesLoaded) {
			_load();
		}
		
		if (this._ignoreCase) {
			idOrName = idOrName + '';
			idOrName = idOrName.toLowerCase();
		}
		
		if (!_types['_' + idOrName]) {
			Zotero.debug('Invalid ' + this._typeDesc + ' ' + idOrName, 1);
			return false;
		}
		
		return _types['_' + idOrName]['id'];
	}
	
	
	function getTypes(where) {
		return Zotero.DB.query('SELECT ' + this._idCol + ' AS id, '
			+ this._nameCol + ' AS name'
			+ (this._hasCustom ? ', custom' : '')
			+ ' FROM ' + this._table
			+ (where ? ' ' + where : ''));
	}
	
	
	// Currently used only for item types
	this.isCustom = function (idOrName) {
		if (!_typesLoaded) {
			_load();
		}
		
		return _types['_' + idOrName] && _types['_' + idOrName].custom ? _types['_' + idOrName].custom : false;
	}
	
	
	this.reload = function () {
		_typesLoaded = false;
	}
	
	
	function _load() {
		_types = [];
		
		var types = self.getTypes();
		for (var i in types) {
			// Store as both id and name for access by either
			var typeData = {
				id: types[i]['id'],
				name: types[i]['name'],
				custom: types[i].custom ? types[i].custom : false
			}
			_types['_' + types[i]['id']] = typeData;
			if (self._ignoreCase) {
				_types['_' + types[i]['name'].toLowerCase()] = _types['_' + types[i]['id']];
			}
			else {
				_types['_' + types[i]['name']] = _types['_' + types[i]['id']];
			}
		}
		
		_typesLoaded = true;
	}
}


Zotero.CreatorTypes = new function() {
	Zotero.CachedTypes.apply(this, arguments);
	this.constructor.prototype = new Zotero.CachedTypes();
	
	this.getTypesForItemType = getTypesForItemType;
	this.isValidForItemType = isValidForItemType;
	this.getPrimaryIDForType = getPrimaryIDForType;
	
	this._typeDesc = 'creator type';
	this._idCol = 'creatorTypeID';
	this._nameCol = 'creatorType';
	this._table = 'creatorTypes';
	
	var _primaryIDCache = {};
	var _hasCreatorTypeCache = {};
	
	function getTypesForItemType(itemTypeID) {
		var sql = "SELECT creatorTypeID AS id, creatorType AS name "
			+ "FROM itemTypeCreatorTypes NATURAL JOIN creatorTypes "
			// DEBUG: sort needs to be on localized strings in itemPane.js
			// (though still put primary field at top)
			+ "WHERE itemTypeID=? ORDER BY primaryField=1 DESC, name";
		return Zotero.DB.query(sql, itemTypeID);
	}
	
	
	function isValidForItemType(creatorTypeID, itemTypeID) {
		var sql = "SELECT COUNT(*) FROM itemTypeCreatorTypes "
			+ "WHERE itemTypeID=? AND creatorTypeID=?";
		return !!Zotero.DB.valueQuery(sql, [itemTypeID, creatorTypeID]);
	}
	
	
	this.getLocalizedString = function(idOrName) {
		return Zotero.getString("creatorTypes."+this.getName(idOrName));
	}
	
	
	this.itemTypeHasCreators = function (itemTypeID) {
		if (typeof _hasCreatorTypeCache[itemTypeID] != 'undefined') {
			return _hasCreatorTypeCache[itemTypeID];
		}
		_hasCreatorTypeCache[itemTypeID] = !!this.getTypesForItemType(itemTypeID).length;
		return _hasCreatorTypeCache[itemTypeID];
	}
	
	
	function getPrimaryIDForType(itemTypeID) {
		if (_primaryIDCache[itemTypeID]) {
			return _primaryIDCache[itemTypeID];
		}
		var sql = "SELECT creatorTypeID FROM itemTypeCreatorTypes "
			+ "WHERE itemTypeID=? AND primaryField=1";
		var creatorTypeID = Zotero.DB.valueQuery(sql, itemTypeID);
		if (!creatorTypeID) {
			return false;
		}
		_primaryIDCache[itemTypeID] = creatorTypeID;
		return creatorTypeID;
	}
}


Zotero.ItemTypes = new function() {
	Zotero.CachedTypes.apply(this, arguments);
	this.constructor.prototype = new Zotero.CachedTypes();
	
	this.getPrimaryTypes = getPrimaryTypes;
	this.getSecondaryTypes = getSecondaryTypes;
	this.getHiddenTypes = getHiddenTypes;
	this.getLocalizedString = getLocalizedString;
	this.getImageSrc = getImageSrc;
	
	this.customIDOffset = 10000;
	
	this._typeDesc = 'item type';
	this._idCol = 'itemTypeID';
	this._nameCol = 'typeName';
	this._table = 'itemTypesCombined';
	this._hasCustom = true;
	
	var _customImages = {};
	var _customLabels = {};
	
	function getPrimaryTypes() {
		return this.getTypes('WHERE display=2');
	}

	function getSecondaryTypes() {
		return this.getTypes('WHERE display=1');
	}
	
	function getHiddenTypes() {
		return this.getTypes('WHERE display=0');
	}
	
	function getLocalizedString(idOrName) {
		var typeName = this.getName(idOrName);
		
		// For custom types, use provided label
		if (this.isCustom(idOrName)) {
			var id = this.getID(idOrName) - this.customIDOffset;
			if (_customLabels[id]) {
				return _customLabels[id];
			}
			var sql = "SELECT label FROM customItemTypes WHERE customItemTypeID=?";
			var label = Zotero.DB.valueQuery(sql, id);
			_customLabels[id] = label;
			return label;
		}
		
		return Zotero.getString("itemTypes." + typeName);
	}
	
	function getImageSrc(itemType) {
		if (this.isCustom(itemType)) {
			var id = this.getID(itemType) - this.customIDOffset;
			if (_customImages[id]) {
				return _customImages[id];
			}
			var sql = "SELECT icon FROM customItemTypes WHERE customItemTypeID=?";
			var src = Zotero.DB.valueQuery(sql, id);
			if (src) {
				_customImages[id] = src;
				return src;
			}
		}
		
		// DEBUG: only have icons for some types so far
		switch (itemType) {
			case 'attachment-file':
			case 'attachment-link':
			case 'attachment-snapshot':
			case 'attachment-web-link':
			case 'attachment-pdf':
			case 'artwork':
			case 'audioRecording':
			case 'blogPost':
			case 'book':
			case 'bookSection':
			case 'computerProgram':
			case 'conferencePaper':
			case 'email':
			case 'film':
			case 'forumPost':
			case 'interview':
			case 'journalArticle':
			case 'letter':
			case 'magazineArticle':
			case 'manuscript':
			case 'map':
			case 'newspaperArticle':
			case 'note':
			case 'podcast':
			case 'radioBroadcast':
			case 'report':
			case 'thesis':
			case 'tvBroadcast':
			case 'videoRecording':
			case 'webpage':
				return "chrome://zotero/skin/treeitem-" + itemType + ".png";
		}
		
		return "chrome://zotero/skin/treeitem.png";
	}
}


Zotero.FileTypes = new function() {
	Zotero.CachedTypes.apply(this, arguments);
	this.constructor.prototype = new Zotero.CachedTypes();
	
	this._typeDesc = 'file type';
	this._idCol = 'fileTypeID';
	this._nameCol = 'fileType';
	this._table = 'fileTypes';
	
	this.getIDFromMIMEType = getIDFromMIMEType;
	
	function getIDFromMIMEType(mimeType) {
		var sql = "SELECT fileTypeID FROM fileTypeMIMETypes "
			+ "WHERE ? LIKE mimeType || '%'";
			
		return Zotero.DB.valueQuery(sql, [mimeType]);
	}
}


Zotero.CharacterSets = new function() {
	Zotero.CachedTypes.apply(this, arguments);
	this.constructor.prototype = new Zotero.CachedTypes();
	
	this._typeDesc = 'character set';
	this._idCol = 'charsetID';
	this._nameCol = 'charset';
	this._table = 'charsets';
	this._ignoreCase = true;
	
	this.getAll = getAll;
	
	function getAll() {
		return this.getTypes();
	}
}

