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

////////////////////////////////////////////////////////////////////////////////
///
///  CollectionTreeView
///    -- handles the link between an individual tree and the data layer
///    -- displays only collections, in a hierarchy (no items)
///
////////////////////////////////////////////////////////////////////////////////

/*
 *  Constructor for the CollectionTreeView object
 */
Zotero.CollectionTreeView = function()
{
	this._treebox = null;
	this.itemToSelect = null;
	this._highlightedRows = {};
	this._unregisterID = Zotero.Notifier.registerObserver(this, ['collection', 'search', 'share', 'group', 'bucket']);
	this.showDuplicates = false;
	this.showCommons = true;
}

/*
 *  Called by the tree itself
 */
Zotero.CollectionTreeView.prototype.setTree = function(treebox)
{
	if (this._treebox || !treebox) {
		return;
	}
	this._treebox = treebox;
	
	// Add a keypress listener for expand/collapse
	var expandAllRows = this.expandAllRows;
	var collapseAllRows = this.collapseAllRows;
	var tree = this._treebox.treeBody.parentNode;
	tree.addEventListener('keypress', function(event) {
		var key = String.fromCharCode(event.which);
		
		if (key == '+' && !(event.ctrlKey || event.altKey || event.metaKey)) {
			expandAllRows(treebox);
			return;
		}
		else if (key == '-' && !(event.shiftKey || event.ctrlKey ||
				event.altKey || event.metaKey)) {
			collapseAllRows(treebox);
			return;
		}
	}, false);
	
	this.refresh();
	
	this.selection.currentColumn = this._treebox.columns.getFirstColumn();
	
	var row = this.getLastViewedRow();
	this.selection.select(row);
}


/*
 *  Reload the rows from the data access methods
 *  (doesn't call the tree.invalidate methods, etc.)
 */
Zotero.CollectionTreeView.prototype.refresh = function()
{
	// Record open states before refreshing
	if (this._dataItems) {
		for (var i=0, len=this._dataItems.length; i<len; i++) {
			var itemGroup = this._dataItems[i][0]
			if (itemGroup.ref && itemGroup.ref.id == 'commons-header') {
				var commonsExpand = this.isContainerOpen(i);
			}
		}
	}
	
	this.selection.clearSelection();
	var oldCount = this.rowCount;
	this._dataItems = [];
	this.rowCount = 0;
	
	try {
		var unfiledLibraries = Zotero.Prefs.get('unfiledLibraries').split(',');
	}
	catch (e) {
		// Add to personal library by default
		Zotero.Prefs.set('unfiledLibraries', '0');
		unfiledLibraries = ['0'];
	}
	
	var self = this;
	var library = {
		id: null,
		libraryID: null,
		expand: function () {
			var newRows = 0;
			
			var collections = Zotero.getCollections();
			for (var i=0; i<collections.length; i++) {
				// Skip group collections
				if (collections[i].libraryID) {
					continue;
				}
				self._showItem(new Zotero.ItemGroup('collection', collections[i]), 1, newRows+1);
				newRows++;
			}
			
			var savedSearches = Zotero.Searches.getAll();
			if (savedSearches) {
				for (var i=0; i<savedSearches.length; i++) {
					self._showItem(new Zotero.ItemGroup('search', savedSearches[i]), 1, newRows+1);
					newRows++;
				}
			}
			
			// Unfiled items
			if (unfiledLibraries.indexOf('0') != -1) {
				var s = new Zotero.Search;
				// Give virtual search an id so it can be reselected automatically
				s.id = 86345330000; // 'UNFILED' + '000' + libraryID
				s.name = Zotero.getString('pane.collections.unfiled');
				s.addCondition('libraryID', 'is', null);
				s.addCondition('unfiled', 'true');
				self._showItem(new Zotero.ItemGroup('search', s), 1, newRows+1);
				newRows++;
			}
			
			var deletedItems = Zotero.Items.getDeleted();
			if (deletedItems || Zotero.Prefs.get("showTrashWhenEmpty")) {
				self._showItem(new Zotero.ItemGroup('trash', false), 1, newRows+1);
				newRows++;
			}
			self.trashNotEmpty = !!deletedItems;
			
			return newRows;
		}
	};
	this._showItem(new Zotero.ItemGroup('library', library), 0, 1, 1); // itemgroup ref, level, beforeRow, startOpen
	library.expand();
	
	var groups = Zotero.Groups.getAll();
	if (groups.length) {
		this._showItem(new Zotero.ItemGroup('separator', false));
		var header = {
			id: "group-libraries-header",
			label: "Group Libraries", // TODO: localize
			expand: function (groups) {
				if (!groups) {
					var groups = Zotero.Groups.getAll();
				}
				
				for (var i=0; i<groups.length; i++) {
					var startOpen = groups[i].hasCollections();
					
					self._showItem(new Zotero.ItemGroup('group', groups[i]), 1, null, startOpen);
					
					var newRows = 0;
					
					// Add group collections
					var collections = groups[i].getCollections();
					for (var j=0; j<collections.length; j++) {
						self._showItem(new Zotero.ItemGroup('collection', collections[j]), 2);
						newRows++;
					}
					
					// Add group searches
					var savedSearches = Zotero.Searches.getAll(groups[i].libraryID);
					if (savedSearches) {
						for (var j=0; j<savedSearches.length; j++) {
							self._showItem(new Zotero.ItemGroup('search', savedSearches[j]), 2);
							newRows++;
						}
					}
					
					// Unfiled items
					if (unfiledLibraries.indexOf(groups[i].libraryID + '') != -1) {
						var s = new Zotero.Search;
						s.id = parseInt('8634533000' + groups[i].libraryID); // 'UNFILED' + '000' + libraryID
						s.libraryID = groups[i].libraryID;
						s.name = Zotero.getString('pane.collections.unfiled');
						s.addCondition('libraryID', 'is', groups[i].libraryID);
						s.addCondition('unfiled', 'true');
						self._showItem(new Zotero.ItemGroup('search', s), 2);
						newRows++;
					}
				}
			}
		};
		this._showItem(new Zotero.ItemGroup('header', header), null, null, true);
		header.expand(groups);
	}
	
	var shares = Zotero.Zeroconf.instances;
	if (shares.length) {
		this._showItem(new Zotero.ItemGroup('separator', false));
		for each(var share in shares) {
			this._showItem(new Zotero.ItemGroup('share', share));
		}
	}
	
	if (this.showCommons && Zotero.Commons.enabled) {
		this._showItem(new Zotero.ItemGroup('separator', false));
		var header = {
			id: "commons-header",
			label: "Commons", // TODO: localize
			expand: function (buckets) {
				var show = function (buckets) {
					for each(var bucket in buckets) {
						self._showItem(new Zotero.ItemGroup('bucket', bucket), 1);
					}
				}
				if (buckets) {
					show(buckets);
				}
				else {
					Zotero.Commons.getBuckets(show);
				}
			}
		};
		this._showItem(new Zotero.ItemGroup('header', header), null, null, commonsExpand);
		if (commonsExpand) {
			header.expand();
		}
	}
	
	this._refreshHashMap();
	
	// Update the treebox's row count
	var diff = this.rowCount - oldCount;
	if (diff != 0) {
		this._treebox.rowCountChanged(0, diff);
	}
}

/*
 *  Redisplay everything
 */
Zotero.CollectionTreeView.prototype.reload = function()
{
	var openCollections = [];
	
	for (var i=0; i<this.rowCount; i++) {
		if (this.isContainer(i) && this.isContainerOpen(i)) {
			openCollections.push(this._getItemAtRow(i).ref.id);
		}
	}
	
	this._treebox.beginUpdateBatch();
	this.refresh();
	
	for(var i = 0; i < openCollections.length; i++)
	{
		var row = this._collectionRowMap[openCollections[i]];
		if (row != null) {
			this.toggleOpenState(row);
		}
	}
	this._treebox.invalidate();
	this._treebox.endUpdateBatch();
}

/*
 *  Called by Zotero.Notifier on any changes to collections in the data layer
 */
Zotero.CollectionTreeView.prototype.notify = function(action, type, ids)
{
	if ((!ids || ids.length == 0) && action != 'refresh') {
		return;
	}
	
	if (!this._collectionRowMap) {
		Zotero.debug("Collection row map didn't exist in collectionTreeView.notify()");
		return;
	}
	
	this.selection.selectEventsSuppressed = true;
	var savedSelection = this.saveSelection();
	
	var madeChanges = false;
	
	if (action == 'delete') {
		var selectedIndex = this.selection.count ? this.selection.selectedIndex : 0;
		
		//Since a delete involves shifting of rows, we have to do it in order
		
		//sort the ids by row
		var rows = new Array();
		for (var i in ids)
		{
			switch (type)
			{
				case 'collection':
					if(this._collectionRowMap[ids[i]] != null)
					{
						rows.push(this._collectionRowMap[ids[i]]);
					}
					break;
				
				case 'search':
					if(this._searchRowMap[ids[i]] != null)
					{
						rows.push(this._searchRowMap[ids[i]]);
					}
					break;
				
				case 'group':
					//if (this._groupRowMap[ids[i]] != null) {
					//	rows.push(this._groupRowMap[ids[i]]);
					//}
					
					// For now, just reload if a group is removed, since otherwise
					// we'd have to remove collections too
					this.reload();
					this.rememberSelection(savedSelection);
					break;
			}
		}
		
		if(rows.length > 0)
		{
			rows.sort(function(a,b) { return a-b });
			
			for(var i=0, len=rows.length; i<len; i++)
			{
				var row = rows[i];
				this._hideItem(row-i);
				this._treebox.rowCountChanged(row-i,-1);
			}
			
			this._refreshHashMap();
		}
		
		if (!this.selection.count) {
			this.selection.select(selectedIndex)
		}
	}
	else if(action == 'move')
	{
		for (var i=0; i<ids.length; i++) {
			// Open the parent collection if closed
			var collection = Zotero.Collections.get(ids[i]);
			var parentID = collection.parent;
			if (parentID && this._collectionRowMap[parentID] &&
					!this.isContainerOpen(this._collectionRowMap[parentID])) {
				this.toggleOpenState(this._collectionRowMap[parentID]);
			}
		}
		
		this.reload();
		this.rememberSelection(savedSelection);
	}
	else if (action == 'modify' || action == 'refresh') {
		if (type != 'bucket') {
			this.reload();
		}
		this.rememberSelection(savedSelection);
	}
	else if(action == 'add')
	{
		// Multiple adds not currently supported
		ids = ids[0];
		
		switch (type)
		{
			case 'collection':
				var collection = Zotero.Collections.get(ids);
				var collectionID = collection.id;
				// Open container if creating subcollection
				var parentID = collection.getParent();
				if (parentID) {
					if (!this.isContainerOpen(this._collectionRowMap[parentID])){
						this.toggleOpenState(this._collectionRowMap[parentID]);
					}
				}
				
				this.reload();
				if (Zotero.suppressUIUpdates) {
					this.rememberSelection(savedSelection);
					break;
				}
				this.selection.select(this._collectionRowMap[collectionID]);
				break;
				
			case 'search':
				this.reload();
				if (Zotero.suppressUIUpdates) {
					this.rememberSelection(savedSelection);
					break;
				}
				this.selection.select(this._searchRowMap[ids]);
				break;
			
			case 'group':
				this.reload();
				// Groups can only be created during sync
				this.rememberSelection(savedSelection);
				break;

			case 'bucket':
				this.reload();
				this.rememberSelection(savedSelection);
				break;
		}
	}
	
	this.selection.selectEventsSuppressed = false;
}


/*
 * Set the rows that should be highlighted -- actual highlighting is done
 * by getRowProperties based on the array set here
 */
Zotero.CollectionTreeView.prototype.setHighlightedRows = function (ids) {
	this._highlightedRows = {};
	this._treebox.invalidate();
	
	for each(var id in ids) {
		this.expandToCollection(id);
		this._highlightedRows[this._collectionRowMap[id]] = true;
		this._treebox.invalidateRow(this._collectionRowMap[id]);
	}
}


/*
 *  Unregisters view from Zotero.Notifier (called on window close)
 */
Zotero.CollectionTreeView.prototype.unregister = function()
{
	Zotero.Notifier.unregisterObserver(this._unregisterID);
}

Zotero.CollectionTreeView.prototype.isLibrary = function(row)
{
	return this._getItemAtRow(row).isLibrary();
}

Zotero.CollectionTreeView.prototype.isCollection = function(row)
{
	return this._getItemAtRow(row).isCollection();
}

Zotero.CollectionTreeView.prototype.isSearch = function(row)
{
	return this._getItemAtRow(row).isSearch();
}


////////////////////////////////////////////////////////////////////////////////
///
///  nsITreeView functions
///  http://www.xulplanet.com/references/xpcomref/ifaces/nsITreeView.html
///
////////////////////////////////////////////////////////////////////////////////

Zotero.CollectionTreeView.prototype.getCellText = function(row, column)
{
	var obj = this._getItemAtRow(row);
	
	if(column.id == "zotero-collections-name-column")
		return obj.getName();
	else
		return "";
}

Zotero.CollectionTreeView.prototype.getImageSrc = function(row, col)
{
	var source = this._getItemAtRow(row);
	var collectionType = source.type;
	switch (collectionType) {
		case 'trash':
			if (this.trashNotEmpty) {
				collectionType += '-full';
			}
			break;
		
		case 'collection':
			// TODO: group collection
			return "chrome://zotero-platform/content/treesource-collection.png";
 		
		case 'search':
			if ((source.ref.id + "").match(/^8634533000/)) { // 'UNFILED000'
				collectionType = "search-virtual";
				break;
			}
			return "chrome://zotero-platform/content/treesource-search.png";
		
		case 'header':
			if (source.ref.id == 'group-libraries-header') {
				collectionType = 'groups';
			}
			else if (source.ref.id == 'commons-header') {
				collectionType = 'commons';
			}
			break;
		
		case 'group':
			collectionType = 'library';
			break;
	}
	return "chrome://zotero/skin/treesource-" + collectionType + ".png";
}

Zotero.CollectionTreeView.prototype.isContainer = function(row)
{
	var itemGroup = this._getItemAtRow(row);
	return itemGroup.isLibrary(true) || itemGroup.isCollection() || itemGroup.isHeader() || itemGroup.isBucket();
}

Zotero.CollectionTreeView.prototype.isContainerOpen = function(row)
{
	return this._dataItems[row][1];
}

/*
 * Returns true if the collection has no child collections
 */
Zotero.CollectionTreeView.prototype.isContainerEmpty = function(row)
{
	var itemGroup = this._getItemAtRow(row);
	if (itemGroup.isLibrary()) {
		return false;
	}
	if (itemGroup.isHeader()) {
		return false;
	}
	if (itemGroup.isBucket()) {
		return true;
	}
	if (itemGroup.isGroup()) {
		return !itemGroup.ref.hasCollections();
	}
	if (itemGroup.isCollection()) {
		return !itemGroup.ref.hasChildCollections();
	}
	return true;
}

Zotero.CollectionTreeView.prototype.getLevel = function(row)
{
	return this._dataItems[row][2];
}

Zotero.CollectionTreeView.prototype.getParentIndex = function(row)
{
	var thisLevel = this.getLevel(row);
	if(thisLevel == 0) return -1;
	for(var i = row - 1; i >= 0; i--)
		if(this.getLevel(i) < thisLevel)
			return i;
	return -1;
}

Zotero.CollectionTreeView.prototype.hasNextSibling = function(row, afterIndex)
{
	var thisLevel = this.getLevel(row);
	for(var i = afterIndex + 1; i < this.rowCount; i++)
	{	
		var nextLevel = this.getLevel(i);
		if(nextLevel == thisLevel) return true;
		else if(nextLevel < thisLevel) return false;
	}
}

/*
 *  Opens/closes the specified row
 */
Zotero.CollectionTreeView.prototype.toggleOpenState = function(row)
{
	var count = 0;		//used to tell the tree how many rows were added/removed
	var thisLevel = this.getLevel(row);

	this._treebox.beginUpdateBatch();
	if (this.isContainerOpen(row)) {
		while((row + 1 < this._dataItems.length) && (this.getLevel(row + 1) > thisLevel))
		{
			this._hideItem(row+1);
			count--;	//count is negative when closing a container because we are removing rows
		}
	}
	else {
		var itemGroup = this._getItemAtRow(row);
		
		if (itemGroup.type == 'header') {
			itemGroup.ref.expand();
		}
		else if(itemGroup.type == 'bucket') {
		}
		else {
			if (itemGroup.isLibrary()) {
				count = itemGroup.ref.expand();
			}
			else {
				if (itemGroup.isGroup()) {
					var collections = itemGroup.ref.getCollections();
				}
				else {
					var collections = Zotero.getCollections(itemGroup.ref.id);
				}
				// Add child collections
				for (var i=0; i<collections.length; i++) {
					this._showItem(new Zotero.ItemGroup('collection', collections[i]), thisLevel + 1, row + count + 1);
					count++;
				}
				
				// Add group searches
				if (itemGroup.isGroup()) {
					var savedSearches = Zotero.Searches.getAll(itemGroup.ref.libraryID);
					if (savedSearches) {
						for (var i=0; i<savedSearches.length; i++) {
							this._showItem(new Zotero.ItemGroup('search', savedSearches[i]), thisLevel + 1, row + count + 1);
							count;
						}
					}
				}
			}
		}
	}
	this._dataItems[row][1] = !this._dataItems[row][1];  //toggle container open value

	this._treebox.rowCountChanged(row+1, count); //tell treebox to repaint these
	this._treebox.invalidateRow(row);
	this._treebox.endUpdateBatch();	
	this._refreshHashMap();
}


Zotero.CollectionTreeView.prototype.isSelectable = function (row, col) {
	var itemGroup = this._getItemAtRow(row);
	switch (itemGroup.type) {
		case 'separator':
			return false;
	}
	return true;
}


Zotero.CollectionTreeView.prototype.__defineGetter__('editable', function () {
	return this._getItemAtRow(this.selection.currentIndex).editable;
});


Zotero.CollectionTreeView.prototype.expandAllRows = function(treebox) {
	var view = treebox.view;
	treebox.beginUpdateBatch();
	for (var i=0; i<view.rowCount; i++) {
		if (view.isContainer(i) && !view.isContainerOpen(i)) {
			view.toggleOpenState(i);
		}
	}
	treebox.endUpdateBatch();
}


Zotero.CollectionTreeView.prototype.expandToCollection = function(collectionID) {
	var col = Zotero.Collections.get(collectionID);
	if (!col) {
		Zotero.debug("Cannot expand to nonexistent collection " + collectionID, 2);
		return false;
	}
	var row = this._collectionRowMap[collectionID];
	if (row) {
		return true;
	}
	var path = [];
	var parent;
	while (parent = col.getParent()) {
		path.unshift(parent);
		col = Zotero.Collections.get(parent);
	}
	for each(var id in path) {
		row = this._collectionRowMap[id];
		if (!this.isContainerOpen(row)) {
			this.toggleOpenState(row);
		}
	}
	return true;
}


Zotero.CollectionTreeView.prototype.collapseAllRows = function(treebox) {
	var view = treebox.view;
	treebox.beginUpdateBatch();
	for (var i=0; i<view.rowCount; i++) {
		if (view.isContainer(i) && view.isContainerOpen(i)) {
			view.toggleOpenState(i);
		}
	}
	treebox.endUpdateBatch();
}


////////////////////////////////////////////////////////////////////////////////
///
///  Additional functions for managing data in the tree
///
////////////////////////////////////////////////////////////////////////////////
/**
 * @param	{Integer|null}		libraryID		Library to select, or null for local library
 */
Zotero.CollectionTreeView.prototype.selectLibrary = function (libraryID) {
	if (Zotero.suppressUIUpdates) {
		Zotero.debug("UI updates suppressed -- not changing library selection");
		return false;
	}
	
	// Select local library
	if (!libraryID) {
		this.selection.select(0);
		return true;
	}
	
	// Already selected
	var itemGroup = this._getItemAtRow(this.selection.currentIndex);
	if (itemGroup.isLibrary(true) && itemGroup.ref.libraryID == libraryID) {
		return true;
	}
	
	// Find library
	for (var i=0, rows=this.rowCount; i<rows; i++) {
		var itemGroup = this._getItemAtRow(i);
		if (itemGroup.ref && itemGroup.ref.libraryID == libraryID) {
			this.selection.select(i);
			return true;
		}
	}
	
	return false;
}

/**
 * Select the last-viewed source
 */
Zotero.CollectionTreeView.prototype.getLastViewedRow = function () {
	var lastViewedFolder = Zotero.Prefs.get('lastViewedFolder');
	var matches = lastViewedFolder.match(/^(?:(C|S|G)([0-9]+)|L)$/);
	var select = 0;
	if (matches) {
		if (matches[1] == 'C') {
			if (this._collectionRowMap[matches[2]]) {
				select = this._collectionRowMap[matches[2]];
			}
			// Search recursively
			else {
				var path = [];
				var failsafe = 10; // Only go up ten levels
				var lastCol = matches[2];
				do {
					failsafe--;
					var col = Zotero.Collections.get(lastCol);
					if (!col) {
						var msg = "Last-viewed collection not found";
						Zotero.debug(msg);
						path = [];
						break;
					}
					var par = col.getParent();
					if (!par) {
						var msg = "Parent collection not found in "
							+ "Zotero.CollectionTreeView.setTree()";
						Zotero.debug(msg, 1);
						Components.utils.reportError(msg);
						path = [];
						break;
					}
					lastCol = par;
					path.push(lastCol);
				}
				while (!this._collectionRowMap[lastCol] && failsafe > 0)
				if (path.length) {
					for (var i=path.length-1; i>=0; i--) {
						var id = path[i];
						var row = this._collectionRowMap[id];
						if (!row) {
							var msg = "Collection not found in tree in "
								+ "Zotero.CollectionTreeView.setTree()";
							Zotero.debug(msg, 1);
							Components.utils.reportError(msg);
							break;
						}
						if (!this.isContainerOpen(row)) {
							this.toggleOpenState(row);
							if (this._collectionRowMap[matches[2]]) {
								select = this._collectionRowMap[matches[2]];
								break;
							}
						}
					}
				}
			}
		}
		else if (matches[1] == 'S' && this._searchRowMap[matches[2]]) {
			select = this._searchRowMap[matches[2]];
		}
		else if (matches[1] == 'G' && this._groupRowMap[matches[2]]) {
			select = this._groupRowMap[matches[2]];
		}
	}
	
	return select;
}


/*
 *  Delete the selection
 */
Zotero.CollectionTreeView.prototype.deleteSelection = function()
{
	if(this.selection.count == 0)
		return;

	//collapse open collections
	for(var i=0; i<this.rowCount; i++)
		if(this.selection.isSelected(i) && this.isContainer(i) && this.isContainerOpen(i))
			this.toggleOpenState(i);
	this._refreshHashMap();
	
	//create an array of collections
	var rows = new Array();
	var start = new Object();
	var end = new Object();
	for (var i=0, len=this.selection.getRangeCount(); i<len; i++)
	{
		this.selection.getRangeAt(i,start,end);
		for (var j=start.value; j<=end.value; j++)
			if(!this._getItemAtRow(j).isLibrary())
				rows.push(j);
	}
	
	//iterate and erase...
	this._treebox.beginUpdateBatch();
	for (var i=0; i<rows.length; i++)
	{
		//erase collection from DB:
		var group = this._getItemAtRow(rows[i]-i);
		if(group.isCollection())
		{
			group.ref.erase();
		}
		else if(group.isSearch())
		{
			Zotero.Searches.erase(group.ref['id']);
		}
	}
	this._treebox.endUpdateBatch();
	
	if (end.value < this.rowCount) {
		var row = this._getItemAtRow(end.value);
		if (row.isSeparator()) {
			return;
		}
		this.selection.select(end.value);
	}
	else {
		this.selection.select(this.rowCount-1);
	}
}

/*
 *  Called by various view functions to show a row
 * 
 *  	itemGroup:	reference to the ItemGroup
 *  	level:	the indent level of the row
 *      beforeRow:	row index to insert new row before
 */
Zotero.CollectionTreeView.prototype._showItem = function(itemGroup, level, beforeRow, startOpen)
{
	if (!level) {
		level = 0;
	}
	
	if (!beforeRow) {
		beforeRow = this._dataItems.length;
	}
	
	if (!startOpen) {
		startOpen = false;
	}
	
	this._dataItems.splice(beforeRow, 0, [itemGroup, startOpen, level]);
	this.rowCount++;
}

/*
 *  Called by view to hide specified row
 */
Zotero.CollectionTreeView.prototype._hideItem = function(row)
{
	this._dataItems.splice(row,1); this.rowCount--;
}

/*
 * Returns Zotero.ItemGroup at row
 */
Zotero.CollectionTreeView.prototype._getItemAtRow = function(row)
{
	return this._dataItems[row][0];
}

/*
 *  Saves the ids of the currently selected item for later
 */
Zotero.CollectionTreeView.prototype.saveSelection = function()
{
	for (var i=0, len=this.rowCount; i<len; i++) {
		if (this.selection.isSelected(i)) {
			var itemGroup = this._getItemAtRow(i);
			if (itemGroup.isLibrary()) {
				return 'L';
			}
			else if (itemGroup.isCollection()) {
				return 'C' + itemGroup.ref.id;
			}
			else if (itemGroup.isSearch()) {
				return 'S' + itemGroup.ref.id;
			}
			else if (itemGroup.isTrash()) {
				return 'T';
			}
			else if (itemGroup.isGroup()) {
				return 'G' + itemGroup.ref.id;
			}
		}
	}
	return false;
}

/*
 *  Sets the selection based on saved selection ids (see above)
 */
Zotero.CollectionTreeView.prototype.rememberSelection = function(selection)
{
	if (!selection) {
		return;
	}
	
	var id = selection.substr(1);
	switch (selection.substr(0, 1)) {
		// Library
		case 'L':
			this.selection.select(0);
			break;
		
		// Collection
		case 'C':
			// This only selects the collection if it's still visible,
			// so we open the parent in notify()
			if (this._collectionRowMap[id] != undefined) {
				this.selection.select(this._collectionRowMap[id]);
			}
			break;
		
		// Saved search
		case 'S':
			if (this._searchRowMap[id] != undefined) {
				this.selection.select(this._searchRowMap[id]);
			}
			break;
		
		// Trash
		case 'T':
			if (this._getItemAtRow(this.rowCount-1).isTrash()){
				this.selection.select(this.rowCount-1);
			}
			else {
				this.selection.select(0);
			}
			break;
		
		// Group
		case 'G':
			if (this._groupRowMap[id] != undefined) {
				this.selection.select(this._groupRowMap[i]);
			}
			break;
	}
}
	
	
Zotero.CollectionTreeView.prototype.getSelectedCollection = function(asID) {
	if (this.selection
			&& this.selection.count > 0
			&& this.selection.currentIndex != -1) {
		var collection = this._getItemAtRow(this.selection.currentIndex);
		if (collection && collection.isCollection()) {
			return asID ? collection.ref.id : collection.ref;
		}
	}
	return false;
}



/*
 * Creates hash map of collection and search ids to row indexes
 * e.g., var rowForID = this._collectionRowMap[]
 */
Zotero.CollectionTreeView.prototype._refreshHashMap = function()
{	
	this._collectionRowMap = [];
	this._searchRowMap = [];
	this._groupRowMap = [];
	for(var i=0; i < this.rowCount; i++){
		var itemGroup = this._getItemAtRow(i);
		if (itemGroup.isCollection(i)) {
			this._collectionRowMap[itemGroup.ref.id] = i;
		}
		else if (itemGroup.isSearch(i)) {
			this._searchRowMap[itemGroup.ref.id] = i;
		}
		else if (itemGroup.isGroup(i)) {
			this._groupRowMap[itemGroup.ref.id] = i;
		}
	}
}

////////////////////////////////////////////////////////////////////////////////
///
///  Command Controller:
///		for Select All, etc.
///
////////////////////////////////////////////////////////////////////////////////

Zotero.CollectionTreeCommandController = function(tree)
{
	this.tree = tree;
}

Zotero.CollectionTreeCommandController.prototype.supportsCommand = function(cmd)
{
}

Zotero.CollectionTreeCommandController.prototype.isCommandEnabled = function(cmd)
{
}

Zotero.CollectionTreeCommandController.prototype.doCommand = function(cmd)
{
}

Zotero.CollectionTreeCommandController.prototype.onEvent = function(evt)
{
}

////////////////////////////////////////////////////////////////////////////////
///
///  Drag-and-drop functions:
///		canDrop() and drop() are for nsITreeView
///		onDragStart() and onDrop() are for HTML 5 Drag and Drop
///
////////////////////////////////////////////////////////////////////////////////


/*
 * Start a drag using HTML 5 Drag and Drop
 */
Zotero.CollectionTreeView.prototype.onDragStart = function(event) {
	var itemGroup = this._getItemAtRow(this.selection.currentIndex);
	if (!itemGroup.isCollection()) {
		return;
	}
	event.dataTransfer.setData("zotero/collection", itemGroup.ref.id);
}


/*
 *  Called while a drag is over the tree.
 */
Zotero.CollectionTreeView.prototype.canDrop = function(row, orient, dragData)
{
	//Zotero.debug("Row is " + row + "; orient is " + orient);
	
	if (!dragData || !dragData.data) {
		var dragData = Zotero.DragDrop.getDragData(this);
	}
	if (!dragData) {
		return false;
	}
	var dataType = dragData.dataType;
	var data = dragData.data;
	
	// For dropping collections onto root level
	if (orient == 1 && row == 0 && dataType == 'zotero/collection') {
		return true;
	}
	else if(orient == 0)	//directly on a row...
	{
		var itemGroup = this._getItemAtRow(row); //the collection we are dragging over
		
		if (dataType == 'zotero/item' && itemGroup.isBucket()) {
			return true;
		}
		
		if (!itemGroup.editable) {
			return false;
		}
		
		if (dataType == 'zotero/item') {
			var ids = data;
			var items = Zotero.Items.get(ids);
			var skip = true;
			for each(var item in items) {
				// Can only drag top-level items
				if (!item.isTopLevelItem()) {
					return false
				}
				
				if (itemGroup.isWithinGroup() && item.isAttachment()) {
					// Linked files can't be added to groups
					if (item.attachmentLinkMode == Zotero.Attachments.LINK_MODE_LINKED_FILE) {
						return false;
					}
					if (!itemGroup.filesEditable) {
						return false;
					}
					skip = false;
					continue;
				}
				
				// Cross-library drag
				if (itemGroup.ref.libraryID != item.libraryID) {
					// Only allow cross-library drag to root library and collections
					if (!(itemGroup.isLibrary(true) || itemGroup.isCollection())) {
						return false;
					}
					
					var linkedItem = item.getLinkedItem(itemGroup.ref.libraryID);
					if (linkedItem) {
						// For drag to root, skip if linked item exists
						if (itemGroup.isLibrary(true)) {
							continue;
						}
						// For drag to collection
						else if (itemGroup.isCollection()) {
							// skip if linked item is already in it
							if (itemGroup.ref.hasItem(linkedItem.id)) {
								continue;
							}
							// or if linked item is a child item
							else if (linkedItem.getSource()) {
								continue;
							}
						}
					}
					skip = false;
					continue;
				}
				
				// Intra-library drag
				
				// Don't allow drag onto root of same library
				if (itemGroup.isLibrary(true)) {
					return false;
				}
				
				// Make sure there's at least one item that's not already
				// in this collection
				if (itemGroup.isCollection() && !itemGroup.ref.hasItem(item.id)) {
					skip = false;
					continue;
				}
			}
			if (skip) {
				return false;
			}
			return true;
		}
		else if (dataType == 'zotero/item-xml') {
			var xml = new XML(data.data);
			for each(var xmlNode in xml.items.item) {
				var item = Zotero.Sync.Server.Data.xmlToItem(xmlNode);
				if (item.isRegularItem() || !item.getSource()) {
					return true;
				}
			}
			return false;
		}
		else if (dataType == 'text/x-moz-url' || dataType == 'application/x-moz-file') {
			if (itemGroup.isSearch()) {
				return false;
			}
			if (dataType == 'application/x-moz-file') {
				// Don't allow folder drag
				if (data[0].isDirectory()) {
					return false;
				}
				// Don't allow drop if no permissions
				if (!itemGroup.filesEditable) {
					return false;
				}
			}
			
			return true;
		}
		else if (dataType == 'zotero/collection') {
			// Collections cannot be dropped on themselves
			if (data[0] == itemGroup.ref.id) {
				return false;
			}
			
			// Nor in their children
			if (Zotero.Collections.get(data[0]).hasDescendent('collection', itemGroup.ref.id)) {
				return false;
			}
			
			var col = Zotero.Collections.get(data[0]);
			
			// Nor, at least for now, on another group
			if (itemGroup.isWithinGroup()) {
				if (itemGroup.ref.libraryID != col.libraryID) {
					return false;
				}
			}
			// Nor from a group library to the local library
			else if (col.libraryID) {
				return false;
			}
			
			return true;
		}
	}
	return false;
}

/*
 *  Called when something's been dropped on or next to a row
 */
Zotero.CollectionTreeView.prototype.drop = function(row, orient)
{
	var dragData = Zotero.DragDrop.getDragData(this);
	
	if (!this.canDrop(row, orient, dragData)) {
		return false;
	}
	
	var dataType = dragData.dataType;
	var data = dragData.data;
	var itemGroup = this._getItemAtRow(row);
	
	if(dataType == 'zotero/collection')
	{
		var targetCollectionID;
		if (itemGroup.isCollection()) {
			targetCollectionID = itemGroup.ref.id;
		}
		var droppedCollection = Zotero.Collections.get(data[0]);
		droppedCollection.parent = targetCollectionID;
		droppedCollection.save();
	}
	else if (dataType == 'zotero/item') {
		var ids = data;
		if (ids.length < 1) {
			return;
		}
		
		if (itemGroup.isWithinGroup()) {
			var targetLibraryID = itemGroup.ref.libraryID;
		}
		else {
			var targetLibraryID = null;
		}
		
		if(itemGroup.isBucket()) {
			itemGroup.ref.uploadItems(ids);
			return;
		}
		
		Zotero.DB.beginTransaction();
		
		var items = Zotero.Items.get(ids);
		if (!items) {
			return;
		}
		
		var newItems = [];
		var newIDs = [];
		// TODO: support items coming from different sources?
		if (items[0].libraryID == targetLibraryID) {
			var sameLibrary = true;
		}
		else {
			var sameLibrary = false;
		}
		
		for each(var item in items) {
			if (!(item.isRegularItem() || !item.getSource())) {
				continue;
			}
			
			if (sameLibrary) {
				newIDs.push(item.id);
			}
			else {
				newItems.push(item);
			}
		}
		
		if (!sameLibrary) {
			var toReconcile = [];
			
			for each(var item in newItems) {
				// Check if there's already a copy of this item in the library
				var linkedItem = item.getLinkedItem(targetLibraryID);
				if (linkedItem) {
					// Add linked item to target collection rather than copying
					if (itemGroup.isCollection()) {
						itemGroup.ref.addItem(linkedItem.id);
						continue;
					}
					
					/*
					// TODO: support tags, related, attachments, etc.
					
					// Overlay source item fields on unsaved clone of linked item
					var newItem = item.clone(false, linkedItem.clone(true));
					newItem.setField('dateAdded', item.dateAdded);
					newItem.setField('dateModified', item.dateModified);
					
					var diff = newItem.diff(linkedItem, false, ["dateAdded", "dateModified"]);
					if (!diff) {
						// Check if creators changed
						var creatorsChanged = false;
						
						var creators = item.getCreators();
						var linkedCreators = linkedItem.getCreators();
						if (creators.length != linkedCreators.length) {
							Zotero.debug('Creators have changed');
							creatorsChanged = true;
						}
						else {
							for (var i=0; i<creators.length; i++) {
								if (!creators[i].ref.equals(linkedCreators[i].ref)) {
									Zotero.debug('changed');
									creatorsChanged = true;
									break;
								}
							}
						}
						if (!creatorsChanged) {
							Zotero.debug("Linked item hasn't changed -- skipping conflict resolution");
							continue;
						}
					}
					toReconcile.push([newItem, linkedItem]);
					continue;
					*/
				}
				
				// Standalone attachment
				if (item.isAttachment()) {
					var id = Zotero.Attachments.copyAttachmentToLibrary(item, targetLibraryID);
					newIDs.push(id);
					continue;
				}
				
				// Create new unsaved clone item in target library
				var newItem = new Zotero.Item(item.itemTypeID);
				newItem.libraryID = targetLibraryID;
				// DEBUG: save here because clone() doesn't currently work on unsaved tagged items
				var id = newItem.save();
				newItem = Zotero.Items.get(id);
				item.clone(false, newItem);
				newItem.save();
				//var id = newItem.save();
				//var newItem = Zotero.Items.get(id);
				
				// Record link
				item.addLinkedItem(newItem);
				newIDs.push(id);
				
				if (item.isNote()) {
					continue;
				}
				
				// For regular items, add child items if prefs and permissions allow
				
				// Child notes
				if (Zotero.Prefs.get('groups.copyChildNotes')) {
					var noteIDs = item.getNotes();
					var notes = Zotero.Items.get(noteIDs);
					for each(var note in notes) {
						var newNote = new Zotero.Item('note');
						newNote.libraryID = targetLibraryID;
						// DEBUG: save here because clone() doesn't currently work on unsaved tagged items
						var id = newNote.save();
						newNote = Zotero.Items.get(id);
						note.clone(false, newNote);
						newNote.setSource(newItem.id);
						newNote.save();
						
						note.addLinkedItem(newNote);
					}
				}
				
				// Child attachments
				var copyChildLinks = Zotero.Prefs.get('groups.copyChildLinks');
				var copyChildFileAttachments = Zotero.Prefs.get('groups.copyChildFileAttachments');
				if (copyChildLinks || copyChildFileAttachments) {
					var attachmentIDs = item.getAttachments();
					var attachments = Zotero.Items.get(attachmentIDs);
					for each(var attachment in attachments) {
						var linkMode = attachment.attachmentLinkMode;
						
						// Skip linked files
						if (linkMode == Zotero.Attachments.LINK_MODE_LINKED_FILE) {
							continue;
						}
						
						// Skip imported files if we don't have pref and permissions
						if (linkMode == Zotero.Attachments.LINK_MODE_LINKED_URL) {
							if (!copyChildLinks) {
								Zotero.debug("Skipping child link attachment on drag");
								continue;
							}
						}
						else {
							if (!copyChildFileAttachments || !itemGroup.filesEditable) {
								Zotero.debug("Skipping child file attachment on drag");
								continue;
							}
						}
						
						var id = Zotero.Attachments.copyAttachmentToLibrary(attachment, targetLibraryID, newItem.id);
					}
				}
			}
			
			if (toReconcile.length) {
				var sourceName = items[0].libraryID ? Zotero.Libraries.getName(items[0].libraryID)
									: Zotero.getString('pane.collections.library');
				var targetName = targetLibraryID ? Zotero.Libraries.getName(libraryID)
									: Zotero.getString('pane.collections.library');
				
				var io = {
					dataIn: {
						type: "item",
						captions: [
							// TODO: localize
							sourceName,
							targetName,
							"Merged Item"
						],
						objects: toReconcile
					}
				};
				
				/*
				if (type == 'item') {
					if (!Zotero.Utilities.isEmpty(changedCreators)) {
						io.dataIn.changedCreators = changedCreators;
					}
				}
				*/
				
				var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
						   .getService(Components.interfaces.nsIWindowMediator);
				var lastWin = wm.getMostRecentWindow("navigator:browser");
				lastWin.openDialog('chrome://zotero/content/merge.xul', '', 'chrome,modal,centerscreen', io);
				
				for each(var obj in io.dataOut) {
					obj.ref.save();
				}
			}
		}
		
		if (newIDs.length && itemGroup.isCollection()) {
			itemGroup.ref.addItems(newIDs);
		}
		
		Zotero.DB.commitTransaction();
	}
	else if (dataType == 'zotero/item-xml') {
		Zotero.DB.beginTransaction();
		var xml = new XML(data.data);
		var toAdd = [];
		for each(var xmlNode in xml.items.item) {
			var item = Zotero.Sync.Server.Data.xmlToItem(xmlNode, false, true);
			if (item.isRegularItem() || !item.getSource()) {
				var id = item.save();
				toAdd.push(id);
			}
		}
		if (toAdd.length > 0) {
			this._getItemAtRow(row).ref.addItems(toAdd);
		}
		
		Zotero.DB.commitTransaction();
		return;
	}
	else if (dataType == 'text/x-moz-url' || dataType == 'application/x-moz-file') {
		if (itemGroup.isWithinGroup()) {
			var targetLibraryID = itemGroup.ref.libraryID;
		}
		else {
			var targetLibraryID = null;
		}
		
		if (itemGroup.isCollection()) {
			var parentCollectionID = itemGroup.ref.id;
		}
		else {
			var parentCollectionID = false;
		}
		
		var unlock = Zotero.Notifier.begin(true);
		try {
			for (var i=0; i<data.length; i++) {
				var file = data[i];
				
				if (dataType == 'text/x-moz-url') {
					var url = data[i];
					
					if (url.indexOf('file:///') == 0) {
						var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
								   .getService(Components.interfaces.nsIWindowMediator);
						var win = wm.getMostRecentWindow("navigator:browser");
						// If dragging currently loaded page, only convert to
						// file if not an HTML document
						if (win.content.location.href != url ||
								win.content.document.contentType != 'text/html') {
							var nsIFPH = Components.classes["@mozilla.org/network/protocol;1?name=file"]
									.getService(Components.interfaces.nsIFileProtocolHandler);
							try {
								var file = nsIFPH.getFileFromURLSpec(url);
							}
							catch (e) {
								Zotero.debug(e);
							}
						}
					}
					
					// Still string, so remote URL
					if (typeof file == 'string') {
						var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
								   .getService(Components.interfaces.nsIWindowMediator);
						var win = wm.getMostRecentWindow("navigator:browser");
						win.ZoteroPane.addItemFromURL(url, 'temporaryPDFHack', null, row); // TODO: don't do this
						continue;
					}
					
					// Otherwise file, so fall through
				}
				
				try {
					Zotero.DB.beginTransaction();
					var itemID = Zotero.Attachments.importFromFile(file, false, targetLibraryID);
					if (parentCollectionID) {
						var col = Zotero.Collections.get(parentCollectionID);
						if (col) {
							col.addItem(itemID);
						}
					}
					Zotero.DB.commitTransaction();
				}
				catch (e) {
					Zotero.DB.rollbackTransaction();
					throw (e);
				}
			}
		}
		finally {
			Zotero.Notifier.commit(unlock);
		}
	}
}


/*
 * Called by HTML 5 Drag and Drop when dragging over the tree
 */
Zotero.CollectionTreeView.prototype.onDragEnter = function (event) {
	//Zotero.debug("Storing current drag data");
	Zotero.DragDrop.currentDataTransfer = event.dataTransfer;
}


/*
 * Called by HTML 5 Drag and Drop when dragging over the tree
 */
Zotero.CollectionTreeView.prototype.onDragOver = function (event, dropdata, session) {
	return false;
}


/*
 * Called by HTML 5 Drag and Drop when dropping onto the tree
 */
Zotero.CollectionTreeView.prototype.onDrop = function (event, dropdata, session) {
	return false;
}

Zotero.CollectionTreeView.prototype.onDragExit = function (event) {
	//Zotero.debug("Clearing drag data");
	Zotero.DragDrop.currentDataTransfer = null;
}




////////////////////////////////////////////////////////////////////////////////
///
///  Functions for nsITreeView that we have to stub out.
///
////////////////////////////////////////////////////////////////////////////////

Zotero.CollectionTreeView.prototype.isSorted = function() 							{ return false; }
Zotero.CollectionTreeView.prototype.isEditable = function(row, idx) 				{ return false; }

/* Set 'highlighted' property on rows set by setHighlightedRows */
Zotero.CollectionTreeView.prototype.getRowProperties = function(row, props) {
	if (this._highlightedRows[row]) {
		var aServ = Components.classes["@mozilla.org/atom-service;1"].
			getService(Components.interfaces.nsIAtomService);
		props.AppendElement(aServ.getAtom("highlighted"));
	}
}

Zotero.CollectionTreeView.prototype.getColumnProperties = function(col, prop) 		{ }
Zotero.CollectionTreeView.prototype.getCellProperties = function(row, col, prop) 	{ }
Zotero.CollectionTreeView.prototype.isSeparator = function(index) {
	var source = this._getItemAtRow(index);
	return source.type == 'separator';
}
Zotero.CollectionTreeView.prototype.performAction = function(action) 				{ }
Zotero.CollectionTreeView.prototype.performActionOnCell = function(action, row, col)	{ }
Zotero.CollectionTreeView.prototype.getProgressMode = function(row, col) 			{ }
Zotero.CollectionTreeView.prototype.cycleHeader = function(column)					{ }

////////////////////////////////////////////////////////////////////////////////
///
///  Zotero ItemGroup -- a sort of "super class" for collection, library,
///  	and saved search
///
////////////////////////////////////////////////////////////////////////////////

Zotero.ItemGroup = function(type, ref)
{
	this.type = type;
	this.ref = ref;
}

Zotero.ItemGroup.prototype.isLibrary = function(includeGlobal)
{
	if (includeGlobal) {
		return this.type == 'library' || this.type == 'group';
	}
	return this.type == 'library';
}

Zotero.ItemGroup.prototype.isCollection = function()
{
	return this.type == 'collection';
}

Zotero.ItemGroup.prototype.isSearch = function()
{
	return this.type == 'search';
}

Zotero.ItemGroup.prototype.isShare = function()
{
	return this.type == 'share';
}

Zotero.ItemGroup.prototype.isBucket = function()
{
	return this.type == 'bucket';
}

Zotero.ItemGroup.prototype.isTrash = function()
{
	return this.type == 'trash';
}

Zotero.ItemGroup.prototype.isGroup = function() {
	return this.type == 'group';
}

Zotero.ItemGroup.prototype.isHeader = function () {
	return this.type == 'header';
}

Zotero.ItemGroup.prototype.isSeparator = function () {
	return this.type == 'separator';
}


// Special
Zotero.ItemGroup.prototype.isWithinGroup = function () {
	return this.ref && !!this.ref.libraryID;
}

Zotero.ItemGroup.prototype.__defineGetter__('editable', function () {
	if (this.isTrash() || this.isShare() || this.isBucket()) {
		return false;
	}
	if (!this.isWithinGroup()) {
		return true;
	}
	var libraryID = this.ref.libraryID;
	if (this.isGroup()) {
		return this.ref.editable;
	}
	if (this.isCollection() || this.isSearch()) {
		var type = Zotero.Libraries.getType(libraryID);
		if (type == 'group') {
			var groupID = Zotero.Groups.getGroupIDFromLibraryID(libraryID);
			var group = Zotero.Groups.get(groupID);
			return group.editable;
		}
		throw ("Unknown library type '" + type + "' in Zotero.ItemGroup.editable");
	}
	return false;
});

Zotero.ItemGroup.prototype.__defineGetter__('filesEditable', function () {
	if (this.isTrash() || this.isShare()) {
		return false;
	}
	if (!this.isWithinGroup()) {
		return true;
	}
	var libraryID = this.ref.libraryID;
	if (this.isGroup()) {
		return this.ref.filesEditable;
	}
	if (this.isCollection()) {
		var type = Zotero.Libraries.getType(libraryID);
		if (type == 'group') {
			var groupID = Zotero.Groups.getGroupIDFromLibraryID(libraryID);
			var group = Zotero.Groups.get(groupID);
			return group.filesEditable;
		}
		throw ("Unknown library type '" + type + "' in Zotero.ItemGroup.filesEditable");
	}
	return false;
});

Zotero.ItemGroup.prototype.getName = function()
{
	switch (this.type) {
		case 'collection':
			return this.ref.name;
		
		case 'library':
			return Zotero.getString('pane.collections.library');
		
		case 'search':
			return this.ref.name;
		
		case 'share':
			return this.ref.name;

		case 'bucket':
			return this.ref.name;
		
		case 'trash':
			return Zotero.getString('pane.collections.trash');
		
		case 'group':
			return this.ref.name;
		
		case 'header':
			return this.ref.label;
		
		default:
			return "";
	}
}

Zotero.ItemGroup.prototype.getChildItems = function()
{
	switch (this.type) {
		// Fake results if this is a shared library
		case 'share':
			return this.ref.getAll();

		case 'bucket':
			return this.ref.getItems();
		
		case 'header':
			return [];
	}
	
	var s = this.getSearchObject();
	
	// FIXME: Hack to exclude group libraries for now
	if (this.isSearch()) {
		var currentLibraryID = this.ref.libraryID;
		if (currentLibraryID) {
			s.addCondition('libraryID', 'is', currentLibraryID);
		}
		else {
			var groups = Zotero.Groups.getAll();
			for each(var group in groups) {
				s.addCondition('libraryID', 'isNot', group.libraryID);
			}
		}
	}
	
	try {
		var ids;
		if (this.showDuplicates) {
			var duplicates = new Zotero.Duplicate;
			var tmpTable = s.search(true);
			ids = duplicates.getIDs(tmpTable);
			Zotero.DB.query("DROP TABLE " + tmpTable);
		}
		else {
			ids = s.search();
		}
	}
	catch (e) {
		Zotero.DB.rollbackAllTransactions();
		Zotero.debug(e, 2);
		throw (e);
	}
	
	return Zotero.Items.get(ids);
}


/*
 * Returns the search object for the currently display
 *
 * This accounts for the collection, saved search, quicksearch, tags, etc.
 */
Zotero.ItemGroup.prototype.getSearchObject = function() {
	var includeScopeChildren = false;
	
	// Create/load the inner search
	var s = new Zotero.Search();
	if (this.isLibrary()) {
		s.addCondition('libraryID', 'is', null);
		s.addCondition('noChildren', 'true');
		includeScopeChildren = true;
	}
	else if (this.isGroup()) {
		s.addCondition('libraryID', 'is', this.ref.libraryID);
		s.addCondition('noChildren', 'true');
		includeScopeChildren = true;
	}
	else if (this.isCollection()) {
		s.addCondition('noChildren', 'true');
		s.addCondition('collectionID', 'is', this.ref.id);
		if (Zotero.Prefs.get('recursiveCollections')) {
			s.addCondition('recursive', 'true');
		}
		includeScopeChildren = true;
	}
	else if (this.isTrash()) {
		s.addCondition('deleted', 'true');
	}
	else if (this.isSearch()) {
		var s = this.ref;
	}
	else {
		throw ('Invalid search mode in Zotero.ItemGroup.getSearchObject()');
	}
	
	// Create the outer (filter) search
	var s2 = new Zotero.Search();
	if (this.isTrash()) {
		s2.addCondition('deleted', 'true');
	}
	s2.setScope(s, includeScopeChildren);
	
	if (this.searchText) {
		s2.addCondition('quicksearch', 'contains', this.searchText);
	}
	
	if (this.tags){
		for (var tag in this.tags){
			if (this.tags[tag]){
				s2.addCondition('tag', 'is', tag);
			}
		}
	}
	
	return s2;
}


/*
 * Returns all the tags used by items in the current view
 */
Zotero.ItemGroup.prototype.getChildTags = function() {
	switch (this.type) {
		// TODO: implement?
		case 'share':
			return false;

		case 'bucket':
			return false;
		
		case 'header':
			return false;
	}

	
	var s = this.getSearchObject();
	return Zotero.Tags.getAllWithinSearch(s);
}


Zotero.ItemGroup.prototype.setSearch = function(searchText)
{
	this.searchText = searchText;
}

Zotero.ItemGroup.prototype.setTags = function(tags)
{
	this.tags = tags;
}

/*
 * Returns TRUE if saved search, quicksearch or tag filter
 */
Zotero.ItemGroup.prototype.isSearchMode = function() {
	switch (this.type) {
		case 'search':
		case 'trash':
			return true;
	}
	
	// Quicksearch
	if (this.searchText != '') {
		return true;
	}
	
	// Tag filter
	if (this.tags) {
		for (var i in this.tags) {
			return true;
		}
	}
}
