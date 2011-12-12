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
const ZOTERO_TAB_URL = "chrome://zotero/content/tab.xul";

/*
 * This object contains the various functions for the interface
 */
var ZoteroPane = new function()
{
	this.collectionsView = false;
	this.itemsView = false;
	this.__defineGetter__('loaded', function () _loaded);
	
	//Privileged methods
	this.init = init;
	this.destroy = destroy;
	this.makeVisible = makeVisible;
	this.isShowing = isShowing;
	this.isFullScreen = isFullScreen;
	this.handleKeyDown = handleKeyDown;
	this.handleKeyUp = handleKeyUp;
	this.setHighlightedRowsCallback = setHighlightedRowsCallback;
	this.handleKeyPress = handleKeyPress;
	this.newItem = newItem;
	this.newCollection = newCollection;
	this.newSearch = newSearch;
	this.openAdvancedSearchWindow = openAdvancedSearchWindow;
	this.toggleTagSelector = toggleTagSelector;
	this.updateTagSelectorSize = updateTagSelectorSize;
	this.getTagSelection = getTagSelection;
	this.clearTagSelection = clearTagSelection;
	this.updateTagFilter = updateTagFilter;
	this.onCollectionSelected = onCollectionSelected;
	this.itemSelected = itemSelected;
	this.reindexItem = reindexItem;
	this.duplicateSelectedItem = duplicateSelectedItem;
	this.editSelectedCollection = editSelectedCollection;
	this.copySelectedItemsToClipboard = copySelectedItemsToClipboard;
	this.clearQuicksearch = clearQuicksearch;
	this.handleSearchKeypress = handleSearchKeypress;
	this.handleSearchInput = handleSearchInput;
	this.search = search;
	this.selectItem = selectItem;
	this.getSelectedCollection = getSelectedCollection;
	this.getSelectedSavedSearch = getSelectedSavedSearch;
	this.getSelectedItems = getSelectedItems;
	this.getSortedItems = getSortedItems;
	this.getSortField = getSortField;
	this.getSortDirection = getSortDirection;
	this.buildItemContextMenu = buildItemContextMenu;
	this.loadURI = loadURI;
	this.setItemsPaneMessage = setItemsPaneMessage;
	this.clearItemsPaneMessage = clearItemsPaneMessage;
	this.contextPopupShowing = contextPopupShowing;
	this.openNoteWindow = openNoteWindow;
	this.addTextToNote = addTextToNote;
	this.addAttachmentFromDialog = addAttachmentFromDialog;
	this.viewAttachment = viewAttachment;
	this.viewSelectedAttachment = viewSelectedAttachment;
	this.showAttachmentNotFoundDialog = showAttachmentNotFoundDialog;
	this.relinkAttachment = relinkAttachment;
	this.reportErrors = reportErrors;
	this.displayErrorMessage = displayErrorMessage;
	
	this.document = document;
	
	const COLLECTIONS_HEIGHT = 32; // minimum height of the collections pane and toolbar
	
	var self = this;
	var _loaded = false;
	var titlebarcolorState, titleState;
	
	// Also needs to be changed in collectionTreeView.js
	var _lastViewedFolderRE = /^(?:(C|S|G)([0-9]+)|L)$/;
	
	/*
	 * Called when the window containing Zotero pane is open
	 */
	function init()
	{	
		if(!Zotero || !Zotero.initialized) return;
		
		// Set "Report Errors..." label via property rather than DTD entity,
		// since we need to reference it in script elsewhere
		document.getElementById('zotero-tb-actions-reportErrors').setAttribute('label',
			Zotero.getString('errorReport.reportErrors'));
		// Set key down handler
		document.getElementById('appcontent').addEventListener('keydown', ZoteroPane_Local.handleKeyDown, true);
		
		if (Zotero.locked) {
			return;
		}
		_loaded = true;
		
		var zp = document.getElementById('zotero-pane');
		Zotero.setFontSize(zp);
		this.updateToolbarPosition();
		window.addEventListener("resize", this.updateToolbarPosition, false);
		window.setTimeout(this.updateToolbarPosition, 0);
		
		if (Zotero.isMac) {
			//document.getElementById('zotero-tb-actions-zeroconf-update').setAttribute('hidden', false);
			document.getElementById('zotero-pane-stack').setAttribute('platform', 'mac');
		} else if(Zotero.isWin) {
			document.getElementById('zotero-pane-stack').setAttribute('platform', 'win');
		}
		
		if(Zotero.isFx4 || window.ZoteroTab) {
			// hack, since Fx 4 no longer sets active, and the reverse in polarity of the preferred
			// property makes things painful to handle otherwise
			// DEBUG: remove this once we only support Fx 4
			zp.setAttribute("ignoreActiveAttribute", "true");
		}
		
		//Initialize collections view
		this.collectionsView = new Zotero.CollectionTreeView();
		var collectionsTree = document.getElementById('zotero-collections-tree');
		collectionsTree.view = this.collectionsView;
		collectionsTree.controllers.appendController(new Zotero.CollectionTreeCommandController(collectionsTree));
		collectionsTree.addEventListener("click", ZoteroPane_Local.onTreeClick, true);
		
		var itemsTree = document.getElementById('zotero-items-tree');
		itemsTree.controllers.appendController(new Zotero.ItemTreeCommandController(itemsTree));
		itemsTree.addEventListener("click", ZoteroPane_Local.onTreeClick, true);
		
		this.buildItemTypeMenus();
		
		var menu = document.getElementById("contentAreaContextMenu");
		menu.addEventListener("popupshowing", ZoteroPane_Local.contextPopupShowing, false);
		
		Zotero.Keys.windowInit(document);
		
		if (Zotero.restoreFromServer) {
			Zotero.restoreFromServer = false;
			
			setTimeout(function () {
				var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
										.getService(Components.interfaces.nsIPromptService);
				var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
									+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_CANCEL);
				var index = ps.confirmEx(
					null,
					"Zotero Restore",
					"The local Zotero database has been cleared."
						+ " "
						+ "Would you like to restore from the Zotero server now?",
					buttonFlags,
					"Sync Now",
					null, null, null, {}
				);
				
				if (index == 0) {
					Zotero.Sync.Server.sync({
						onSuccess: function () {
							Zotero.Sync.Runner.setSyncIcon();
							
							ps.alert(
								null,
								"Restore Completed",
								"The local Zotero database has been successfully restored."
							);
						},
						
						onError: function (msg) {
							ps.alert(
								null,
								"Restore Failed",
								"An error occurred while restoring from the server:\n\n"
									+ msg
							);
							
							Zotero.Sync.Runner.error(msg);
						}
					});
				}
			}, 1000);
		}
		// If the database was initialized or there are no sync credentials and
		// Zotero hasn't been run before in this profile, display the start page
		// -- this way the page won't be displayed when they sync their DB to
		// another profile or if the DB is initialized erroneously (e.g. while
		// switching data directory locations)
		else if (Zotero.Prefs.get('firstRun2')) {
			if (Zotero.Schema.dbInitialized || !Zotero.Sync.Server.enabled) {
				setTimeout(function () {
					//<abszh>
					//var url = "http://zotero.org/start";
					var url = "http://pajoohyar.ir";
					//</abszh>
					gBrowser.selectedTab = gBrowser.addTab(url);
				}, 400);
			}
			Zotero.Prefs.set('firstRun2', false);
			try {
				Zotero.Prefs.clear('firstRun');
			}
			catch (e) {}
		}
		
		// Hide sync debugging menu by default
		if (Zotero.Prefs.get('sync.debugMenu')) {
			var sep = document.getElementById('zotero-tb-actions-sync-separator');
			sep.hidden = false;
			sep.nextSibling.hidden = false;
			sep.nextSibling.nextSibling.hidden = false;
			sep.nextSibling.nextSibling.nextSibling.hidden = false;
		}
		
		if (Zotero.Prefs.get('debugShowDuplicates')) {
			document.getElementById('zotero-tb-actions-showDuplicates').hidden = false;
		}
		//<abszh>
		//<web.ebox>
		zp.style.direction = Zotero.Prefs.get('crcis.direction');		
		//</web.ebox>
		//</abszh>
	}
	
	
	this.buildItemTypeMenus = function () {
		//
		// Create the New Item (+) menu with each item type
		//
		var addMenu = document.getElementById('zotero-tb-add').firstChild;
		var moreMenu = document.getElementById('zotero-tb-add-more');
		
		// Remove all nodes, in case we're reloading
		var options = addMenu.getElementsByAttribute("class", "zotero-tb-add");
		while (options.length) {
			var p = options[0].parentNode;
			p.removeChild(options[0]);
		}
		
		var separator = addMenu.firstChild;
		
		// Sort by localized name
		var t = Zotero.ItemTypes.getPrimaryTypes();
		var itemTypes = [];
		for (var i=0; i<t.length; i++) {
			itemTypes.push({
				id: t[i].id,
				name: t[i].name,
				localized: Zotero.ItemTypes.getLocalizedString(t[i].id)
			});
		}
		var collation = Zotero.getLocaleCollation();
		itemTypes.sort(function(a, b) {
			return collation.compareString(1, a.localized, b.localized);
		});
		
		for (var i = 0; i<itemTypes.length; i++) {
			var menuitem = document.createElement("menuitem");
			menuitem.setAttribute("label", itemTypes[i].localized);
			menuitem.setAttribute("oncommand","ZoteroPane_Local.newItem("+itemTypes[i]['id']+")");
			menuitem.setAttribute("tooltiptext", "");
			menuitem.className = "zotero-tb-add";
			addMenu.insertBefore(menuitem, separator);
		}
		
		
		//
		// Create submenu for secondary item types
		//
		
		// Sort by localized name
		var t = Zotero.ItemTypes.getSecondaryTypes();
		var itemTypes = [];
		for (var i=0; i<t.length; i++) {
			itemTypes.push({
				id: t[i].id,
				name: t[i].name,
				localized: Zotero.ItemTypes.getLocalizedString(t[i].id)
			});
		}
		var collation = Zotero.getLocaleCollation();
		itemTypes.sort(function(a, b) {
			return collation.compareString(1, a.localized, b.localized);
		});
		
		for (var i = 0; i<itemTypes.length; i++) {
			var menuitem = document.createElement("menuitem");
			menuitem.setAttribute("label", itemTypes[i].localized);
			menuitem.setAttribute("oncommand","ZoteroPane_Local.newItem("+itemTypes[i]['id']+")");
			menuitem.setAttribute("tooltiptext", "");
			menuitem.className = "zotero-tb-add";
			moreMenu.appendChild(menuitem);
		}
	}
	
	
	/*
	 * Called when the window closes
	 */
	function destroy()
	{
		if (!Zotero || !Zotero.initialized || !_loaded) {
			return;
		}
		
		if(this.isShowing()) {
			this.serializePersist();
		}
		
		var tagSelector = document.getElementById('zotero-tag-selector');
		tagSelector.unregister();
		
		this.collectionsView.unregister();
		if (this.itemsView)
			this.itemsView.unregister();
	}
	
	/**
	 * Called before Zotero pane is to be made visible
	 * @return {Boolean} True if Zotero pane should be loaded, false otherwise (if an error
	 * 		occurred)
	 */
	function makeVisible()
	{
		// If pane not loaded, load it or display an error message
		if (!ZoteroPane_Local.loaded) {
			if (Zotero.locked) {
				var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
										.getService(Components.interfaces.nsIPromptService);
				var msg = Zotero.getString('general.operationInProgress') + '\n\n' + Zotero.getString('general.operationInProgress.waitUntilFinished');
				ps.alert(null, "", msg);
				return false;
			}
			ZoteroPane_Local.init();
		}
		
		// If Zotero could not be initialized, display an error message and return
		if(!Zotero || !Zotero.initialized) {
			this.displayStartupError();
			return false;
		}
		
		this.unserializePersist();
		this.updateToolbarPosition();
		this.updateTagSelectorSize();
		
		// restore saved row selection (for tab switching)
		var containerWindow = (window.ZoteroTab ? window.ZoteroTab.containerWindow : window);
		if(containerWindow.zoteroSavedCollectionSelection) {
			this.collectionsView.rememberSelection(containerWindow.zoteroSavedCollectionSelection);
			delete containerWindow.zoteroSavedCollectionSelection;
		}
		
		// restore saved item selection (for tab switching)
		if(containerWindow.zoteroSavedItemSelection) {
			var me = this;
			// hack to restore saved selection after itemTreeView finishes loading
			window.setTimeout(function() {
				if(containerWindow.zoteroSavedItemSelection) {
					me.itemsView.rememberSelection(containerWindow.zoteroSavedItemSelection);
					delete containerWindow.zoteroSavedItemSelection;
				}
			}, 51);
		}
		
		// Focus the quicksearch on pane open
		setTimeout("document.getElementById('zotero-tb-search').inputField.select();", 1);
		
		// Auto-empty trashed items older than a certain number of days
		var days = Zotero.Prefs.get('trashAutoEmptyDays');
		if (days) {
			var d = new Date();
			var deleted = Zotero.Items.emptyTrash(days);
			var d2 = new Date();
			Zotero.debug("Emptied old items from trash in " + (d2 - d) + " ms");
		}
		
		var d = new Date();
		Zotero.purgeDataObjects();
		var d2 = new Date();
		Zotero.debug("Purged data tables in " + (d2 - d) + " ms");
		
		// Auto-sync on pane open
		if (Zotero.Prefs.get('sync.autoSync')) {
			setTimeout(function () {
				if (!Zotero.Sync.Server.enabled
						|| Zotero.Sync.Server.syncInProgress
						|| Zotero.Sync.Storage.syncInProgress) {
					Zotero.debug('Sync already running -- skipping auto-sync', 4);
					return;
				}
				
				if (Zotero.Sync.Server.manualSyncRequired) {
					Zotero.debug('Manual sync required -- skipping auto-sync', 4);
					return;
				}
				
				Zotero.Sync.Runner.sync(true);
			}, 1000);
		}
		
		// Set sync icon to spinning or not
		//
		// We don't bother setting an error state at open
		if (Zotero.Sync.Server.syncInProgress || Zotero.Sync.Storage.syncInProgress) {
			Zotero.Sync.Runner.setSyncIcon('animate');
		}
		else {
			Zotero.Sync.Runner.setSyncIcon();
		}
		
		return true;
	}
	
	/**
	 * Function to be called before ZoteroPane_Local is hidden. Does not actually hide the Zotero pane.
	 */
	this.makeHidden = function() {
		this.serializePersist();
	}
	
	function isShowing() {
		var zoteroPane = document.getElementById('zotero-pane-stack');
		return zoteroPane.getAttribute('hidden') != 'true' &&
				zoteroPane.getAttribute('collapsed') != 'true';
	}
	
	function isFullScreen() {
		return document.getElementById('zotero-pane-stack').getAttribute('fullscreenmode') == 'true';
	}
	
	
	/*
	 * Trigger actions based on keyboard shortcuts
	 */
	function handleKeyDown(event, from) {
		try {
			// Ignore keystrokes outside of Zotero pane
			if (!(event.originalTarget.ownerDocument instanceof XULDocument)) {
				return;
			}
		}
		catch (e) {
			Zotero.debug(e);
		}
		
		if (Zotero.locked) {
			event.preventDefault();
			return;
		}
		
		if (from == 'zotero-pane') {
			// Highlight collections containing selected items
			//
			// We use Control (17) on Windows because Alt triggers the menubar;
			// 	otherwise we use Alt/Option (18)
			if ((Zotero.isWin && event.keyCode == 17 && !event.altKey) ||
					(!Zotero.isWin && event.keyCode == 18 && !event.ctrlKey)
					&& !event.shiftKey && !event.metaKey) {
				
				this.highlightTimer = Components.classes["@mozilla.org/timer;1"].
					createInstance(Components.interfaces.nsITimer);
				// {} implements nsITimerCallback
				this.highlightTimer.initWithCallback({
					notify: ZoteroPane_Local.setHighlightedRowsCallback
				}, 225, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
			}
			else if ((Zotero.isWin && event.ctrlKey) ||
					(!Zotero.isWin && event.altKey)) {
				if (this.highlightTimer) {
					this.highlightTimer.cancel();
					this.highlightTimer = null;
				}
				ZoteroPane_Local.collectionsView.setHighlightedRows();
			}
			
			return;
		}
		
		// Ignore keystrokes if Zotero pane is closed
		var zoteroPane = document.getElementById('zotero-pane-stack');
		if (zoteroPane.getAttribute('hidden') == 'true' ||
				zoteroPane.getAttribute('collapsed') == 'true') {
			return;
		}
		
		var useShift = Zotero.isMac;
		
		var key = String.fromCharCode(event.which);
		if (!key) {
			Zotero.debug('No key');
			return;
		}
		
		// Ignore modifiers other than Ctrl-Alt or Cmd-Shift
		if (!((Zotero.isMac ? event.metaKey : event.ctrlKey) &&
				(useShift ? event.shiftKey : event.altKey))) {
			return;
		}
		
		var command = Zotero.Keys.getCommand(key);
		if (!command) {
			return;
		}
		
		Zotero.debug(command);
		
		// Errors don't seem to make it out otherwise
		try {
		
		switch (command) {
			case 'openZotero':
				try {
					// Ignore Cmd-Shift-Z keystroke in text areas
					if (Zotero.isMac && key == 'Z' &&
							event.originalTarget.localName == 'textarea') {
						Zotero.debug('Ignoring keystroke in text area');
						return;
					}
				}
				catch (e) {
					Zotero.debug(e);
				}
				if(window.ZoteroOverlay) window.ZoteroOverlay.toggleDisplay()
				break;
			case 'library':
				document.getElementById('zotero-collections-tree').focus();
				ZoteroPane_Local.collectionsView.selection.select(0);
				break;
			case 'quicksearch':
				document.getElementById('zotero-tb-search').select();
				break;
			case 'newItem':
				ZoteroPane_Local.newItem(2); // book
				var menu = document.getElementById('zotero-editpane-item-box').itemTypeMenu;
				menu.focus();
				document.getElementById('zotero-editpane-item-box').itemTypeMenu.menupopup.openPopup(menu, "before_start", 0, 0);
				break;
			case 'newNote':
				// Use key that's not the modifier as the popup toggle
				ZoteroPane_Local.newNote(useShift ? event.altKey : event.shiftKey);
				break;
			case 'toggleTagSelector':
				ZoteroPane_Local.toggleTagSelector();
				break;
			case 'toggleFullscreen':
				ZoteroPane_Local.toggleTab();
				break;
			case 'copySelectedItemCitationsToClipboard':
				ZoteroPane_Local.copySelectedItemsToClipboard(true)
				break;
			case 'copySelectedItemsToClipboard':
				ZoteroPane_Local.copySelectedItemsToClipboard();
				break;
			case 'importFromClipboard':
				Zotero_File_Interface.importFromClipboard();
				break;
			default:
				throw ('Command "' + command + '" not found in ZoteroPane_Local.handleKeyDown()');
		}
		
		}
		catch (e) {
			Zotero.debug(e, 1);
			Components.utils.reportError(e);
		}
		
		event.preventDefault();
	}
	
	
	function handleKeyUp(event, from) {
		if (from == 'zotero-pane') {
			if ((Zotero.isWin && event.keyCode == 17) ||
					(!Zotero.isWin && event.keyCode == 18)) {
				if (this.highlightTimer) {
					this.highlightTimer.cancel();
					this.highlightTimer = null;
				}
				ZoteroPane_Local.collectionsView.setHighlightedRows();
			}
		}
	}
	
	
	/*
	 * Highlights collections containing selected items on Ctrl (Win) or
	 * Option/Alt (Mac/Linux) press
	 */
	function setHighlightedRowsCallback() {
		var itemIDs = ZoteroPane_Local.getSelectedItems(true);
		if (itemIDs && itemIDs.length) {
			var collectionIDs = Zotero.Collections.getCollectionsContainingItems(itemIDs, true);
			if (collectionIDs) {
				ZoteroPane_Local.collectionsView.setHighlightedRows(collectionIDs);
			}
		}
	}
	
	
	function handleKeyPress(event, from) {
		if (from == 'zotero-collections-tree') {
			if ((event.keyCode == event.DOM_VK_BACK_SPACE && Zotero.isMac) ||
					event.keyCode == event.DOM_VK_DELETE) {
				ZoteroPane_Local.deleteSelectedCollection();
				event.preventDefault();
				return;
			}
		}
		else if (from == 'zotero-items-tree') {
			if ((event.keyCode == event.DOM_VK_BACK_SPACE && Zotero.isMac) ||
					event.keyCode == event.DOM_VK_DELETE) {
				// If Cmd/Ctrl delete, use forced mode, which does different
				// things depending on the context
				var force = event.metaKey || (!Zotero.isMac && event.ctrlKey);
				ZoteroPane_Local.deleteSelectedItems(force);
				event.preventDefault();
				return;
			}
		}
	}
	
	
	/*
	 * Create a new item
	 *
	 * _data_ is an optional object with field:value for itemData
	 */
	function newItem(typeID, data, row)
	{
		if (!Zotero.stateCheck()) {
			this.displayErrorMessage(true);
			return false;
		}
		
		// Currently selected row
		if (row === undefined) {
			row = this.collectionsView.selection.currentIndex;
		}
		
		if (!this.canEdit(row)) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		if (row !== undefined) {
			var itemGroup = this.collectionsView._getItemAtRow(row);
			var libraryID = itemGroup.ref.libraryID;
		}
		else {
			var libraryID = null;
			var itemGroup = null;
		}
		
		Zotero.DB.beginTransaction();
		
		var item = new Zotero.Item(typeID);
		item.libraryID = libraryID;
		for (var i in data) {
			item.setField(i, data[i]);
		}
		var itemID = item.save();
		
		if (itemGroup && itemGroup.isCollection()) {
			itemGroup.ref.addItem(itemID);
		}
		
		Zotero.DB.commitTransaction();
		
		//set to Info tab
		document.getElementById('zotero-view-item').selectedIndex = 0;
		
		this.selectItem(itemID);
		
		return Zotero.Items.get(itemID);
	}
	
	
	function newCollection(parent)
	{
		if (!Zotero.stateCheck()) {
			this.displayErrorMessage(true);
			return false;
		}
		
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
								.getService(Components.interfaces.nsIPromptService);
		
		var untitled = Zotero.DB.getNextName('collections', 'collectionName',
			Zotero.getString('pane.collections.untitled'));
		
		var newName = { value: untitled };
		var result = promptService.prompt(window,
			Zotero.getString('pane.collections.newCollection'),
			Zotero.getString('pane.collections.name'), newName, "", {});
		
		if (!result)
		{
			return;
		}
		
		if (!newName.value)
		{
			newName.value = untitled;
		}
		
		var collection = new Zotero.Collection;
		collection.libraryID = this.getSelectedLibraryID();
		collection.name = newName.value;
		collection.parent = parent;
		collection.save();
	}
	
	
	this.newGroup = function () {
		this.loadURI(Zotero.Groups.addGroupURL);
	}
	
/*	this.abszhTest = function() {
		Zotero.Utilities.writeToDiagFile("test button just pressed\r\n");
		Zotero.Schema.updateNoorLibrary();
	}*/
	
	
	function newSearch()
	{
		if (!Zotero.stateCheck()) {
			this.displayErrorMessage(true);
			return false;
		}
		
		var s = new Zotero.Search();
		s.libraryID = this.getSelectedLibraryID();
		s.addCondition('title', 'contains', '');
		
		var untitled = Zotero.getString('pane.collections.untitled');
		untitled = Zotero.DB.getNextName('savedSearches', 'savedSearchName',
			Zotero.getString('pane.collections.untitled'));
		var io = {dataIn: {search: s, name: untitled}, dataOut: null};
		window.openDialog('chrome://zotero/content/searchDialog.xul','','chrome,modal',io);
	}
	
	this.setUnfiled = function (libraryID, show) {
		try {
			var ids = Zotero.Prefs.get('unfiledLibraries').split(',');
		}
		catch (e) {
			var ids = [];
		}
		
		if (!libraryID) {
			libraryID = 0;
		}
		
		var newids = [];
		for each(var id in ids) {
			id = parseInt(id);
			if (isNaN(id)) {
				continue;
			}
			// Remove current library if hiding
			if (id == libraryID && !show) {
				continue;
			}
			// Remove libraryIDs that no longer exist
			if (id != 0 && !Zotero.Libraries.exists(id)) {
				continue;
			}
			newids.push(id);
		}
		
		// Add the current library if it's not already set
		if (show && newids.indexOf(libraryID) == -1) {
			newids.push(libraryID);
		}
		
		newids.sort();
		
		Zotero.Prefs.set('unfiledLibraries', newids.join());
		
		if (show) {
			// 'UNFILED' + '000' + libraryID
			Zotero.Prefs.set('lastViewedFolder', 'S' + '8634533000' + libraryID);
		}
		
		this.collectionsView.refresh();
		
		// Select new row
		var row = this.collectionsView.getLastViewedRow();
		this.collectionsView.selection.select(row);
	}
	
	this.openLookupWindow = function () {
		if (!Zotero.stateCheck()) {
			this.displayErrorMessage(true);
			return false;
		}
		
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		window.openDialog('chrome://zotero/content/lookup.xul', 'zotero-lookup', 'chrome,modal');
	}
	
	
	function openAdvancedSearchWindow() {
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
					.getService(Components.interfaces.nsIWindowMediator);
		var enumerator = wm.getEnumerator('zotero:search');
		while (enumerator.hasMoreElements()) {
			var win = enumerator.getNext();
		}
		
		if (win) {
			win.focus();
			return;
		}
		
		var s = new Zotero.Search();
		s.addCondition('title', 'contains', '');
		var io = {dataIn: {search: s}, dataOut: null};
		window.openDialog('chrome://zotero/content/advancedSearch.xul', '', 'chrome,dialog=no,centerscreen', io);
	}
	
	
	function toggleTagSelector(){
		var tagSelector = document.getElementById('zotero-tag-selector');
		
		var showing = tagSelector.getAttribute('collapsed') == 'true';
		tagSelector.setAttribute('collapsed', !showing);
		this.updateTagSelectorSize();
		
		// If showing, set scope to items in current view
		// and focus filter textbox
		if (showing) {
			_setTagScope();
			tagSelector.focusTextbox();
		}
		// If hiding, clear selection
		else {
			tagSelector.uninit();
		}
	}
	
	
	function updateTagSelectorSize() {
		//Zotero.debug('Updating tag selector size');
		var zoteroPane = document.getElementById('zotero-pane-stack');
		var splitter = document.getElementById('zotero-tags-splitter');
		var tagSelector = document.getElementById('zotero-tag-selector');
		
		// Nothing should be bigger than appcontent's height
		var max = document.getElementById('appcontent').boxObject.height
					- splitter.boxObject.height;
		
		// Shrink tag selector to appcontent's height
		var maxTS = max - COLLECTIONS_HEIGHT;
		if (parseInt(tagSelector.getAttribute("height")) > maxTS) {
			//Zotero.debug("Limiting tag selector height to appcontent");
			tagSelector.setAttribute('height', maxTS);
		}
		
		var height = tagSelector.boxObject.height;
		
		
		/*Zotero.debug("tagSelector.boxObject.height: " + tagSelector.boxObject.height);
		Zotero.debug("tagSelector.getAttribute('height'): " + tagSelector.getAttribute('height'));
		Zotero.debug("zoteroPane.boxObject.height: " + zoteroPane.boxObject.height);
		Zotero.debug("zoteroPane.getAttribute('height'): " + zoteroPane.getAttribute('height'));*/
		
		
		// Don't let the Z-pane jump back down to its previous height
		// (if shrinking or hiding the tag selector let it clear the min-height)
		if (zoteroPane.getAttribute('height') < zoteroPane.boxObject.height) {
			//Zotero.debug("Setting Zotero pane height attribute to " +  zoteroPane.boxObject.height);
			zoteroPane.setAttribute('height', zoteroPane.boxObject.height);
		}
		
		if (tagSelector.getAttribute('collapsed') == 'true') {
			// 32px is the default Z pane min-height in overlay.css
			height = 32;
		}
		else {
			// tS.boxObject.height doesn't exist at startup, so get from attribute
			if (!height) {
				height = parseInt(tagSelector.getAttribute('height'));
			}
			// 121px seems to be enough room for the toolbar and collections
			// tree at minimum height
			height = height + COLLECTIONS_HEIGHT;
		}
		
		//Zotero.debug('Setting Zotero pane minheight to ' + height);
		zoteroPane.setAttribute('minheight', height);
		
		if (this.isShowing() && !this.isFullScreen()) {
			zoteroPane.setAttribute('savedHeight', zoteroPane.boxObject.height);
		}
		
		// Fix bug whereby resizing the Z pane downward after resizing
		// the tag selector up and then down sometimes caused the Z pane to
		// stay at a fixed size and get pushed below the bottom
		tagSelector.height++;
		tagSelector.height--;
	}
	
	
	function getTagSelection(){
		var tagSelector = document.getElementById('zotero-tag-selector');
		return tagSelector.selection ? tagSelector.selection : {};
	}
	
	
	function clearTagSelection() {
		if (!Zotero.Utilities.isEmpty(this.getTagSelection())) {
			var tagSelector = document.getElementById('zotero-tag-selector');
			tagSelector.clearAll();
		}
	}
	
	
	/*
	 * Sets the tag filter on the items view
	 */
	function updateTagFilter(){
		this.itemsView.setFilter('tags', getTagSelection());
	}
	
	
	/*
	 * Set the tags scope to the items in the current view
	 *
	 * Passed to the items tree to trigger on changes
	 */
	function _setTagScope() {
		var itemGroup = self.collectionsView._getItemAtRow(self.collectionsView.selection.currentIndex);
		var tagSelector = document.getElementById('zotero-tag-selector');
		if (!tagSelector.getAttribute('collapsed') ||
				tagSelector.getAttribute('collapsed') == 'false') {
			Zotero.debug('Updating tag selector with current tags');
			if (itemGroup.editable) {
				tagSelector.mode = 'edit';
			}
			else {
				tagSelector.mode = 'view';
			}
			tagSelector.libraryID = itemGroup.ref.libraryID;
			tagSelector.scope = itemGroup.getChildTags();
		}
	}
	
	
	function onCollectionSelected()
	{
		if (this.itemsView)
		{
			this.itemsView.unregister();
			if (this.itemsView.wrappedJSObject.listener) {
				document.getElementById('zotero-items-tree').removeEventListener(
					'keypress', this.itemsView.wrappedJSObject.listener, false
				);
			}
			this.itemsView.wrappedJSObject.listener = null;
			document.getElementById('zotero-items-tree').view = this.itemsView = null;
		}
		
		document.getElementById('zotero-tb-search').value = ""; 
		
		if (this.collectionsView.selection.count != 1) {
			document.getElementById('zotero-items-tree').view = this.itemsView = null;
			return;
		}
		
		// this.collectionsView.selection.currentIndex != -1
		
		var itemgroup = this.collectionsView._getItemAtRow(this.collectionsView.selection.currentIndex);
		
		/*
		if (itemgroup.isSeparator()) {
			document.getElementById('zotero-items-tree').view = this.itemsView = null;
			return;
		}
		*/
		
		itemgroup.setSearch('');
		itemgroup.setTags(getTagSelection());
		itemgroup.showDuplicates = false;
		
		try {
			Zotero.UnresponsiveScriptIndicator.disable();
			this.itemsView = new Zotero.ItemTreeView(itemgroup);
			this.itemsView.addCallback(_setTagScope);
			document.getElementById('zotero-items-tree').view = this.itemsView;
			this.itemsView.selection.clearSelection();
		}
		finally {
			Zotero.UnresponsiveScriptIndicator.enable();
		}
		
		if (itemgroup.isLibrary()) {
			Zotero.Prefs.set('lastViewedFolder', 'L');
		}
		if (itemgroup.isCollection()) {
			Zotero.Prefs.set('lastViewedFolder', 'C' + itemgroup.ref.id);
		}
		else if (itemgroup.isSearch()) {
			Zotero.Prefs.set('lastViewedFolder', 'S' + itemgroup.ref.id);
		}
		else if (itemgroup.isGroup()) {
			Zotero.Prefs.set('lastViewedFolder', 'G' + itemgroup.ref.id);
		}
	}
	
	
	this.showDuplicates = function () {
		if (this.collectionsView.selection.count == 1 && this.collectionsView.selection.currentIndex != -1) {
			var itemGroup = this.collectionsView._getItemAtRow(this.collectionsView.selection.currentIndex);
			itemGroup.showDuplicates = true;
			
			try {
				Zotero.UnresponsiveScriptIndicator.disable();
				this.itemsView.refresh();
			}
			finally {
				Zotero.UnresponsiveScriptIndicator.enable();
			}
		}
	}
	
	this.getItemGroup = function () {
		return this.collectionsView._getItemAtRow(this.collectionsView.selection.currentIndex);
	}
	

	function itemSelected()
	{
		if (!Zotero.stateCheck()) {
			this.displayErrorMessage();
			return;
		}
		
		// Display restore button if items selected in Trash
		if (this.itemsView && this.itemsView.selection.count) {
			document.getElementById('zotero-item-restore-button').hidden
				= !this.itemsView._itemGroup.isTrash()
					|| _nonDeletedItemsSelected(this.itemsView);
		}
		else {
			document.getElementById('zotero-item-restore-button').hidden = true;
		}
		
		var tabs = document.getElementById('zotero-view-tabbox');
		
		// save note when switching from a note
		if(document.getElementById('zotero-item-pane-content').selectedIndex == 2) {
			document.getElementById('zotero-note-editor').save();
		}
		
		// Single item selected
		if (this.itemsView && this.itemsView.selection.count == 1 && this.itemsView.selection.currentIndex != -1)
		{
			var item = this.itemsView._getItemAtRow(this.itemsView.selection.currentIndex);
			
			if(item.ref.isNote()) {
				var noteEditor = document.getElementById('zotero-note-editor');
				noteEditor.mode = this.collectionsView.editable ? 'edit' : 'view';
				
				// If loading new or different note, disable undo while we repopulate the text field
				// so Undo doesn't end up clearing the field. This also ensures that Undo doesn't
				// undo content from another note into the current one.
				if (!noteEditor.item || noteEditor.item.id != item.ref.id) {
					noteEditor.disableUndo();
				}
				noteEditor.parent = null;
				noteEditor.item = item.ref;
				
				noteEditor.enableUndo();
				
				var viewButton = document.getElementById('zotero-view-note-button');
				if (this.collectionsView.editable) {
					viewButton.hidden = false;
					viewButton.setAttribute('noteID', item.ref.id);
					if (item.ref.getSource()) {
						viewButton.setAttribute('sourceID', item.ref.getSource());
					}
					else {
						viewButton.removeAttribute('sourceID');
					}
				}
				else {
					viewButton.hidden = true;
				}
				
				document.getElementById('zotero-item-pane-content').selectedIndex = 2;
			}
			
			else if(item.ref.isAttachment()) {
				var attachmentBox = document.getElementById('zotero-attachment-box');
				attachmentBox.mode = this.collectionsView.editable ? 'edit' : 'view';
				attachmentBox.item = item.ref;
				
				document.getElementById('zotero-item-pane-content').selectedIndex = 3;
			}
			
			// Regular item
			else {
				var isCommons = this.getItemGroup().isBucket();
				
				document.getElementById('zotero-item-pane-content').selectedIndex = 1;
				var tabBox = document.getElementById('zotero-view-tabbox');
				var pane = tabBox.selectedIndex;
				tabBox.firstChild.hidden = isCommons;
				
				var button = document.getElementById('zotero-item-show-original');
				if (isCommons) {
					button.hidden = false;
					button.disabled = !this.getOriginalItem();
				}
				else {
					button.hidden = true;
				}
				
				if (this.collectionsView.editable) {
					ZoteroItemPane.viewItem(item.ref, null, pane);
					tabs.selectedIndex = document.getElementById('zotero-view-item').selectedIndex;
				}
				else {
					ZoteroItemPane.viewItem(item.ref, 'view', pane);
					tabs.selectedIndex = document.getElementById('zotero-view-item').selectedIndex;
				}
			}
		}
		// Zero or multiple items selected
		else {
			document.getElementById('zotero-item-pane-content').selectedIndex = 0;
			
			var label = document.getElementById('zotero-view-selected-label');
			
			if (this.itemsView && this.itemsView.selection.count) {
				label.value = Zotero.getString('pane.item.selected.multiple', this.itemsView.selection.count);
			}
			else {
				label.value = Zotero.getString('pane.item.selected.zero');
			}
		}
	}
	
	
	/**
	 * Check if any selected items in the passed (trash) treeview are not deleted
	 *
	 * @param	{nsITreeView}
	 * @return	{Boolean}
	 */
	function _nonDeletedItemsSelected(itemsView) {
		var start = {};
		var end = {};
		for (var i=0, len=itemsView.selection.getRangeCount(); i<len; i++) {
			itemsView.selection.getRangeAt(i, start, end);
			for (var j=start.value; j<=end.value; j++) {
				if (!itemsView._getItemAtRow(j).ref.deleted) {
					return true;
				}
			}
		}
		return false;
	}
	
	
	this.updateNoteButtonMenu = function () {
		var items = ZoteroPane_Local.getSelectedItems();
		var button = document.getElementById('zotero-tb-add-child-note');
		button.disabled = !this.canEdit() ||
			!(items.length == 1 && (items[0].isRegularItem() || !items[0].isTopLevelItem()));
	}
	
	
	this.updateAttachmentButtonMenu = function (popup) {
		var items = ZoteroPane_Local.getSelectedItems();
		
		var disabled = !this.canEdit() || !(items.length == 1 && items[0].isRegularItem());
		
		if (disabled) {
			for each(var node in popup.childNodes) {
				node.disabled = true;
			}
			return;
		}
		
		var itemgroup = this.collectionsView._getItemAtRow(this.collectionsView.selection.currentIndex);
		var canEditFiles = this.canEditFiles();
		
		var prefix = "menuitem-iconic zotero-menuitem-attachments-";
		
		for (var i=0; i<popup.childNodes.length; i++) {
			var node = popup.childNodes[i];
			
			switch (node.className) {
				case prefix + 'link':
					node.disabled = itemgroup.isWithinGroup();
					break;
				
				case prefix + 'snapshot':
				case prefix + 'file':
					node.disabled = !canEditFiles;
					break;
				
				case prefix + 'web-link':
					node.disabled = false;
					break;
				
				default:
					throw ("Invalid class name '" + node.className + "' in ZoteroPane_Local.updateAttachmentButtonMenu()");
			}
		}
	}
	
	
	this.checkPDFConverter = function () {
		if (Zotero.Fulltext.pdfConverterIsRegistered()) {
			return true;
		}
		
		var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
			.getService(Components.interfaces.nsIPromptService);
		var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
			+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_CANCEL);
		var index = ps.confirmEx(
			null,
			// TODO: localize
			"PDF Tools Not Installed",
			"To use this feature, you must first install the PDF tools in "
				+ "the Zotero preferences.",
			buttonFlags,
			"Open Preferences",
			null, null, null, {}
		);
		if (index == 0) {
			ZoteroPane_Local.openPreferences('zotero-prefpane-search', 'pdftools-install');
		}
		return false;
	}
	
	
	function reindexItem() {
		var items = this.getSelectedItems();
		if (!items) {
			return;
		}
		
		var itemIDs = [];
		var checkPDF = false;
		for (var i=0; i<items.length; i++) {
			// If any PDFs, we need to make sure the converter is installed and
			// prompt for installation if not
			if (!checkPDF && items[i].attachmentMIMEType && items[i].attachmentMIMEType == "application/pdf") {
				checkPDF = true;
			}
			itemIDs.push(items[i].id);
		}
		
		if (checkPDF) {
			var installed = this.checkPDFConverter();
			if (!installed) {
				document.getElementById('zotero-attachment-box').updateItemIndexedState();
				return;
			}
		}
		
		Zotero.Fulltext.indexItems(itemIDs, true);
		document.getElementById('zotero-attachment-box').updateItemIndexedState();
	}
	
	
	function duplicateSelectedItem() {
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var item = this.getSelectedItems()[0];
		
		Zotero.DB.beginTransaction();
		
		// Create new unsaved clone item in target library
		var newItem = new Zotero.Item(item.itemTypeID);
		newItem.libraryID = item.libraryID;
		// DEBUG: save here because clone() doesn't currently work on unsaved tagged items
		var id = newItem.save();
		
		var newItem = Zotero.Items.get(id);
		item.clone(false, newItem);
		newItem.save();
		
		if (this.itemsView._itemGroup.isCollection() && !newItem.getSource()) {
			this.itemsView._itemGroup.ref.addItem(newItem.id);
		}
		
		Zotero.DB.commitTransaction();
		
		this.selectItem(newItem.id);
	}
	
	
	this.deleteSelectedItem = function () {
		Zotero.debug("ZoteroPane_Local.deleteSelectedItem() is deprecated -- use ZoteroPane_Local.deleteSelectedItems()");
		this.deleteSelectedItems();
	}
	
	/*
	 * Remove, trash, or delete item(s), depending on context
	 *
	 * @param	{Boolean}	[force=false]	Trash or delete even if in a collection or search,
	 *										or trash without prompt in library
	 */
	this.deleteSelectedItems = function (force) {
		if (!this.itemsView || !this.itemsView.selection.count) {
			return;
		}
		var itemGroup = this.itemsView._itemGroup;
		
		if (!itemGroup.isTrash() && !itemGroup.isBucket() && !this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var toTrash = {
			title: Zotero.getString('pane.items.trash.title'),
			text: Zotero.getString(
				'pane.items.trash' + (this.itemsView.selection.count > 1 ? '.multiple' : '')
			)
		};
		var toDelete = {
			title: Zotero.getString('pane.items.delete.title'),
			text: Zotero.getString(
				'pane.items.delete' + (this.itemsView.selection.count > 1 ? '.multiple' : '')
			)
		};
		
		if (itemGroup.isLibrary()) {
			// In library, don't prompt if meta key was pressed
			var prompt = force ? false : toTrash;
		}
		else if (itemGroup.isCollection()) {
			// In collection, only prompt if trashing
			var prompt = force ? (itemGroup.isWithinGroup() ? toDelete : toTrash) : false;
		}
		// This should be changed if/when groups get trash
		else if (itemGroup.isGroup()) {
			var prompt = toDelete;
		}
		else if (itemGroup.isSearch()) {
			if (!force) {
				return;
			}
			var prompt = toTrash;
		}
		// Do nothing in share views
		else if (itemGroup.isShare()) {
			return;
		}
		else if (itemGroup.isBucket()) {
			var prompt = toDelete;
		}
		// Do nothing in trash view if any non-deleted items are selected
		else if (itemGroup.isTrash()) {
			var start = {};
			var end = {};
			for (var i=0, len=this.itemsView.selection.getRangeCount(); i<len; i++) {
				this.itemsView.selection.getRangeAt(i, start, end);
				for (var j=start.value; j<=end.value; j++) {
					if (!this.itemsView._getItemAtRow(j).ref.deleted) {
						return;
					}
				}
			}
			var prompt = toDelete;
		}
		//<abszh>
		//I changed prompt to confirmEx in order to have localized OK and Cancel
		//var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
		//								.getService(Components.interfaces.nsIPromptService);
		
		//if (!prompt || promptService.confirm(window, prompt.title, prompt.text)) {
			//this.itemsView.deleteSelection(force);
		//}
		var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
		var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
								+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_IS_STRING);
		if (!prompt || (ps.confirmEx(window,prompt.title, prompt.text,buttonFlags,Zotero.getString('pane.crcis.select.label'),Zotero.getString('pane.crcis.cancel.label'),null,null,{})==0)) {
			this.itemsView.deleteSelection(force);
		}
		//</abszh>
	}
	
	this.deleteSelectedCollection = function () {
		// Remove virtual Unfiled search
		var row = this.collectionsView._getItemAtRow(this.collectionsView.selection.currentIndex);
		if (row.isSearch() && (row.ref.id + "").match(/^8634533000/)) { // 'UNFILED000'
			this.setUnfiled(row.ref.libraryID, false);
			return;
		}
		
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		if (this.collectionsView.selection.count == 1) {
			if (row.isCollection())
			{
				if (confirm(Zotero.getString('pane.collections.delete')))
				{
					this.collectionsView.deleteSelection();
				}
			}
			else if (row.isSearch())
			{
				if (confirm(Zotero.getString('pane.collections.deleteSearch')))
				{
					this.collectionsView.deleteSelection();
				}
			}
		}
	}
	
	
	// Currently used only for Commons to find original linked item
	this.getOriginalItem = function () {
		var item = this.getSelectedItems()[0];
		var itemGroup = this.getItemGroup();
		// TEMP: Commons buckets only
		return itemGroup.ref.getLocalItem(item);
	}
	
	
	this.showOriginalItem = function () {
		var item = this.getOriginalItem();
		if (!item) {
			Zotero.debug("Original item not found");
			return;
		}
		this.selectItem(item.id);
	}
	
	
	this.restoreSelectedItems = function () {
		var items = this.getSelectedItems();
		if (!items) {
			return;
		}
		
		Zotero.DB.beginTransaction();
		for (var i=0; i<items.length; i++) {
			items[i].deleted = false;
			items[i].save();
		}
		Zotero.DB.commitTransaction();
	}
	
	
	this.emptyTrash = function () {
		var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
								.getService(Components.interfaces.nsIPromptService);
		
		var result = ps.confirm(
			null,
			"",
			Zotero.getString('pane.collections.emptyTrash') + "\n\n"
				+ Zotero.getString('general.actionCannotBeUndone')
		);
		if (result) {
			Zotero.Items.emptyTrash();
			Zotero.purgeDataObjects(true);
		}
	}
	
	this.createCommonsBucket = function () {
		var self = this;
		
		Zotero.Commons.getBuckets(function () {
			var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
									.getService(Components.interfaces.nsIPromptService);
			
			var invalid = false;
			
			while (true) {
				if (invalid) {
					// TODO: localize
					ps.alert(null, "", "Invalid title. Please try again.");
					invalid = false;
				}
				
				var newTitle = {};
				var result = prompt.prompt(
					null,
					"",
					// TODO: localize
					"Enter a title for this Zotero Commons collection:",
					newTitle,
					"", {}
				);
				
				if (!result) {
					return;
				}
				
				var title = Zotero.Utilities.trim(newTitle.value);
				
				if (!title) {
					return;
				}
				
				if (!Zotero.Commons.isValidBucketTitle(title)) {
					invalid = true;
					continue;
				}
				
				break;
			}
			
			invalid = false;
			
			var origName = title.toLowerCase();
			origName = origName.replace(/[^a-z0-9 ._-]/g, '');
			origName = origName.replace(/ /g, '-');
			origName = origName.substr(0, 32);
			
			while (true) {
				if (invalid) {
					// TODO: localize
					var msg = "'" + testName + "' is not a valid Zotero Commons collection identifier.\n\n"
						+ "Collection identifiers can contain basic Latin letters, numbers, "
						+ "hyphens, and underscores and must be no longer than 32 characters. "
						+ "Spaces and other characters are not allowed.";
					ps.alert(null, "", msg);
					invalid = false;
				}
				
				var newName = { value: origName };
				var result = ps.prompt(
					null,
					"",
					// TODO: localize
					"Enter an identifier for the collection '" + title + "'.\n\n"
						+ "The identifier will form the collection's URL on archive.org. "
						+ "Identifiers can contain basic Latin letters, numbers, hyphens, and underscores "
						+ "and must be no longer than 32 characters. "
						+ "Spaces and other characters are not allowed.\n\n"
						+ '"' + Zotero.Commons.userNameSlug + '-" '
						+ "will be automatically prepended to your entry.",
					newName,
					"", {}
				);
				
				if (!result) {
					return;
				}
				
				var name = Zotero.Utilities.trim(newName.value);
				
				if (!name) {
					return;
				}
				
				var testName = Zotero.Commons.userNameSlug + '-' + name;
				if (!Zotero.Commons.isValidBucketName(testName)) {
					invalid = true;
					continue;
				}
				
				break;
			}
			
			// TODO: localize
			var progressWin = new Zotero.ProgressWindow();
			progressWin.changeHeadline("Creating Zotero Commons Collection");
			var icon = self.collectionsView.getImageSrc(self.collectionsView.selection.currentIndex);
			progressWin.addLines(title, icon)
			progressWin.show();
			
			Zotero.Commons.createBucket(name, title, function () {
				progressWin.startCloseTimer();
			});
		});
	}
	
	
	this.refreshCommonsBucket = function() {
		if (!this.collectionsView
				|| !this.collectionsView.selection
				|| this.collectionsView.selection.count != 1
				|| this.collectionsView.selection.currentIndex == -1) {
			return false;
		}
		
		var itemGroup = this.collectionsView._getItemAtRow(this.collectionsView.selection.currentIndex);
		if (itemGroup && itemGroup.isBucket()) {
			var self = this;
			itemGroup.ref.refreshItems(function () {
				self.itemsView.refresh();
				self.itemsView.sort();
				
				// On a manual refresh, also check for new OCRed files
				//Zotero.Commons.syncFiles();
			});
		}
	}
	
	function editSelectedCollection()
	{
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		if (this.collectionsView.selection.count > 0) {
			var row = this.collectionsView._getItemAtRow(this.collectionsView.selection.currentIndex);
			
			if (row.isCollection()) {
				var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
										.getService(Components.interfaces.nsIPromptService);
				
				var newName = { value: row.getName() };
				var result = promptService.prompt(window, "",
					Zotero.getString('pane.collections.rename'), newName, "", {});
				
				if (result && newName.value) {
					row.ref.name = newName.value;
					row.ref.save();
				}
			}
			else {
				var s = new Zotero.Search();
				s.id = row.ref.id;
				var io = {dataIn: {search: s, name: row.getName()}, dataOut: null};
				window.openDialog('chrome://zotero/content/searchDialog.xul','','chrome,modal',io);
				if (io.dataOut) {
					this.onCollectionSelected(); //reload itemsView
				}
			}
		}
	}
	
	
	function copySelectedItemsToClipboard(asCitations) {
		var items = this.getSelectedItems();
		if (!items.length) {
			return;
		}
		
		// Make sure at least one item is a regular item
		//
		// DEBUG: We could copy notes via keyboard shortcut if we altered
		// Z_F_I.copyItemsToClipboard() to use Z.QuickCopy.getContentFromItems(),
		// but 1) we'd need to override that function's drag limit and 2) when I
		// tried it the OS X clipboard seemed to be getting text vs. HTML wrong,
		// automatically converting text/html to plaintext rather than using
		// text/unicode. (That may be fixable, however.)
		var canCopy = false;
		for each(var item in items) {
			if (item.isRegularItem()) {
				canCopy = true;
				break;
			}
		}
		if (!canCopy) {
			var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
									.getService(Components.interfaces.nsIPromptService);
			ps.alert(null, "", Zotero.getString("fileInterface.noReferencesError"));
			return;
		}
		
		var url = window.content.location.href;
		var [mode, format] = Zotero.QuickCopy.getFormatFromURL(url).split('=');
		var [mode, contentType] = mode.split('/');
		
		if (mode == 'bibliography') {
			if (asCitations) {
				Zotero_File_Interface.copyCitationToClipboard(items, format, contentType == 'html');
			}
			else {
				Zotero_File_Interface.copyItemsToClipboard(items, format, contentType == 'html');
			}
		}
		else if (mode == 'export') {
			// Copy citations doesn't work in export mode
			if (asCitations) {
				return;
			}
			else {
				Zotero_File_Interface.exportItemsToClipboard(items, format);
			}
		}
	}
	
	
	function clearQuicksearch() {
		var search = document.getElementById('zotero-tb-search');
		if (search.value != '') {
			search.value = '';
			search.doCommand('cmd_zotero_search');
		}
	}
	
	
	function handleSearchKeypress(textbox, event) {
		// Events that turn find-as-you-type on
		if (event.keyCode == event.DOM_VK_ESCAPE) {
			textbox.value = '';
			ZoteroPane_Local.setItemsPaneMessage(Zotero.getString('searchInProgress'));
			setTimeout("ZoteroPane_Local.search(); ZoteroPane_Local.clearItemsPaneMessage();", 1);
		}
		else if (event.keyCode == event.DOM_VK_RETURN || event.keyCode == event.DOM_VK_ENTER) {
			ZoteroPane_Local.setItemsPaneMessage(Zotero.getString('searchInProgress'));
			setTimeout("ZoteroPane_Local.search(true); ZoteroPane_Local.clearItemsPaneMessage();", 1);
		}
	}
	
	
	function handleSearchInput(textbox, event) {
		// This is the new length, except, it seems, when the change is a
		// result of Undo or Redo
		if (!textbox.value.length) {
			ZoteroPane_Local.setItemsPaneMessage(Zotero.getString('searchInProgress'));
			setTimeout("ZoteroPane_Local.search(); ZoteroPane_Local.clearItemsPaneMessage();", 1);
		}
		else if (textbox.value.indexOf('"') != -1) {
			ZoteroPane_Local.setItemsPaneMessage(Zotero.getString('advancedSearchMode'));
		}
	}
	
	
	function search(runAdvanced)
	{
		if (this.itemsView) {
			var search = document.getElementById('zotero-tb-search');
			if (!runAdvanced && search.value.indexOf('"') != -1) {
				return;
			}
			var searchVal = search.value;
			this.itemsView.setFilter('search', searchVal);
		}
	}
	
	
	/*
	 * Select item in current collection or, if not there, in Library
	 *
	 * If _inLibrary_, force switch to Library
	 * If _expand_, open item if it's a container
	 */
	function selectItem(itemID, inLibrary, expand)
	{
		if (!itemID) {
			return false;
		}
		
		var item = Zotero.Items.get(itemID);
		if (!item) {
			return false;
		}
		
		if (!this.itemsView) {
			Components.utils.reportError("Items view not set in ZoteroPane_Local.selectItem()");
			return false;
		}
		
		var currentLibraryID = this.getSelectedLibraryID();
		// If in a different library
		if (item.libraryID != currentLibraryID) {
			Zotero.debug("Library ID differs; switching library");
			this.collectionsView.selectLibrary(item.libraryID);
		}
		// Force switch to library view
		else if (!this.itemsView._itemGroup.isLibrary() && inLibrary) {
			Zotero.debug("Told to select in library; switching to library");
			this.collectionsView.selectLibrary(item.libraryID);
		}
		
		var selected = this.itemsView.selectItem(itemID, expand);
		if (!selected) {
			Zotero.debug("Item was not selected; switching to library");
			this.collectionsView.selectLibrary(item.libraryID);
			this.itemsView.selectItem(itemID, expand);
		}
		
		return true;
	}
	
	
	this.getSelectedLibraryID = function () {
		var group = this.getSelectedGroup();
		if (group) {
			return group.libraryID;
		}
		var collection = this.getSelectedCollection();
		if (collection) {
			return collection.libraryID;
		}
		return null;
	}
	
	
	function getSelectedCollection(asID) {
		if (this.collectionsView) {
			return this.collectionsView.getSelectedCollection(asID);
		}
		return false;
	}
	
	
	function getSelectedSavedSearch(asID)
	{
		if (this.collectionsView.selection.count > 0 && this.collectionsView.selection.currentIndex != -1) {
			var collection = this.collectionsView._getItemAtRow(this.collectionsView.selection.currentIndex);
			if (collection && collection.isSearch()) {
				return asID ? collection.ref.id : collection.ref;
			}
		}
		return false;
	}
	
	
	/*
	 * Return an array of Item objects for selected items
	 *
	 * If asIDs is true, return an array of itemIDs instead
	 */
	function getSelectedItems(asIDs)
	{
		if (!this.itemsView) {
			return [];
		}
		
		return this.itemsView.getSelectedItems(asIDs);
	}
	
	
	this.getSelectedGroup = function (asID) {
		if (this.collectionsView.selection
				&& this.collectionsView.selection.count > 0
				&& this.collectionsView.selection.currentIndex != -1) {
			var itemGroup = this.collectionsView._getItemAtRow(this.collectionsView.selection.currentIndex);
			if (itemGroup && itemGroup.isGroup()) {
				return asID ? itemGroup.ref.id : itemGroup.ref;
			}
		}
		return false;
	}
	
	
	/*
	 * Returns an array of Zotero.Item objects of visible items in current sort order
	 *
	 * If asIDs is true, return an array of itemIDs instead
	 */
	function getSortedItems(asIDs) {
		if (!this.itemsView) {
			return [];
		}
		
		return this.itemsView.getSortedItems(asIDs);
	}
	
	
	function getSortField() {
		if (!this.itemsView) {
			return false;
		}
		
		return this.itemsView.getSortField();
	}
	
	
	function getSortDirection() {
		if (!this.itemsView) {
			return false;
		}
		
		return this.itemsView.getSortDirection();
	}
	
	
	this.buildCollectionContextMenu = function buildCollectionContextMenu()
	{
		var menu = document.getElementById('zotero-collectionmenu');
		var m = {
			newCollection: 0,
			newSavedSearch: 1,
			newSubcollection: 2,
			sep1: 3,
			showUnfiled: 4,
			editSelectedCollection: 5,
			removeCollection: 6,
			sep2: 7,
			exportCollection: 8,
			createBibCollection: 9,
			exportFile: 10,
			loadReport: 11,
			emptyTrash: 12,
			createCommonsBucket: 13,
			refreshCommonsBucket: 14
		};
		
		var itemGroup = this.collectionsView._getItemAtRow(this.collectionsView.selection.currentIndex);
		
		var enable = [], disable = [], show = [];
		
		// Collection
		if (itemGroup.isCollection()) {
			show = [
				m.newSubcollection,
				m.sep1,
				m.editSelectedCollection,
				m.removeCollection,
				m.sep2,
				m.exportCollection,
				m.createBibCollection,
				m.loadReport
			];
			var s = [m.exportCollection, m.createBibCollection, m.loadReport];
			if (this.itemsView.rowCount>0) {
				enable = s;
			}
			else if (!this.collectionsView.isContainerEmpty(this.collectionsView.selection.currentIndex)) {
				enable = [m.exportCollection];
				disable = [m.createBibCollection, m.loadReport];
			}
			else {
				disable = s;
			}
			
			// Adjust labels
			menu.childNodes[m.editSelectedCollection].setAttribute('label', Zotero.getString('pane.collections.menu.rename.collection'));
			menu.childNodes[m.removeCollection].setAttribute('label', Zotero.getString('pane.collections.menu.remove.collection'));
			menu.childNodes[m.exportCollection].setAttribute('label', Zotero.getString('pane.collections.menu.export.collection'));
			menu.childNodes[m.createBibCollection].setAttribute('label', Zotero.getString('pane.collections.menu.createBib.collection'));
			menu.childNodes[m.loadReport].setAttribute('label', Zotero.getString('pane.collections.menu.generateReport.collection'));
		}
		// Saved Search
		else if (itemGroup.isSearch()) {
			// Unfiled items view
			if ((itemGroup.ref.id + "").match(/^8634533000/)) { // 'UNFILED000'
				show = [
					m.removeCollection
				];
				
				menu.childNodes[m.removeCollection].setAttribute('label', Zotero.getString('general.remove'));
			}
			// Normal search view
			else {
				show = [
					m.editSelectedCollection,
					m.removeCollection,
					m.sep2,
					m.exportCollection,
					m.createBibCollection,
					m.loadReport
				];
				
				menu.childNodes[m.removeCollection].setAttribute('label', Zotero.getString('pane.collections.menu.remove.savedSearch'));
			}
			
			var s = [m.exportCollection, m.createBibCollection, m.loadReport];
			if (this.itemsView.rowCount>0) {
				enable = s;
			}
			else {
				disable = s;
			}
			
			// Adjust labels
			menu.childNodes[m.editSelectedCollection].setAttribute('label', Zotero.getString('pane.collections.menu.edit.savedSearch'));
			menu.childNodes[m.exportCollection].setAttribute('label', Zotero.getString('pane.collections.menu.export.savedSearch'));
			menu.childNodes[m.createBibCollection].setAttribute('label', Zotero.getString('pane.collections.menu.createBib.savedSearch'));
			menu.childNodes[m.loadReport].setAttribute('label', Zotero.getString('pane.collections.menu.generateReport.savedSearch'));
		}
		// Trash
		else if (itemGroup.isTrash()) {
			show = [m.emptyTrash];
		}
		else if (itemGroup.isHeader()) {
			if (itemGroup.ref.id == 'commons-header') {
				show = [m.createCommonsBucket];
			}
		}
		else if (itemGroup.isBucket()) {
			show = [m.refreshCommonsBucket];
		}
		// Group
		else if (itemGroup.isGroup()) {
			show = [m.newCollection, m.newSavedSearch, m.sep1, m.showUnfiled];
		}
		// Library
		else
		{
			show = [m.newCollection, m.newSavedSearch, m.sep1, m.showUnfiled, m.sep2, m.exportFile];
		}
		
		// Disable some actions if user doesn't have write access
		var s = [m.editSelectedCollection, m.removeCollection, m.newCollection, m.newSavedSearch, m.newSubcollection];
		if (itemGroup.isWithinGroup() && !itemGroup.editable) {
			disable = disable.concat(s);
		}
		else {
			enable = enable.concat(s);
		}
		
		for (var i in disable)
		{
			menu.childNodes[disable[i]].setAttribute('disabled', true);
		}
		
		for (var i in enable)
		{
			menu.childNodes[enable[i]].setAttribute('disabled', false);
		}
		
		// Hide all items by default
		for each(var pos in m) {
			menu.childNodes[pos].setAttribute('hidden', true);
		}
		
		for (var i in show)
		{
			menu.childNodes[show[i]].setAttribute('hidden', false);
		}
	}
	
	function buildItemContextMenu()
	{
		var m = {
			showInLibrary: 0,
			sep1: 1,
			addNote: 2,
			addAttachments: 3,
			sep2: 4,
			duplicateItem: 5,
			deleteItem: 6,
			deleteFromLibrary: 7,
			sep3: 8,
			exportItems: 9,
			createBib: 10,
			loadReport: 11,
			sep4: 12,
			recognizePDF: 13,
			createParent: 14,
			renameAttachments: 15,
			reindexItem: 16
		};
		
		var menu = document.getElementById('zotero-itemmenu');
		
		// remove old locate menu items
		while(menu.firstChild && menu.firstChild.getAttribute("zotero-locate")) {
			menu.removeChild(menu.firstChild);
		}
		
		var enable = [], disable = [], show = [], hide = [], multiple = '';
		
		if (!this.itemsView) {
			return;
		}
		
		if (this.itemsView.selection.count > 0) {
			var itemGroup = this.itemsView._itemGroup;
			
			enable.push(m.showInLibrary, m.addNote, m.addAttachments,
				m.sep2, m.duplicateItem, m.deleteItem, m.deleteFromLibrary,
				m.exportItems, m.createBib, m.loadReport);
			
			// Multiple items selected
			if (this.itemsView.selection.count > 1) {
				var multiple =  '.multiple';
				hide.push(m.showInLibrary, m.sep1, m.addNote, m.addAttachments,
					m.sep2, m.duplicateItem);
				
				// If all items can be reindexed, or all items can be recognized, show option
				var items = this.getSelectedItems();
				var canIndex = true;
				var canRecognize = true;
				if (!Zotero.Fulltext.pdfConverterIsRegistered()) {
					canIndex = false;
				}
				for (var i=0; i<items.length; i++) {
					if (canIndex && !Zotero.Fulltext.canReindex(items[i].id)) {
						canIndex = false;
					}
					if (canRecognize && !Zotero_RecognizePDF.canRecognize(items[i])) {
						canRecognize = false;
					}
					if (!canIndex && !canRecognize) {
						break;
					}
				}
				if (canIndex) {
					show.push(m.reindexItem);
				}
				else {
					hide.push(m.reindexItem);
				}
				if (canRecognize) {
					show.push(m.recognizePDF);
				}
				else {
					hide.push(m.recognizePDF);
				}
				
				var canCreateParent = true;
				for (var i=0; i<items.length; i++) {
					if (!items[i].isTopLevelItem() || items[i].isRegularItem()) {
						canCreateParent = false;
						break;
					}
				}
				if (canCreateParent) {
					show.push(m.createParent);
				}
				else {
					hide.push(m.createParent);
				}
				
				// If all items are child attachments, show rename option
				var canRename = true;
				for (var i=0; i<items.length; i++) {
					var item = items[i];
					// Same check as in rename function
					if (!item.isAttachment() || !item.getSource() || item.attachmentLinkMode == Zotero.Attachments.LINK_MODE_LINKED_URL) {
						canRename = false;
						break;
					}
				}
				if (canRename) {
					show.push(m.renameAttachments);
				}
				else {
					hide.push(m.renameAttachments);
				}
				
				// Add in attachment separator
				if (canCreateParent || canRecognize || canRename || canIndex) {
					show.push(m.sep4);
				}
				else {
					hide.push(m.sep4);
				}
				
				// Block certain actions on files if no access and at least one item
				// is an imported attachment
				if (!itemGroup.filesEditable) {
					var hasImportedAttachment = false;
					for (var i=0; i<items.length; i++) {
						var item = items[i];
						if (item.isImportedAttachment()) {
							hasImportedAttachment = true;
							break;
						}
					}
					if (hasImportedAttachment) {
						var d = [m.deleteFromLibrary, m.createParent, m.renameAttachments];
						for each(var val in d) {
							disable.push(val);
							var index = enable.indexOf(val);
							if (index != -1) {
								enable.splice(index, 1);
							}
						}
					}
				}
			}
			
			// Single item selected
			else
			{
				var item = this.itemsView._getItemAtRow(this.itemsView.selection.currentIndex).ref;
				var itemID = item.id;
				menu.setAttribute('itemID', itemID);
				
				// Show in Library
				if (!itemGroup.isLibrary() && !itemGroup.isWithinGroup()) {
					show.push(m.showInLibrary, m.sep1);
				}
				else {
					hide.push(m.showInLibrary, m.sep1);
				}
				
				if (item.isRegularItem())
				{
					show.push(m.addNote, m.addAttachments, m.sep2);
				}
				else
				{
					hide.push(m.addNote, m.addAttachments, m.sep2);
				}
				
				if (item.isAttachment()) {
					var showSep4 = false;
					hide.push(m.duplicateItem);
					
					if (Zotero_RecognizePDF.canRecognize(item)) {
						show.push(m.recognizePDF);
						showSep4 = true;
					}
					else {
						hide.push(m.recognizePDF);
					}
						
					// Allow parent item creation for standalone attachments
					if (item.isTopLevelItem()) {
						show.push(m.createParent);
						showSep4 = true;
					}
					else {
						hide.push(m.createParent);
					}
					
					// Attachment rename option
					if (item.getSource() && item.attachmentLinkMode != Zotero.Attachments.LINK_MODE_LINKED_URL) {
						show.push(m.renameAttachments);
						showSep4 = true;
					}
					else {
						hide.push(m.renameAttachments);
					}
					
					if (showSep4) {
						show.push(m.sep4);
					}
					else {
						hide.push(m.sep4);
					}
					
					// If not linked URL, show reindex line
					if (Zotero.Fulltext.pdfConverterIsRegistered()
							&& Zotero.Fulltext.canReindex(item.id)) {
						show.push(m.reindexItem);
						showSep4 = true;
					}
					else {
						hide.push(m.reindexItem);
					}
				}
				else {
					if (item.isNote() && item.isTopLevelItem()) {
						show.push(m.sep4, m.createParent);
					}
					else {
						hide.push(m.sep4, m.createParent);
					}
					
					show.push(m.duplicateItem);
					hide.push(m.recognizePDF, m.renameAttachments, m.reindexItem);
				}
				
				// Update attachment submenu
				var popup = document.getElementById('zotero-add-attachment-popup')
				this.updateAttachmentButtonMenu(popup);
				
				// Block certain actions on files if no access
				if (item.isImportedAttachment() && !itemGroup.filesEditable) {
					var d = [m.deleteFromLibrary, m.createParent, m.renameAttachments];
					for each(var val in d) {
						disable.push(val);
						var index = enable.indexOf(val);
						if (index != -1) {
							enable.splice(index, 1);
						}
					}
				}
			}
		}
		// No items selected
		else
		{
			// Show in Library
			if (!itemGroup.isLibrary()) {
				show.push(m.showInLibrary, m.sep1);
			}
			else {
				hide.push(m.showInLibrary, m.sep1);
			}
			
			disable.push(m.showInLibrary, m.duplicateItem, m.deleteItem,
				m.deleteFromLibrary, m.exportItems, m.createBib, m.loadReport);
			hide.push(m.addNote, m.addAttachments, m.sep2, m.sep4, m.reindexItem,
				m.createParent, m.recognizePDF, m.renameAttachments);
		}
		
		// TODO: implement menu for remote items
		if (!itemGroup.editable) {
			for (var i in m) {
				// Still show export/bib/report for non-editable views
				// (other than Commons buckets, which aren't real items)
				if (!itemGroup.isBucket()) {
					switch (i) {
						case 'exportItems':
						case 'createBib':
						case 'loadReport':
							continue;
					}
				}
				disable.push(m[i]);
				var index = enable.indexOf(m[i]);
				if (index != -1) {
					enable.splice(index, 1);
				}
			}
		}
		
		// Remove from collection
		if (this.itemsView._itemGroup.isCollection() && !(item && item.getSource()))
		{
			menu.childNodes[m.deleteItem].setAttribute('label', Zotero.getString('pane.items.menu.remove' + multiple));
			show.push(m.deleteItem);
		}
		else
		{
			hide.push(m.deleteItem);
		}
		
		// Plural if necessary
		menu.childNodes[m.deleteFromLibrary].setAttribute('label', Zotero.getString('pane.items.menu.erase' + multiple));
		menu.childNodes[m.exportItems].setAttribute('label', Zotero.getString('pane.items.menu.export' + multiple));
		menu.childNodes[m.createBib].setAttribute('label', Zotero.getString('pane.items.menu.createBib' + multiple));
		menu.childNodes[m.loadReport].setAttribute('label', Zotero.getString('pane.items.menu.generateReport' + multiple));
		menu.childNodes[m.createParent].setAttribute('label', Zotero.getString('pane.items.menu.createParent' + multiple));
		menu.childNodes[m.recognizePDF].setAttribute('label', Zotero.getString('pane.items.menu.recognizePDF' + multiple));
		menu.childNodes[m.renameAttachments].setAttribute('label', Zotero.getString('pane.items.menu.renameAttachments' + multiple));
		menu.childNodes[m.reindexItem].setAttribute('label', Zotero.getString('pane.items.menu.reindexItem' + multiple));
		
		for (var i in disable)
		{
			menu.childNodes[disable[i]].setAttribute('disabled', true);
		}
		
		for (var i in enable)
		{
			menu.childNodes[enable[i]].setAttribute('disabled', false);
		}
		
		for (var i in hide)
		{
			menu.childNodes[hide[i]].setAttribute('hidden', true);
		}
		
		for (var i in show)
		{
			menu.childNodes[show[i]].setAttribute('hidden', false);
		}
		
		// add locate menu options
		Zotero_LocateMenu.buildContextMenu(menu);
	}
	
	
	// Adapted from: http://www.xulplanet.com/references/elemref/ref_tree.html#cmnote-9
	this.onTreeClick = function (event) {
		// We only care about primary button double and triple clicks
		if (!event || (event.detail != 2 && event.detail != 3) || event.button != 0) {
			return;
		}
		
		var t = event.originalTarget;
		
		if (t.localName != 'treechildren') {
			return;
		}
		
		var tree = t.parentNode;
		
		var row = {}, col = {}, obj = {};
		tree.treeBoxObject.getCellAt(event.clientX, event.clientY, row, col, obj);
		
		// obj.value == 'cell'/'text'/'image'
		if (!obj.value) {
			return;
		}
		
		if (tree.id == 'zotero-collections-tree') {                                                    
			// Ignore triple clicks for collections
			if (event.detail != 2) {
				return;
			}
			
			var itemGroup = ZoteroPane_Local.collectionsView._getItemAtRow(tree.view.selection.currentIndex);
			if (itemGroup.isLibrary()) {
				var uri = Zotero.URI.getCurrentUserLibraryURI();
				if (uri) {
					ZoteroPane_Local.loadURI(uri);
					event.stopPropagation();
				}
				return;
			}
			
			if (itemGroup.isSearch()) {
				// Don't do anything on double-click of Unfiled Items
				if ((itemGroup.ref.id + "").match(/^8634533000/)) { // 'UNFILED000'
					return;
				}
				ZoteroPane_Local.editSelectedCollection();
				return;
			}
			
			if (itemGroup.isGroup()) {
				var uri = Zotero.URI.getGroupURI(itemGroup.ref, true);
				ZoteroPane_Local.loadURI(uri);
				event.stopPropagation();
				return;
			}
			
			if (itemGroup.isHeader()) {
				if (itemGroup.ref.id == 'group-libraries-header') {
					var uri = Zotero.URI.getGroupsURL();
					ZoteroPane_Local.loadURI(uri);
					event.stopPropagation();
				}
				return;
			}

			if (itemGroup.isBucket()) {
				ZoteroPane_Local.loadURI(itemGroup.ref.uri);
				event.stopPropagation();
			}
		}
		else if (tree.id == 'zotero-items-tree') {
			var viewOnDoubleClick = Zotero.Prefs.get('viewOnDoubleClick');
			
			// Expand/collapse on triple-click
			if (viewOnDoubleClick) {
				if (event.detail == 3) {
					tree.view.toggleOpenState(tree.view.selection.currentIndex);
					return;
				}
				
				// Don't expand/collapse on double-click
				event.stopPropagation();
			}
			
			if (tree.view && tree.view.selection.currentIndex > -1) {
				var item = ZoteroPane_Local.getSelectedItems()[0];
				if (item) {
					if (item.isRegularItem()) {
						// Double-click on Commons item should load IA page
						var itemGroup = ZoteroPane_Local.collectionsView._getItemAtRow(
							ZoteroPane_Local.collectionsView.selection.currentIndex
						);
						
						if (itemGroup.isBucket()) {
							var uri = itemGroup.ref.getItemURI(item);
							ZoteroPane_Local.loadURI(uri);
							event.stopPropagation();
							return;
						}
						
						if (!viewOnDoubleClick) {
							return;
						}
						
						var uri = Components.classes["@mozilla.org/network/standard-url;1"].
								createInstance(Components.interfaces.nsIURI);
						var snapID = item.getBestAttachment();
						if (snapID) {
							spec = Zotero.Items.get(snapID).getLocalFileURL();
							if (spec) {
								uri.spec = spec;
								if (uri.scheme && uri.scheme == 'file') {
									ZoteroPane_Local.viewAttachment(snapID, event);
									return;
								}
							}
						}
						
						var uri = item.getField('url');
						if (!uri) {
							var doi = item.getField('DOI');
							if (doi) {
								// Pull out DOI, in case there's a prefix
								doi = Zotero.Utilities.cleanDOI(doi);
								if (doi) {
									uri = "http://dx.doi.org/" + encodeURIComponent(doi);
								}
							}
						}
						if (uri) {
							ZoteroPane_Local.loadURI(uri);
						}
					}
					else if (item.isNote()) {
						if (!ZoteroPane_Local.collectionsView.editable) {
							return;
						}
						document.getElementById('zotero-view-note-button').doCommand();
					}
					else if (item.isAttachment()) {
						ZoteroPane_Local.viewSelectedAttachment(event);
					}
				}
			}
		}
	}
	
	
	this.openPreferences = function (paneID, action) {
		var io = {
			pane: paneID,
			action: action
		};
		window.openDialog('chrome://zotero/content/preferences/preferences.xul',
			'zotero-prefs',
			'chrome,titlebar,toolbar,centerscreen,'
				+ Zotero.Prefs.get('browser.preferences.instantApply', true) ? 'dialog=no' : 'modal',
			io
		);
	}
	
	
	/*
	 * Loads a URL following the standard modifier key behavior
	 *  (e.g. meta-click == new background tab, meta-shift-click == new front tab,
	 *  shift-click == new window, no modifier == frontmost tab
	 */
	function loadURI(uris, event, data) {
		if(typeof uris === "string") {
			uris = [uris];
		}
		
		for each(var uri in uris) {
			// Ignore javascript: and data: URIs
			if (uri.match(/^(javascript|data):/)) {
				return;
			}
			
			if (Zotero.isStandalone && uri.match(/^https?/)) {
				var io = Components.classes['@mozilla.org/network/io-service;1']
							.getService(Components.interfaces.nsIIOService);
				var uri = io.newURI(uri, null, null);
				var handler = Components.classes['@mozilla.org/uriloader/external-protocol-service;1']
							.getService(Components.interfaces.nsIExternalProtocolService)
							.getProtocolHandlerInfo('http');
				handler.preferredAction = Components.interfaces.nsIHandlerInfo.useSystemDefault;
				handler.launchWithURI(uri, null);
				return;
			}
			
			// Open in new tab
			var openInNewTab = event && (event.metaKey || (!Zotero.isMac && event.ctrlKey));
			if (event && event.shiftKey && !openInNewTab) {
				window.open(uri, "zotero-loaded-page",
					"menubar=yes,location=yes,toolbar=yes,personalbar=yes,resizable=yes,scrollbars=yes,status=yes");
			}
			else if (openInNewTab || !window.loadURI || uris.length > 1) {
				// if no gBrowser, find it
				if(!gBrowser) {
					var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
									   .getService(Components.interfaces.nsIWindowMediator);
					var browserWindow = wm.getMostRecentWindow("navigator:browser");
					var gBrowser = browserWindow.gBrowser;
				}
				
				// load in a new tab
				var tab = gBrowser.addTab(uri);
				var browser = gBrowser.getBrowserForTab(tab);
				
				if (event && event.shiftKey || !openInNewTab) {
					// if shift key is down, or we are opening in a new tab because there is no loadURI,
					// select new tab
					gBrowser.selectedTab = tab;
				}
			}
			else {
				window.loadURI(uri);
			}
		}
	}
	
	
	function setItemsPaneMessage(msg, lock) {
		var elem = document.getElementById('zotero-items-pane-message-box');
		
		if (elem.getAttribute('locked') == 'true') {
			return;
		}
		
		while (elem.hasChildNodes()) {
			elem.removeChild(elem.firstChild);
		}
		var msgParts = msg.split("\n\n");
		for (var i=0; i<msgParts.length; i++) {
			var desc = document.createElement('description');
			desc.appendChild(document.createTextNode(msgParts[i]));
			elem.appendChild(desc);
		}
		
		// Make message permanent
		if (lock) {
			elem.setAttribute('locked', true);
		}
		
		document.getElementById('zotero-items-pane-content').selectedIndex = 1;
	}
	
	
	function clearItemsPaneMessage() {
		// If message box is locked, don't clear
		var box = document.getElementById('zotero-items-pane-message-box');
		if (box.getAttribute('locked') == 'true') {
			return;
		}
		
		document.getElementById('zotero-items-pane-content').selectedIndex = 0;
	}
	
	
	// Updates browser context menu options
	function contextPopupShowing()
	{
		if (!Zotero.Prefs.get('browserContentContextMenu')) {
			return;
		}
		
		var menuitem = document.getElementById("zotero-context-add-to-current-note");
		var showing = false;
		if (menuitem){
			var items = ZoteroPane_Local.getSelectedItems();
			if (ZoteroPane_Local.itemsView.selection && ZoteroPane_Local.itemsView.selection.count==1
				&& items[0] && items[0].isNote()
				&& window.gContextMenu.isTextSelected)
			{
				menuitem.hidden = false;
				showing = true;
			}
			else
			{
				menuitem.hidden = true;
			}
		}
		
		var menuitem = document.getElementById("zotero-context-add-to-new-note");
		if (menuitem){
			if (window.gContextMenu.isTextSelected)
			{
				menuitem.hidden = false;
				showing = true;
			}
			else
			{
				menuitem.hidden = true;
			}
		}
		
		var menuitem = document.getElementById("zotero-context-save-link-as-item");
		if (menuitem) {
			if (window.gContextMenu.onLink) {
				menuitem.hidden = false;
				showing = true;
			}
			else {
				menuitem.hidden = true;
			}
		}
		
		var menuitem = document.getElementById("zotero-context-save-image-as-item");
		if (menuitem) {
			// Not using window.gContextMenu.hasBGImage -- if the user wants it,
			// they can use the Firefox option to view and then import from there
			if (window.gContextMenu.onImage) {
				menuitem.hidden = false;
				showing = true;
			}
			else {
				menuitem.hidden = true;
			}
		}
		
		// If Zotero is locked or library is read-only, disable menu items
		var menu = document.getElementById('zotero-content-area-context-menu');
		menu.hidden = !showing;
		var disabled = Zotero.locked;
		if (!disabled && self.collectionsView.selection && self.collectionsView.selection.count) {
			var itemGroup = self.collectionsView._getItemAtRow(self.collectionsView.selection.currentIndex);
			disabled = !itemGroup.editable;
		}
		for each(var menuitem in menu.firstChild.childNodes) {
			menuitem.disabled = disabled;
		}
	}
	
	
	this.newNote = function (popup, parent, text, citeURI) {
		if (!Zotero.stateCheck()) {
			this.displayErrorMessage(true);
			return;
		}
		
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		if (!popup) {
			if (!text) {
				text = '';
			}
			text = Zotero.Utilities.trim(text);
			
			if (text) {
				text = '<blockquote'
						+ (citeURI ? ' cite="' + citeURI + '"' : '')
						+ '>' + Zotero.Utilities.text2html(text) + "</blockquote>";
			}
			
			var item = new Zotero.Item('note');
			item.libraryID = this.getSelectedLibraryID();
			item.setNote(text);
			if (parent) {
				item.setSource(parent);
			}
			var itemID = item.save();
			
			if (!parent && this.itemsView && this.itemsView._itemGroup.isCollection()) {
				this.itemsView._itemGroup.ref.addItem(itemID);
			}
			
			this.selectItem(itemID);
			
			document.getElementById('zotero-note-editor').focus();
		}
		else
		{
			// TODO: _text_
			var c = this.getSelectedCollection();
			if (c) {
				this.openNoteWindow(null, c.id, parent);
			}
			else {
				this.openNoteWindow(null, null, parent);
			}
		}
	}
	
	
	function addTextToNote(text, citeURI)
	{
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		if (!text) {
			return false;
		}
		
		text = Zotero.Utilities.trim(text);
		
		if (!text.length) {
			return false;
		}
		
		text = '<blockquote'
					+ (citeURI ? ' cite="' + citeURI + '"' : '')
					+ '>' + Zotero.Utilities.text2html(text) + "</blockquote>";
		
		var items = this.getSelectedItems();
		if (this.itemsView.selection.count == 1 && items[0] && items[0].isNote()) {
			var note = items[0].getNote()
			
			items[0].setNote(note + text);
			items[0].save();
			
			var noteElem = document.getElementById('zotero-note-editor')
			noteElem.focus();
			return true;
		}
		
		return false;
	}
	
	function openNoteWindow(itemID, col, parentItemID)
	{
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var name = null;
		
		if (itemID) {
			// Create a name for this window so we can focus it later
			//
			// Collection is only used on new notes, so we don't need to
			// include it in the name
			name = 'zotero-note-' + itemID;
			
			var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
					.getService(Components.interfaces.nsIWindowMediator);
			var e = wm.getEnumerator('');
			while (e.hasMoreElements()) {
				var w = e.getNext();
				if (w.name == name) {
					w.focus();
					return;
				}
			}
		}
		
		window.open('chrome://zotero/content/note.xul?v=1'
			+ (itemID ? '&id=' + itemID : '') + (col ? '&coll=' + col : '')
			+ (parentItemID ? '&p=' + parentItemID : ''),
			name, 'chrome,resizable,centerscreen');
	}
	
	
	function addAttachmentFromDialog(link, id)
	{
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var itemGroup = ZoteroPane_Local.collectionsView._getItemAtRow(this.collectionsView.selection.currentIndex);
		if (link && itemGroup.isWithinGroup()) {
			var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
									.getService(Components.interfaces.nsIPromptService);
			ps.alert(null, "", "Linked files cannot be added to group libraries.");
			return;
		}
		
		// TODO: disable in menu
		if (!this.canEditFiles()) {
			this.displayCannotEditLibraryFilesMessage();
			return;
		}
		
		var libraryID = itemGroup.ref.libraryID;
		
		var nsIFilePicker = Components.interfaces.nsIFilePicker;
		var fp = Components.classes["@mozilla.org/filepicker;1"]
        					.createInstance(nsIFilePicker);
		fp.init(window, Zotero.getString('pane.item.attachments.select'), nsIFilePicker.modeOpenMultiple);
		fp.appendFilters(Components.interfaces.nsIFilePicker.filterAll);
		
		if(fp.show() == nsIFilePicker.returnOK)
		{
			var files = fp.files;
			while (files.hasMoreElements()){
				var file = files.getNext();
				file.QueryInterface(Components.interfaces.nsILocalFile);
				var attachmentID;
				if(link)
					attachmentID = Zotero.Attachments.linkFromFile(file, id);
				else
					attachmentID = Zotero.Attachments.importFromFile(file, id, libraryID);
			
				if(attachmentID && !id)
				{
					var c = this.getSelectedCollection();
					if(c)
						c.addItem(attachmentID);
				}
			}
		}
	}
	
	
	this.addItemFromPage = function (itemType, saveSnapshot, row) {
		if (!this.canEdit(row)) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		return this.addItemFromDocument(window.content.document, itemType, saveSnapshot, row);
	}
	
	
	/**
	 * @param	{Document}			doc
	 * @param	{String|Integer}	[itemType='webpage']	Item type id or name
	 * @param	{Boolean}			[saveSnapshot]			Force saving or non-saving of a snapshot,
	 *														regardless of automaticSnapshots pref
	 */
	this.addItemFromDocument = function (doc, itemType, saveSnapshot, row) {
		var progressWin = new Zotero.ProgressWindow();
		progressWin.changeHeadline(Zotero.getString('ingester.scraping'));
		var icon = 'chrome://zotero/skin/treeitem-webpage.png';
		progressWin.addLines(doc.title, icon)
		progressWin.show();
		progressWin.startCloseTimer();
		
		// Save snapshot if explicitly enabled or automatically pref is set and not explicitly disabled
		saveSnapshot = saveSnapshot || (saveSnapshot !== false && Zotero.Prefs.get('automaticSnapshots'));
		
		// TODO: this, needless to say, is a temporary hack
		if (itemType == 'temporaryPDFHack') {
			itemType = null;
			var isPDF = false;
			if (doc.title.indexOf('application/pdf') != -1) {
				isPDF = true;
			}
			else {
				var ios = Components.classes["@mozilla.org/network/io-service;1"].
							getService(Components.interfaces.nsIIOService);
				try {
					var uri = ios.newURI(doc.location, null, null);
					if (uri.fileName && uri.fileName.match(/pdf$/)) {
						isPDF = true;
					}
				}
				catch (e) {
					Zotero.debug(e);
					Components.utils.reportError(e);
				}
			}
			
			if (isPDF && saveSnapshot) {
				//
				// Duplicate newItem() checks here
				//
				if (!Zotero.stateCheck()) {
					this.displayErrorMessage(true);
					return false;
				}
				
				// Currently selected row
				if (row === undefined) {
					row = this.collectionsView.selection.currentIndex;
				}
				
				if (!this.canEdit(row)) {
					this.displayCannotEditLibraryMessage();
					return;
				}
				
				if (row !== undefined) {
					var itemGroup = this.collectionsView._getItemAtRow(row);
					var libraryID = itemGroup.ref.libraryID;
				}
				else {
					var libraryID = null;
					var itemGroup = null;
				}
				//
				//
				//
				
				if (!this.canEditFiles(row)) {
					this.displayCannotEditLibraryFilesMessage();
					return;
				}
				
				if (itemGroup && itemGroup.isCollection()) {
					var collectionID = itemGroup.ref.id;
				}
				else {
					var collectionID = false;
				}
				
				var itemID = Zotero.Attachments.importFromDocument(doc, false, false, collectionID, null, libraryID);
				
				// importFromDocument() doesn't trigger the notifier for a second
				//
				// The one-second delay is weird but better than nothing
				var self = this;
				setTimeout(function () {
					self.selectItem(itemID);
				}, 1001);
				
				return;
			}
		}
		
		// Save web page item by default
		if (!itemType) {
			itemType = 'webpage';
		}
		var data = {
			title: doc.title,
			url: doc.location.href,
			accessDate: "CURRENT_TIMESTAMP"
		}
		itemType = Zotero.ItemTypes.getID(itemType);
		var item = this.newItem(itemType, data, row);
		
		if (item.libraryID) {
			var group = Zotero.Groups.getByLibraryID(item.libraryID);
			filesEditable = group.filesEditable;
		}
		else {
			filesEditable = true;
		}
		
		if (saveSnapshot) {
			var link = false;
			
			if (link) {
				Zotero.Attachments.linkFromDocument(doc, item.id);
			}
			else if (filesEditable) {
				Zotero.Attachments.importFromDocument(doc, item.id);
			}
		}
		
		return item.id;
	}
	
	
	this.addItemFromURL = function (url, itemType, saveSnapshot, row) {
		if (url == window.content.document.location.href) {
			return this.addItemFromPage(itemType, saveSnapshot, row);
		}
		
		var self = this;
		
		Zotero.MIME.getMIMETypeFromURL(url, function (mimeType, hasNativeHandler) {
			// If native type, save using a hidden browser
			if (hasNativeHandler) {
				var processor = function (doc) {
					ZoteroPane_Local.addItemFromDocument(doc, itemType, saveSnapshot, row);
				};
				
				var done = function () {}
				
				var exception = function (e) {
					Zotero.debug(e);
				}
				
				Zotero.HTTP.processDocuments([url], processor, done, exception);
			}
			// Otherwise create placeholder item, attach attachment, and update from that
			else {
				// TODO: this, needless to say, is a temporary hack
				if (itemType == 'temporaryPDFHack') {
					itemType = null;
					
					if (mimeType == 'application/pdf') {
						//
						// Duplicate newItem() checks here
						//
						if (!Zotero.stateCheck()) {
							ZoteroPane_Local.displayErrorMessage(true);
							return false;
						}
						
						// Currently selected row
						if (row === undefined) {
							row = ZoteroPane_Local.collectionsView.selection.currentIndex;
						}
						
						if (!ZoteroPane_Local.canEdit(row)) {
							ZoteroPane_Local.displayCannotEditLibraryMessage();
							return;
						}
						
						if (row !== undefined) {
							var itemGroup = ZoteroPane_Local.collectionsView._getItemAtRow(row);
							var libraryID = itemGroup.ref.libraryID;
						}
						else {
							var libraryID = null;
							var itemGroup = null;
						}
						//
						//
						//
						
						if (!ZoteroPane_Local.canEditFiles(row)) {
							ZoteroPane_Local.displayCannotEditLibraryFilesMessage();
							return;
						}
						
						if (itemGroup && itemGroup.isCollection()) {
							var collectionID = itemGroup.ref.id;
						}
						else {
							var collectionID = false;
						}
						
						var attachmentItem = Zotero.Attachments.importFromURL(url, false, false, false, collectionID, mimeType, libraryID);
						
						// importFromURL() doesn't trigger the notifier until
						// after download is complete
						//
						// TODO: add a callback to importFromURL()
						setTimeout(function () {
							self.selectItem(attachmentItem.id);
						}, 1001);
						
						return;
					}
				}
				
				if (!itemType) {
					itemType = 'webpage';
				}
				
				var item = ZoteroPane_Local.newItem(itemType, {}, row);
				
				if (item.libraryID) {
					var group = Zotero.Groups.getByLibraryID(item.libraryID);
					filesEditable = group.filesEditable;
				}
				else {
					filesEditable = true;
				}
				
				// Save snapshot if explicitly enabled or automatically pref is set and not explicitly disabled
				if (saveSnapshot || (saveSnapshot !== false && Zotero.Prefs.get('automaticSnapshots'))) {
					var link = false;
					
					if (link) {
						//Zotero.Attachments.linkFromURL(doc, item.id);
					}
					else if (filesEditable) {
						var attachmentItem = Zotero.Attachments.importFromURL(url, item.id, false, false, false, mimeType);
						if (attachmentItem) {
							item.setField('title', attachmentItem.getField('title'));
							item.setField('url', attachmentItem.getField('url'));
							item.setField('accessDate', attachmentItem.getField('accessDate'));
							item.save();
						}
					}
				}
				
				return item.id;

			}
		});
	}
	
	
	/*
	 * Create an attachment from the current page
	 *
	 * |itemID|    -- itemID of parent item
	 * |link|      -- create web link instead of snapshot
	 */
	this.addAttachmentFromPage = function (link, itemID)
	{
		if (!Zotero.stateCheck()) {
			this.displayErrorMessage(true);
			return;
		}
		
		if (typeof itemID != 'number') {
			throw ("itemID must be an integer in ZoteroPane_Local.addAttachmentFromPage()");
		}
		
		var progressWin = new Zotero.ProgressWindow();
		progressWin.changeHeadline(Zotero.getString('save.' + (link ? 'link' : 'attachment')));
		var type = link ? 'web-link' : 'snapshot';
		var icon = 'chrome://zotero/skin/treeitem-attachment-' + type + '.png';
		progressWin.addLines(window.content.document.title, icon)
		progressWin.show();
		progressWin.startCloseTimer();
		
		if (link) {
			Zotero.Attachments.linkFromDocument(window.content.document, itemID);
		}
		else {
			Zotero.Attachments.importFromDocument(window.content.document, itemID);
		}
	}
	
	
	function viewAttachment(itemID, event, noLocateOnMissing, forceExternalViewer) {
		var attachment = Zotero.Items.get(itemID);
		if (!attachment.isAttachment()) {
			throw ("Item " + itemID + " is not an attachment in ZoteroPane_Local.viewAttachment()");
		}
		
		if (attachment.attachmentLinkMode == Zotero.Attachments.LINK_MODE_LINKED_URL) {
			this.loadURI(attachment.getField('url'), event);
			return;
		}
		
		var file = attachment.getFile();
		if (file) {
			if(forceExternalViewer !== undefined) {
				var externalViewer = forceExternalViewer;
			} else {
				var mimeType = attachment.attachmentMIMEType;
				// If no MIME type specified, try to detect again (I guess in case
				// we've gotten smarter since the file was imported?)
				if (!mimeType) {
					mimeType = Zotero.MIME.getMIMETypeFromFile(file);
					
					// TODO: update DB with new info
				}
				
				var ext = Zotero.File.getExtension(file);
				var externalViewer = Zotero.isStandalone || (!Zotero.MIME.hasNativeHandler(mimeType, ext) &&
					(!Zotero.MIME.hasInternalHandler(mimeType, ext) || Zotero.Prefs.get('launchNonNativeFiles')));
			}
			if (!externalViewer) {
				var url = 'zotero://attachment/' + itemID + '/';
				this.loadURI(url, event, { attachmentID: itemID});
			}
			else {
				// Some platforms don't have nsILocalFile.launch, so we just load it and
				// let the Firefox external helper app window handle it
				try {
					file.launch();
				}
				catch (e) {
					Zotero.debug("launch() not supported -- passing file to loadURI()");
					var fileURL = attachment.getLocalFileURL();
					window.loadURI(fileURL);
				}
			}
		}
		else {
			this.showAttachmentNotFoundDialog(itemID, noLocateOnMissing);
		}
	}
	
	
	function viewSelectedAttachment(event, noLocateOnMissing)
	{
		if (this.itemsView && this.itemsView.selection.count == 1) {
			this.viewAttachment(this.getSelectedItems(true)[0], event, noLocateOnMissing);
		}
	}
	
	
	this.showAttachmentInFilesystem = function (itemID, noLocateOnMissing) {
		var attachment = Zotero.Items.get(itemID)
		if (attachment.attachmentLinkMode != Zotero.Attachments.LINK_MODE_LINKED_URL) {
			var file = attachment.getFile();
			if (file){
				try {
					file.reveal();
				}
				catch (e) {
					// On platforms that don't support nsILocalFile.reveal() (e.g. Linux),
					// "double-click" the parent directory
					try {
						var parent = file.parent.QueryInterface(Components.interfaces.nsILocalFile);
						parent.launch();
					}
					// If launch also fails, try the OS handler
					catch (e) {
						var uri = Components.classes["@mozilla.org/network/io-service;1"].
									getService(Components.interfaces.nsIIOService).
									newFileURI(parent);
						var protocolService =
							Components.classes["@mozilla.org/uriloader/external-protocol-service;1"].
								getService(Components.interfaces.nsIExternalProtocolService);
						protocolService.loadUrl(uri);
					}
				}
			}
			else {
				this.showAttachmentNotFoundDialog(attachment.id, noLocateOnMissing)
			}
		}
	}
	
	
	/**
	 * Test if the user can edit the currently selected library/collection,
	 * and display an error if not
	 *
	 * @param	{Integer}	[row]
	 *
	 * @return	{Boolean}		TRUE if user can edit, FALSE if not
	 */
	this.canEdit = function (row) {
		// Currently selected row
		if (row === undefined) {
			row = this.collectionsView.selection.currentIndex;
		}
		
		var itemGroup = this.collectionsView._getItemAtRow(row);
		return itemGroup.editable;
	}
	
	
	/**
	 * Test if the user can edit the currently selected library/collection,
	 * and display an error if not
	 *
	 * @param	{Integer}	[row]
	 *
	 * @return	{Boolean}		TRUE if user can edit, FALSE if not
	 */
	this.canEditFiles = function (row) {
		// Currently selected row
		if (row === undefined) {
			row = this.collectionsView.selection.currentIndex;
		}
		
		var itemGroup = this.collectionsView._getItemAtRow(row);
		return itemGroup.filesEditable;
	}
	
	
	this.displayCannotEditLibraryMessage = function () {
		var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
								.getService(Components.interfaces.nsIPromptService);
		ps.alert(null, "", "You cannot make changes to the currently selected library.");
	}
	
	
	this.displayCannotEditLibraryFilesMessage = function () {
		var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
								.getService(Components.interfaces.nsIPromptService);
		ps.alert(null, "", "You cannot add files to the currently selected library.");
	}
	
	
	function showAttachmentNotFoundDialog(itemID, noLocate) {
		var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].
				createInstance(Components.interfaces.nsIPromptService);
		
		
		// Don't show Locate button
		if (noLocate) {
			var index = ps.alert(null,
				Zotero.getString('pane.item.attachments.fileNotFound.title'),
				Zotero.getString('pane.item.attachments.fileNotFound.text')
			);
			return;
		}
		
		var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
			+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_CANCEL);
		var index = ps.confirmEx(null,
			Zotero.getString('pane.item.attachments.fileNotFound.title'),
			Zotero.getString('pane.item.attachments.fileNotFound.text'),
			buttonFlags, Zotero.getString('general.locate'), null,
			null, null, {});
		
		if (index == 0) {
			this.relinkAttachment(itemID);
		}
	}
	
	
	this.createParentItemsFromSelected = function () {
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		
		var items = this.getSelectedItems();
		for (var i=0; i<items.length; i++) {
			var item = items[i];
			if (!item.isTopLevelItem() || item.isRegularItem()) {
				throw('Item ' + itemID + ' is not a top-level attachment or note in ZoteroPane_Local.createParentItemsFromSelected()');
			}
			
			Zotero.DB.beginTransaction();
			// TODO: remove once there are no top-level web attachments
			if (item.isWebAttachment()) {
				var parent = new Zotero.Item('webpage');
			}
			else {
				var parent = new Zotero.Item('document');
			}
			parent.libraryID = item.libraryID;
			parent.setField('title', item.getField('title'));
			if (item.isWebAttachment()) {
				parent.setField('accessDate', item.getField('accessDate'));
				parent.setField('url', item.getField('url'));
			}
			var itemID = parent.save();
			item.setSource(itemID);
			item.save();
			Zotero.DB.commitTransaction();
		}
	}
	
	
	this.renameSelectedAttachmentsFromParents = function () {
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var items = this.getSelectedItems();
		
		for (var i=0; i<items.length; i++) {
			var item = items[i];
			
			if (!item.isAttachment() || !item.getSource() || item.attachmentLinkMode == Zotero.Attachments.LINK_MODE_LINKED_URL) {
				throw('Item ' + itemID + ' is not a child file attachment in ZoteroPane_Local.renameAttachmentFromParent()');
			}
			
			var file = item.getFile();
			if (!file) {
				continue;
			}
			
			var parentItemID = item.getSource();
			var newName = Zotero.Attachments.getFileBaseNameFromItem(parentItemID);
			
			var ext = file.leafName.match(/[^\.]+$/);
			if (ext) {
				newName = newName + '.' + ext;
			}
			
			var renamed = item.renameAttachmentFile(newName);
			if (renamed !== true) {
				Zotero.debug("Could not rename file (" + renamed + ")");
				continue;
			}
			
			item.setField('title', newName);
			item.save();
		}
		
		return true;
	}
	
	
	function relinkAttachment(itemID) {
		if (!this.canEdit()) {
			this.displayCannotEditLibraryMessage();
			return;
		}
		
		var item = Zotero.Items.get(itemID);
		if (!item) {
			throw('Item ' + itemID + ' not found in ZoteroPane_Local.relinkAttachment()');
		}
		
		var nsIFilePicker = Components.interfaces.nsIFilePicker;
		var fp = Components.classes["@mozilla.org/filepicker;1"]
					.createInstance(nsIFilePicker);
		fp.init(window, Zotero.getString('pane.item.attachments.select'), nsIFilePicker.modeOpen);
		
		
		var file = item.getFile(false, true);
		var dir = Zotero.File.getClosestDirectory(file);
		if (dir) {
			dir.QueryInterface(Components.interfaces.nsILocalFile);
			fp.displayDirectory = dir;
		}
		
		fp.appendFilters(Components.interfaces.nsIFilePicker.filterAll);
		
		if (fp.show() == nsIFilePicker.returnOK) {
			var file = fp.file;
			file.QueryInterface(Components.interfaces.nsILocalFile);
			item.relinkAttachmentFile(file);
		}
	}
	
	
	function reportErrors() {
		var errors = Zotero.getErrors(true);
		var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
				   .getService(Components.interfaces.nsIWindowWatcher);
		var data = {
			msg: Zotero.getString('errorReport.followingErrors', Zotero.appName),
			e: errors.join('\n\n'),
			askForSteps: true
		};
		var io = { wrappedJSObject: { Zotero: Zotero, data:  data } };
		var win = ww.openWindow(null, "chrome://zotero/content/errorReport.xul",
					"zotero-error-report", "chrome,centerscreen,modal", io);
	}
	
	/*
	 * Display an error message saying that an error has occurred and Firefox
	 * needs to be restarted.
	 *
	 * If |popup| is TRUE, display in popup progress window; otherwise, display
	 * as items pane message
	 */
	function displayErrorMessage(popup) {
		var reportErrorsStr = Zotero.getString('errorReport.reportErrors');
		var reportInstructions =
			Zotero.getString('errorReport.reportInstructions', reportErrorsStr)
		
		// Display as popup progress window
		if (popup) {
			var pw = new Zotero.ProgressWindow();
			pw.changeHeadline(Zotero.getString('general.errorHasOccurred'));
			var msg = Zotero.getString('general.restartFirefox') + ' '
				+ reportInstructions;
			pw.addDescription(msg);
			pw.show();
			pw.startCloseTimer(8000);
		}
		// Display as items pane message
		else {
			var msg = Zotero.getString('general.errorHasOccurred') + ' '
				+ Zotero.getString('general.restartFirefox') + '\n\n'
				+ reportInstructions;
			self.setItemsPaneMessage(msg, true);
		}
		Zotero.debug(msg, 1);
	}
	
	this.displayStartupError = function(asPaneMessage) {
		if(!Zotero || !Zotero.initialized) {
			if (Zotero) {
				var errMsg = Zotero.startupError;
				var errFunc = Zotero.startupErrorHandler;
			}
			
			if (!errMsg) {
				// Get the stringbundle manually
				var src = 'chrome://zotero/locale/zotero.properties';
				var localeService = Components.classes['@mozilla.org/intl/nslocaleservice;1'].
						getService(Components.interfaces.nsILocaleService);
				var appLocale = localeService.getApplicationLocale();
				var stringBundleService = Components.classes["@mozilla.org/intl/stringbundle;1"]
					.getService(Components.interfaces.nsIStringBundleService);
				var stringBundle = stringBundleService.createBundle(src, appLocale);
				
				var errMsg = stringBundle.GetStringFromName('startupError');
			}
			
			if (errFunc) {
				errFunc();
			}
			else {
				// TODO: Add a better error page/window here with reporting
				// instructions
				// window.loadURI('chrome://zotero/content/error.xul');
				//if(asPaneMessage) {
				//	ZoteroPane_Local.setItemsPaneMessage(errMsg, true);
				//} else {
					var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
											.getService(Components.interfaces.nsIPromptService);
					ps.alert(null, "", errMsg);
				//}
			}
		}
	}
	
	/**
	 * Toggles Zotero-as-a-tab by passing off the request to the ZoteroOverlay object associated
	 * with the present window
	 */
	this.toggleTab = function() {
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
						   .getService(Components.interfaces.nsIWindowMediator);
		var browserWindow = wm.getMostRecentWindow("navigator:browser");
		if(browserWindow.ZoteroOverlay) browserWindow.ZoteroOverlay.toggleTab();
	}
	
	/**
	 * Shows the Zotero pane, making it visible if it is not and switching to the appropriate tab
	 * if necessary.
	 */
	this.show = function() {
		if(window.ZoteroOverlay) {
			if(ZoteroOverlay.isTab) {
				ZoteroOverlay.loadZoteroTab();
			} else if(!this.isShowing()) {
				ZoteroOverlay.toggleDisplay();
			}
		}
	}
		
	/**
	 * Unserializes zotero-persist elements from preferences
	 */
	this.unserializePersist = function() {
		var serializedValues = Zotero.Prefs.get("pane.persist");
		if(!serializedValues) return;
		serializedValues = JSON.parse(serializedValues);
		for(var id in serializedValues) {
			var el = document.getElementById(id);
			if(!el) return;
			var elValues = serializedValues[id];
			for(var attr in elValues) {
				el.setAttribute(attr, elValues[attr]);
			}
		}
		
		if(this.itemsView) {
			// may not yet be initialized
			try {
				this.itemsView.sort();
			} catch(e) {};
		}
	}

	/**
	 * Serializes zotero-persist elements to preferences
	 */
	this.serializePersist = function() {
		var serializedValues = {};
		for each(var el in document.getElementsByAttribute("zotero-persist", "*")) {
			if(!el.getAttribute) continue;
			var id = el.getAttribute("id");
			if(!id) continue;
			var elValues = {};
			for each(var attr in el.getAttribute("zotero-persist").split(/[\s,]+/)) {
				var attrValue = el.getAttribute(attr);
				elValues[attr] = attrValue;
			}
			serializedValues[id] = elValues;
		}
		Zotero.Prefs.set("pane.persist", JSON.stringify(serializedValues));
	}
	
	/**
	 * Moves around the toolbar when the user moves around the pane
	 */
	this.updateToolbarPosition = function() {
		if(document.getElementById("zotero-pane-stack").hidden) return;
		const PANES = ["collections", "items"];
		for each(var paneName in PANES) {
			var pane = document.getElementById("zotero-"+paneName+"-pane");
			var splitter = document.getElementById("zotero-"+paneName+"-splitter");
			var toolbar = document.getElementById("zotero-"+paneName+"-toolbar");
			
			var paneComputedStyle = window.getComputedStyle(pane, null);
			var splitterComputedStyle = window.getComputedStyle(splitter, null);
			
			toolbar.style.width = paneComputedStyle.getPropertyValue("width");
			toolbar.style.marginRight = splitterComputedStyle.getPropertyValue("width");
		}
	}
}

/**
 * Keep track of which ZoteroPane was local (since ZoteroPane object might get swapped out for a
 * tab's ZoteroPane)
 */
var ZoteroPane_Local = ZoteroPane;