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

var openURLResolvers;
var proxies;
var charsets;
var _io = {};


var Zotero_Preferences = {

	onUnload: function () {
		Zotero_Preferences.Debug_Output.onUnload();
	}
}

function init()
{
	// Display the appropriate modifier keys for the platform
	var rows = document.getElementById('zotero-prefpane-keys').getElementsByTagName('row');
	for (var i=0; i<rows.length; i++) {
		rows[i].firstChild.nextSibling.value = Zotero.isMac ? 'Cmd+Shift+' : 'Ctrl+Alt+';
	}
	
	updateStorageSettings(null, null, true);
	updateWordProcessorInstructions();
	refreshStylesList();
	refreshProxyList();
	populateQuickCopyList();
	updateQuickCopyInstructions();
	initSearchPane();
	Zotero_Preferences.Debug_Output.init();
	
	var charsetMenu = document.getElementById("zotero-import-charsetMenu");
	var charsetMap = Zotero_Charset_Menu.populate(charsetMenu, false);
	charsetMenu.selectedItem =
		charsetMap[Zotero.Prefs.get("import.charset")] ?
			charsetMap[Zotero.Prefs.get("import.charset")] : charsetMap["auto"];
	
	if(window.arguments) {
		_io = window.arguments[0];
		
		if(_io.pane) {
			var pane = document.getElementById(_io.pane);
			document.getElementById('zotero-prefs').showPane(pane);
			// Quick hack to support install prompt from PDF recognize option
			if (_io.action && _io.action == 'pdftools-install') {
				checkPDFToolsDownloadVersion();
			}
		}
	} else if(document.location.hash == "#cite") {
		document.getElementById('zotero-prefs').showPane(document.getElementById("zotero-prefpane-cite"));
	}
	
	//Zotero.Utilities.writeToDiagFile(Zotero.Utilities.inspectObject(document.getElementById('zotero-prefs').style));
	//<abszh>
	if (Zotero.Prefs.get('crcis.direction')=="rtl")	{
		document.getElementById('zotero-prefs').style.direction="rtl";
		document.getElementById('zotero-prefs').style.textAlign="right";
	}	
	var sep=Zotero.Prefs.get('crcis.dontSeparatePersianAndArabic');
	if (typeof(sep)=="boolean")	{
		document.getElementById('separate-checkbox').checked=(sep);
	} else {
		document.getElementById('separate-checkbox').checked=(sep=="true");
	}
	//I don't know why the this preference(crcis.dontSeparatePersianAndArabic)  is saved as a string. 
	//Maybe it is Pref.get that always returns a string
	//crcis.separateByLanguage is stord as boolean!!!!!!!!!!
	//caution: document.getElementById('separate-checkbox').checked="false" causes the checkbox to be checked
	
	var sep1;
	var psep1=Zotero.Prefs.get('crcis.separateByLanguage');
	if (typeof(psep1)=="boolean") {
		sep1=psep1;
	} else {
		sep1=(psep1=="true");
	}
	
	var en1;
	var pen1=Zotero.Prefs.get('crcis.persianSearch');
	if (typeof(pen1)=="boolean") {
		en1=pen1;
	} else {
		en1=(pen1=="true");
	}
	document.getElementById('persianSearch-checkbox').checked=(en1);
	
	//Zotero.Utilities.writeToDiagFile("crcis.separateByLanguage"+sep1.toSource()+"\r\n");
	//Zotero.Utilities.writeToDiagFile("crcis.dontSeparatePersianAndArabic"+sep.toSource()+"\r\n");
	
	document.getElementById('separate-checkbox1').checked=(sep1);
	if (sep1) {
		document.getElementById('separate-checkbox').disabled=false;
		document.getElementById('bibliographyFirstLanguageMenu').disabled=false;
		document.getElementById('bibliographySecondLanguageMenu').disabled=false;
		
	} else {
		document.getElementById('separate-checkbox').disabled=true;
		document.getElementById('bibliographyFirstLanguageMenu').disabled=true;
		document.getElementById('bibliographySecondLanguageMenu').disabled=true;
	}		
	
	//</abszh>
	
}


function onDataDirLoad() {
	var path = document.getElementById('dataDirPath');
	var useDataDir = Zotero.Prefs.get('useDataDir');
	path.setAttribute('disabled', !useDataDir);
}


function onDataDirUpdate(event) {
	var radiogroup = document.getElementById('dataDir');
	var path = document.getElementById('dataDirPath');
	var useDataDir = Zotero.Prefs.get('useDataDir');
	
	// If triggered from the Choose button, don't show the dialog, since
	// Zotero.chooseZoteroDirectory() shows its own
	if (event.originalTarget && event.originalTarget.tagName == 'button') {
		return true;
	}
	// Fx3.6
	else if (event.explicitOriginalTarget && event.explicitOriginalTarget.tagName == 'button') {
		return true;
	}
	
	// If directory not set or invalid, prompt for location
	if (!getDataDirPath()) {
		event.stopPropagation();
		var file = Zotero.chooseZoteroDirectory(true);
		radiogroup.selectedIndex = file ? 1 : 0;
		return !!file;
	}
	
	var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
		.getService(Components.interfaces.nsIPromptService);
	var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
		+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_CANCEL);
	var app = Zotero.isStandalone ? Zotero.getString('app.standalone') : Zotero.getString('app.firefox');
	var index = ps.confirmEx(window,
		Zotero.getString('general.restartRequired'),
		Zotero.getString('general.restartRequiredForChange', app),
		buttonFlags,
		Zotero.getString('general.restartNow'),
		null, null, null, {});
	
	if (index == 0) {
		useDataDir = !!radiogroup.selectedIndex;
		// quit() is asynchronous, but set this here just in case
		Zotero.Prefs.set('useDataDir', useDataDir);
		var appStartup = Components.classes["@mozilla.org/toolkit/app-startup;1"]
				.getService(Components.interfaces.nsIAppStartup);
		appStartup.quit(Components.interfaces.nsIAppStartup.eAttemptQuit
			| Components.interfaces.nsIAppStartup.eRestart);
	}
	
	radiogroup.selectedIndex = useDataDir ? 1 : 0;
	return useDataDir;
}


function getDataDirPath() {
	var desc = Zotero.Prefs.get('dataDir');
	if (desc == '') {
		return '';
	}
	
	var file = Components.classes["@mozilla.org/file/local;1"].
		createInstance(Components.interfaces.nsILocalFile);
	try {
		file.persistentDescriptor = desc;
	}
	catch (e) {
		return '';
	}
	return file.path;
}


function populateOpenURLResolvers() {
	var openURLMenu = document.getElementById('openURLMenu');
	
	openURLResolvers = Zotero.OpenURL.discoverResolvers();
	var i = 0;
	for each(var r in openURLResolvers) {
		openURLMenu.insertItemAt(i, r.name);
		if (r.url == Zotero.Prefs.get('openURL.resolver') && r.version == Zotero.Prefs.get('openURL.version')) {
			openURLMenu.selectedIndex = i;
		}
		i++;
	}
	
	var button = document.getElementById('openURLSearchButton');
	switch (openURLResolvers.length) {
		case 0:
			var num = 'zero';
			break;
		case 1:
			var num = 'singular';
			break;
		default:
			var num = 'plural';
	}
	
	button.setAttribute('label', Zotero.getString('zotero.preferences.openurl.resolversFound.' + num, openURLResolvers.length));
}


//
// Sync
//
function updateStorageSettings(enabled, protocol, skipWarnings) {
	if (enabled === null) {
		enabled = document.getElementById('pref-storage-enabled').value;
	}
	
	var oldProtocol = document.getElementById('pref-storage-protocol').value;
	if (protocol === null) {
		protocol = oldProtocol;
	}
	
	var protocolMenu = document.getElementById('storage-protocol');
	var settings = document.getElementById('storage-webdav-settings');
	var sep = document.getElementById('storage-separator');
	
	if (!enabled || protocol == 'zotero') {
		settings.hidden = true;
		sep.hidden = false;
	}
	else {
		settings.hidden = false;
		sep.hidden = true;
	}
	
	protocolMenu.disabled = !enabled;
	
	if (!skipWarnings) {
		// WARN if going between
	}
	
	if (oldProtocol == 'zotero' && protocol == 'webdav') {
		var sql = "SELECT COUNT(*) FROM version WHERE schema='storage_zfs'";
		if (Zotero.DB.valueQuery(sql)) {
			var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
									.getService(Components.interfaces.nsIPromptService);
			var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
								+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_IS_STRING)
								+ ps.BUTTON_DELAY_ENABLE;
			var account = Zotero.Sync.Server.username;
			var index = ps.confirmEx(
				null,
				// TODO: localize
				"Purge Attachment Files on Zotero Servers?",
				
				"If you plan to use WebDAV for file syncing and you previously synced attachment files in My Library "
					+ "to the Zotero servers, you can purge those files from the Zotero servers to give you more "
					+ "storage space for groups.\n\n"
					+ "You can purge files at any time from your account settings on zotero.org.",
				buttonFlags,
				"Purge Files Now",
				"Do Not Purge", null, null, {}
			);
			
			if (index == 0) {
				var sql = "INSERT OR IGNORE INTO settings VALUES (?,?,?)";
				Zotero.DB.query(sql, ['storage', 'zfsPurge', 'user']);
				
				Zotero.Sync.Storage.purgeDeletedStorageFiles('zfs', function (success) {
					if (success) {
						ps.alert(
							null,
							Zotero.getString("general.success"),
							"Attachment files from your personal library have been removed from the Zotero servers."
						);
					}
					else {
						ps.alert(
							null,
							Zotero.getString("general.error"),
							"An error occurred. Please try again later."
						);
					}
				});
			}
		}
	}
	
	setTimeout(function () {
		updateStorageTerms();
	}, 1)
}


function updateStorageTerms() {
	var terms = document.getElementById('storage-terms');
	
	var libraryEnabled = document.getElementById('pref-storage-enabled').value;
	var storageProtocol = document.getElementById('pref-storage-protocol').value;
	var groupsEnabled = document.getElementById('pref-group-storage-enabled').value;
	
	terms.hidden = !((libraryEnabled && storageProtocol == 'zotero') || groupsEnabled);
}



function unverifyStorageServer() {
	Zotero.Prefs.set('sync.storage.verified', false);
	Zotero.Sync.Storage.resetAllSyncStates(null, true, false);
}

function verifyStorageServer() {
	Zotero.debug("Verifying storage");
	
	var verifyButton = document.getElementById("storage-verify");
	var abortButton = document.getElementById("storage-abort");
	var progressMeter = document.getElementById("storage-progress");
	var urlField = document.getElementById("storage-url");
	var usernameField = document.getElementById("storage-username");
	var passwordField = document.getElementById("storage-password");
	
	var callback = function (uri, status, error) {
		verifyButton.hidden = false;
		abortButton.hidden = true;
		progressMeter.hidden = true;
		
		switch (status) {
			case Zotero.Sync.Storage.ERROR_NO_URL:
				setTimeout(function () {
					urlField.focus();
				}, 1);
				break;
			
			case Zotero.Sync.Storage.ERROR_NO_USERNAME:
				setTimeout(function () {
					usernameField.focus();
				}, 1);
				break;
			
			case Zotero.Sync.Storage.ERROR_NO_PASSWORD:
				setTimeout(function () {
					passwordField.focus();
				}, 1);
				break;
		}
		
		Zotero.Sync.Storage.checkServerCallback(uri, status, window, false, error);
	}
	
	verifyButton.hidden = true;
	abortButton.hidden = false;
	progressMeter.hidden = false;
	var requestHolder = Zotero.Sync.Storage.checkServer('webdav', callback);
	abortButton.onclick = function () {
		if (requestHolder.request) {
			requestHolder.request.onreadystatechange = undefined;
			requestHolder.request.abort();
			verifyButton.hidden = false;
			abortButton.hidden = true;
			progressMeter.hidden = true;
		}
	}
}

function handleSyncResetSelect(obj) {
	var index = obj.selectedIndex;
	var rows = obj.getElementsByTagName('row');
	
	for (var i=0; i<rows.length; i++) {
		if (i == index) {
			rows[i].setAttribute('selected', 'true');
		}
		else {
			rows[i].removeAttribute('selected');
		}
	}
}

function handleSyncReset(action) {
	var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
							.getService(Components.interfaces.nsIPromptService);
	
	if (!Zotero.Sync.Server.enabled) {
		ps.alert(
			null,
			Zotero.getString('general.error'),
			// TODO: localize
			"You must enter a username and password in the "
				+ document.getElementById('zotero-prefpane-sync')
					.getElementsByTagName('tab')[0].label
				+ " tab before using the reset options."
		);
		return;
	}
	
	var account = Zotero.Sync.Server.username;
	
	switch (action) {
		case 'restore-from-server':
			var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
								+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_CANCEL)
								+ ps.BUTTON_POS_1_DEFAULT;
			var index = ps.confirmEx(
				null,
				// TODO: localize
				Zotero.getString('general.warning'),
				"All data in this copy of Zotero will be erased and replaced with "
					+ "data belonging to user '" + account + "' on the Zotero server.",
				buttonFlags,
				"Replace Local Data",
				null, null, null, {}
			);
			
			switch (index) {
				case 0:
					// TODO: better error handling
					
					// Verify username and password
					var callback = function () {
						Zotero.Schema.stopRepositoryTimer();
						Zotero.Sync.Runner.clearSyncTimeout();
						
						Zotero.DB.skipBackup = true;
						
						var file = Zotero.getZoteroDirectory();
						file.append('restore-from-server');
						Zotero.File.putContents(file, '');
						
						var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING);
						var index = ps.confirmEx(
							null,
							Zotero.getString('general.restartRequired'),
							// TODO: localize
							"Firefox must be restarted to complete the restore process.",
							buttonFlags,
							Zotero.getString('general.restartNow'),
							null, null, null, {}
						);
						
						var appStartup = Components.classes["@mozilla.org/toolkit/app-startup;1"]
								.getService(Components.interfaces.nsIAppStartup);
						appStartup.quit(Components.interfaces.nsIAppStartup.eRestart | Components.interfaces.nsIAppStartup.eAttemptQuit);
					};
					
					// TODO: better way of checking for an active session?
					if (Zotero.Sync.Server.sessionIDComponent == 'sessionid=') {
						Zotero.Sync.Server.login(callback);
					}
					else {
						callback();
					}
					break;
				
				// Cancel
				case 1:
					return;
			}
			break;
		
		case 'restore-to-server':
			var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
							+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_CANCEL)
							+ ps.BUTTON_POS_1_DEFAULT;
			var index = ps.confirmEx(
				null,
				// TODO: localize
				Zotero.getString('general.warning'),
				"All data belonging to user '" + account + "' on the Zotero server "
					+ "will be erased and replaced with data from this copy of Zotero.\n\n"
					+ "Depending on the size of your library, there may be a delay before "
					+ "your data is available on the server.",
				buttonFlags,
				"Replace Server Data",
				null, null, null, {}
			);
			
			switch (index) {
				case 0:
					// TODO: better error handling
					Zotero.Sync.Server.clear(function () {
						Zotero.Sync.Server.sync(/*{
							
							// TODO: this doesn't work if the pref window is 
							closed. fix, perhaps by making original callbacks
							available to the custom callbacks
							
							onSuccess: function () {
								Zotero.Sync.Runner.setSyncIcon();
								ps.alert(
									null,
									"Restore Completed",
									"Data on the Zotero server has been successfully restored."
								);
							},
							onError: function (msg) {
								// TODO: combine with error dialog for regular syncs
								ps.alert(
									null,
									"Restore Failed",
									"An error occurred uploading your data to the server.\n\n"
										+ "Click the sync error icon in the Zotero toolbar "
										+ "for further information."
								);
								Zotero.Sync.Runner.error(msg);
							}
						}*/);
					});
					break;
				
				// Cancel
				case 1:
					return;
			}
			
			break;
		
		
		case 'reset-storage-history':
			var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
							+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_CANCEL)
							+ ps.BUTTON_POS_1_DEFAULT;
			var index = ps.confirmEx(
				null,
				// TODO: localize
				Zotero.getString('general.warning'),
				"All file sync history will be cleared.\n\n"
					+ "Any local attachment files that do not exist on the storage server will be uploaded on the next sync.",
				buttonFlags,
				"Reset",
				null, null, null, {}
			);
			
			switch (index) {
				case 0:
					Zotero.Sync.Storage.resetAllSyncStates();
					ps.alert(
						null,
						"File Sync History Cleared",
						"The file sync history has been cleared."
					);
					break;
				
				// Cancel
				case 1:
					return;
			}
			
			break;
		
		default:
			throw ("Invalid action '" + action + "' in handleSyncReset()");
	}
}


/*
 * Builds the main Quick Copy drop-down from the current global pref
 */
function populateQuickCopyList() {
	// Initialize default format drop-down
	var format = Zotero.Prefs.get("export.quickCopy.setting");
	var menulist = document.getElementById("zotero-quickCopy-menu");
	buildQuickCopyFormatDropDown(menulist, Zotero.QuickCopy.getContentType(format), format);
	menulist.setAttribute('preference', "pref-quickCopy-setting");
	updateQuickCopyHTMLCheckbox();
	
	refreshQuickCopySiteList();
}


/*
 * Builds a Quick Copy drop-down 
 */
function buildQuickCopyFormatDropDown(menulist, contentType, currentFormat) {
	if (!currentFormat) {
		currentFormat = menulist.value;
	}
	// Strip contentType from mode
	currentFormat = Zotero.QuickCopy.stripContentType(currentFormat);
	
	menulist.selectedItem = null;
	menulist.removeAllItems();
	
	// Prevent Cmd-w from setting "Wikipedia"
	menulist.onkeydown = function (event) {
		if ((Zotero.isMac && event.metaKey) || event.ctrlKey) {
			event.preventDefault();
		}
	}
	
	var popup = document.createElement('menupopup');
	menulist.appendChild(popup);
	
	var itemNode = document.createElement("menuitem");
	itemNode.setAttribute("label", Zotero.getString('zotero.preferences.export.quickCopy.bibStyles'));
	itemNode.setAttribute("disabled", true);
	popup.appendChild(itemNode);
	
	// add styles to list
	var styles = Zotero.Styles.getVisible();
	for each(var style in styles) {
		var baseVal = 'bibliography=' + style.styleID;
		var val = 'bibliography' + (contentType == 'html' ? '/html' : '') + '=' + style.styleID;
		var itemNode = document.createElement("menuitem");
		itemNode.setAttribute("value", val);
		itemNode.setAttribute("label", style.title);
		itemNode.setAttribute("oncommand", 'updateQuickCopyHTMLCheckbox()');
		popup.appendChild(itemNode);
		
		if (baseVal == currentFormat) {
			menulist.selectedItem = itemNode;
		}
	}
	
	var itemNode = document.createElement("menuitem");
	itemNode.setAttribute("label", Zotero.getString('zotero.preferences.export.quickCopy.exportFormats'));
	itemNode.setAttribute("disabled", true);
	popup.appendChild(itemNode);
	
	// add export formats to list
	var translation = new Zotero.Translate("export");
	var translators = translation.getTranslators();
	
	for (var i=0; i<translators.length; i++) {
		// Skip RDF formats
		switch (translators[i].translatorID) {
			case '6e372642-ed9d-4934-b5d1-c11ac758ebb7':
			case '14763d24-8ba0-45df-8f52-b8d1108e7ac9':
				continue;
		}
		var val  = 'export=' + translators[i].translatorID;
		var itemNode = document.createElement("menuitem");
		itemNode.setAttribute("value", val);
		itemNode.setAttribute("label", translators[i].label);
		itemNode.setAttribute("oncommand", 'updateQuickCopyHTMLCheckbox()');
		popup.appendChild(itemNode);
		
		if (val == currentFormat) {
			menulist.selectedItem = itemNode;
		}
	}
	
	menulist.click();
	
	return popup;
}

function updateQuickCopyHTMLCheckbox() {
	var format = document.getElementById('zotero-quickCopy-menu').value;
	var mode, contentType;
	
	var checkbox = document.getElementById('zotero-quickCopy-copyAsHTML');
	[mode, format] = format.split('=');
	[mode, contentType] = mode.split('/');
	
	checkbox.checked = contentType == 'html';
	checkbox.disabled = mode != 'bibliography';
}

function showQuickCopySiteEditor(index) {
	var treechildren = document.getElementById('quickCopy-siteSettings-rows');
	
	if (index != undefined && index > -1 && index < treechildren.childNodes.length) {
		var treerow = treechildren.childNodes[index].firstChild;
		var domain = treerow.childNodes[0].getAttribute('label');
		var format = treerow.childNodes[1].getAttribute('label');
		var asHTML = treerow.childNodes[2].getAttribute('label') != '';
	}
	
	var format = Zotero.QuickCopy.getSettingFromFormattedName(format);
	if (asHTML) {
		format = format.replace('bibliography=', 'bibliography/html=');
	}
	
	var io = {domain: domain, format: format, ok: false};
	window.openDialog('chrome://zotero/content/preferences/quickCopySiteEditor.xul', "zotero-preferences-quickCopySiteEditor", "chrome, modal", io);
	
	if (!io.ok) {
		return;
	}
	
	if (domain && domain != io.domain) {
		Zotero.DB.query("DELETE FROM settings WHERE setting='quickCopySite' AND key=?", [domain]);
	}
	
	Zotero.DB.query("REPLACE INTO settings VALUES ('quickCopySite', ?, ?)", [io.domain, io.format]);
	
	refreshQuickCopySiteList();
}

function refreshQuickCopySiteList() {
	var treechildren = document.getElementById('quickCopy-siteSettings-rows');
	while (treechildren.hasChildNodes()) {
		treechildren.removeChild(treechildren.firstChild);
	}
	
	var sql = "SELECT key AS domainPath, value AS format FROM settings "
		+ "WHERE setting='quickCopySite' ORDER BY domainPath COLLATE NOCASE";
	var siteData = Zotero.DB.query(sql);
	
	if (!siteData) {
		return;
	}
	
	for (var i=0; i<siteData.length; i++) {
		var treeitem = document.createElement('treeitem');
		var treerow = document.createElement('treerow');
		var domainCell = document.createElement('treecell');
		var formatCell = document.createElement('treecell');
		var HTMLCell = document.createElement('treecell');
		
		domainCell.setAttribute('label', siteData[i].domainPath);
		
		var formatted = Zotero.QuickCopy.getFormattedNameFromSetting(siteData[i].format);
		formatCell.setAttribute('label', formatted);
		var copyAsHTML = Zotero.QuickCopy.getContentType(siteData[i].format) == 'html';
		HTMLCell.setAttribute('label', copyAsHTML ? '   ✓   ' : '');
		
		treerow.appendChild(domainCell);
		treerow.appendChild(formatCell);
		treerow.appendChild(HTMLCell);
		treeitem.appendChild(treerow);
		treechildren.appendChild(treeitem);
	}
}


function deleteSelectedQuickCopySite() {
	var tree = document.getElementById('quickCopy-siteSettings');
	var treeitem = tree.lastChild.childNodes[tree.currentIndex];
	var domainPath = treeitem.firstChild.firstChild.getAttribute('label');
	Zotero.DB.query("DELETE FROM settings WHERE setting='quickCopySite' AND key=?", [domainPath]);
	refreshQuickCopySiteList();
}


function updateQuickCopyInstructions() {
	var prefix = Zotero.isMac ? 'Cmd+Shift+' : 'Ctrl+Alt+';
	var key = Zotero.Prefs.get('keys.copySelectedItemsToClipboard');
	
	var instr = document.getElementById('quickCopy-instructions');
	var str = Zotero.getString('zotero.preferences.export.quickCopy.instructions', prefix + key);
	
	while (instr.hasChildNodes()) {
		instr.removeChild(instr.firstChild);
	}
	instr.appendChild(document.createTextNode(str));
}


function rebuildIndexPrompt() {
	var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].
			createInstance(Components.interfaces.nsIPromptService);
	var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
		+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_IS_STRING)
		+ (ps.BUTTON_POS_2) * (ps.BUTTON_TITLE_CANCEL);
	
	var index = ps.confirmEx(null,
		Zotero.getString('zotero.preferences.search.rebuildIndex'),
		Zotero.getString('zotero.preferences.search.rebuildWarning',
			Zotero.getString('zotero.preferences.search.indexUnindexed')),
		buttonFlags,
		Zotero.getString('zotero.preferences.search.rebuildIndex'),
		Zotero.getString('zotero.preferences.search.indexUnindexed'),
		null, null, {});
	
	if (index == 0) {
		Zotero.Fulltext.rebuildIndex();
	}
	else if (index == 1) {
		Zotero.Fulltext.rebuildIndex(true)
	}
	
	updateIndexStats();
}


function clearIndexPrompt() {
	var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].
			createInstance(Components.interfaces.nsIPromptService);
	var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
		+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_IS_STRING)
		+ (ps.BUTTON_POS_2) * (ps.BUTTON_TITLE_CANCEL);
	
	var index = ps.confirmEx(null,
		Zotero.getString('zotero.preferences.search.clearIndex'),
		Zotero.getString('zotero.preferences.search.clearWarning',
			Zotero.getString('zotero.preferences.search.clearNonLinkedURLs')),
		buttonFlags,
		Zotero.getString('zotero.preferences.search.clearIndex'),
		Zotero.getString('zotero.preferences.search.clearNonLinkedURLs'),
		null, null, {});
	
	if (index == 0) {
		Zotero.Fulltext.clearIndex();
	}
	else if (index == 1) {
		Zotero.Fulltext.clearIndex(true);
	}
	
	updateIndexStats();
}


function initSearchPane() {
	document.getElementById('fulltext-rebuildIndex').setAttribute('label',
		Zotero.getString('zotero.preferences.search.rebuildIndex'));
	document.getElementById('fulltext-clearIndex').setAttribute('label',
		Zotero.getString('zotero.preferences.search.clearIndex'));
	updatePDFToolsStatus();
}


/*
 * Update window according to installation status for PDF tools
 *  (e.g. status line, install/update button, etc.)
 */
function updatePDFToolsStatus() {
	var converterIsRegistered = Zotero.Fulltext.pdfConverterIsRegistered();
	var infoIsRegistered = Zotero.Fulltext.pdfInfoIsRegistered();
	
	var converterStatusLabel = document.getElementById('pdfconverter-status');
	var infoStatusLabel = document.getElementById('pdfinfo-status');
	var requiredLabel = document.getElementById('pdftools-required');
	var updateButton = document.getElementById('pdftools-update-button');
	var documentationLink = document.getElementById('pdftools-documentation-link');
	var settingsBox = document.getElementById('pdftools-settings');
	
	// If we haven't already generated the required and documentation messages
	if (!converterIsRegistered && !requiredLabel.hasChildNodes()) {
		
		// Xpdf link
		var str = Zotero.getString('zotero.preferences.search.pdf.toolsRequired',
			[Zotero.Fulltext.pdfConverterName, Zotero.Fulltext.pdfInfoName,
			'<a href="' + Zotero.Fulltext.pdfToolsURL + '">'
			+ Zotero.Fulltext.pdfToolsName + '</a>']);
		var parts = Zotero.Utilities.parseMarkup(str);
		for (var i=0; i<parts.length; i++) {
			var part = parts[i];
			if (part.type == 'text') {
				var elem = document.createTextNode(part.text);
			}
			else if (part.type == 'link') {
				var elem = document.createElement('label');
				elem.setAttribute('value', part.text);
				elem.setAttribute('class', 'text-link');
				for (var key in part.attributes) {
					elem.setAttribute(key, part.attributes[key]);
					
					if (key == 'href') {
						elem.setAttribute('tooltiptext', part.attributes[key]);
					}
				}
			}
			requiredLabel.appendChild(elem);
		}
		
		requiredLabel.appendChild(document.createTextNode(' '
			+ Zotero.getString('zotero.preferences.search.pdf.automaticInstall')));
		
		// Documentation link
		var link = '<a href="http://www.zotero.org/documentation/pdf_fulltext_indexing">'
			+ Zotero.getString('zotero.preferences.search.pdf.documentationLink')
			+ '</a>';
		var str = Zotero.getString('zotero.preferences.search.pdf.advancedUsers', link);
		var parts = Zotero.Utilities.parseMarkup(str);
		
		for (var i=0; i<parts.length; i++) {
			var part = parts[i];
			if (part.type == 'text') {
				var elem = document.createTextNode(part.text);
			}
			else if (part.type == 'link') {
				var elem = document.createElement('label');
				elem.setAttribute('value', part.text);
				elem.setAttribute('class', 'text-link');
				for (var key in part.attributes) {
					elem.setAttribute(key, part.attributes[key]);
					
					if (key == 'href') {
						elem.setAttribute('tooltiptext', part.attributes[key]);
					}
				}
			}
			documentationLink.appendChild(elem);
		}
	}
	
	// converter status line
	var prefix = 'zotero.preferences.search.pdf.tool';
	if (converterIsRegistered) {
		var version = Zotero.Fulltext.pdfConverterVersion;
		str = Zotero.getString(prefix + 'Registered',
			Zotero.getString('zotero.preferences.search.pdf.toolVersionPlatform',
				[Zotero.Fulltext.pdfConverterName, version]));
	}
	else {
		str = Zotero.getString(prefix + 'NotRegistered',
			[Zotero.Fulltext.pdfConverterFileName]);
	}
	converterStatusLabel.setAttribute('value', str);
	
	// pdfinfo status line
	if (infoIsRegistered) {
		var version = Zotero.Fulltext.pdfInfoVersion;
		str = Zotero.getString(prefix + 'Registered',
			Zotero.getString('zotero.preferences.search.pdf.toolVersionPlatform',
				[Zotero.Fulltext.pdfInfoName, version]));
	}
	else {
		str = Zotero.getString(prefix + 'NotRegistered',
			[Zotero.Fulltext.pdfInfoFileName]);
	}
	infoStatusLabel.setAttribute('value', str);
	
	str = converterIsRegistered ?
		Zotero.getString('general.checkForUpdate') :
		Zotero.getString('zotero.preferences.search.pdf.checkForInstaller');
	updateButton.setAttribute('label', str);
	
	requiredLabel.setAttribute('hidden', converterIsRegistered);
	documentationLink.setAttribute('hidden', converterIsRegistered);
	settingsBox.setAttribute('hidden', !converterIsRegistered);
}


/*
 * Check available versions of PDF tools from server and prompt for installation
 * if a newer version is available
 */
function checkPDFToolsDownloadVersion() {
	var url = Zotero.Fulltext.pdfToolsDownloadBaseURL
				+ Zotero.platform.replace(' ', '-') + '.latest';
	
	// Find latest version for this platform
	var sent = Zotero.HTTP.doGet(url, function (xmlhttp) {
		try {
			if (xmlhttp.status == 200) {
				var converterIsRegistered = Zotero.Fulltext.pdfConverterIsRegistered();
				var infoIsRegistered = Zotero.Fulltext.pdfInfoIsRegistered();
				var bothRegistered = converterIsRegistered && infoIsRegistered;
				
				var converterVersion = xmlhttp.responseText.split(/\s/)[0];
				var infoVersion = xmlhttp.responseText.split(/\s/)[1];
				
				var converterVersionAvailable = converterVersion &&
					(!converterIsRegistered ||
						Zotero.Fulltext.pdfConverterVersion == 'UNKNOWN' ||
						converterVersion > Zotero.Fulltext.pdfConverterVersion);
				var infoVersionAvailable = infoVersion &&
					(!infoIsRegistered ||
						Zotero.Fulltext.pdfInfoVersion == 'UNKNOWN' ||
						infoVersion > Zotero.Fulltext.pdfInfoVersion);
				var bothAvailable = converterVersionAvailable && infoVersionAvailable;
				
				/*
				Zotero.debug(converterIsRegistered);
				Zotero.debug(infoIsRegistered);
				Zotero.debug(converterVersion);
				Zotero.debug(infoVersion);
				Zotero.debug(Zotero.Fulltext.pdfConverterVersion);
				Zotero.debug(Zotero.Fulltext.pdfInfoVersion);
				Zotero.debug(converterVersionAvailable);
				Zotero.debug(infoVersionAvailable);
				*/
				
				// Up to date -- disable update button
				if (!converterVersionAvailable && !infoVersionAvailable) {
					var button = document.getElementById('pdftools-update-button');
					button.setAttribute('label', Zotero.getString('zotero.preferences.update.upToDate'));
					button.setAttribute('disabled', true);
				}
				// New version available -- display update prompt
				else {
					var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].
							createInstance(Components.interfaces.nsIPromptService);
					var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
						+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_CANCEL);
					
					var msg = Zotero.getString('zotero.preferences.search.pdf.available'
						+ ((converterIsRegistered || infoIsRegistered) ? 'Updates' : 'Downloads'),
						[Zotero.platform, 'zotero.org']) + '\n\n';
					
					if (converterVersionAvailable) {
						tvp = Zotero.getString('zotero.preferences.search.pdf.toolVersionPlatform',
							[Zotero.Fulltext.pdfConverterName, converterVersion]);
						msg += '- ' + tvp + '\n';
					}
					if (infoVersionAvailable) {
						tvp = Zotero.getString('zotero.preferences.search.pdf.toolVersionPlatform',
							[Zotero.Fulltext.pdfInfoName, infoVersion]);
						msg += '- ' + tvp + '\n';
					}
					msg += '\n';
					msg += Zotero.getString('zotero.preferences.search.pdf.zoteroCanInstallVersion'
							+ (bothAvailable ? 's' : ''));
					
					var index = ps.confirmEx(null,
						converterIsRegistered ?
							Zotero.getString('general.updateAvailable') : '',
						msg,
						buttonFlags,
						converterIsRegistered ?
							Zotero.getString('general.upgrade') :
							Zotero.getString('general.install'),
						null, null, null, {});
					
					if (index == 0) {
						var installVersions = {
							converter: converterVersionAvailable ?
								converterVersion : null,
							info: infoVersionAvailable ?
								infoVersion : null
						};
						installPDFTools(installVersions);
					}
				}
			}
			// Version not found for platform
			else if (xmlhttp.status == 404) {
				onPDFToolsDownloadError(404);
			}
		}
		catch (e) {
			onPDFToolsDownloadError(e);
		}
	});
	
	// Browser is offline
	if (!sent) {
		onPDFToolsDownloadError();
	}
}


/*
 * Begin installation of specified PDF tools from server -- does a HEAD call to
 * make sure file exists and then calls downloadPDFTool() if so
 */
function installPDFTools(installVersions) {
	if (!installVersions) {
		installVersions = {
			converter: true,
			info: true
		};
	}
	
	// We install the converter first if it's available
	var url = Zotero.Fulltext.pdfToolsDownloadBaseURL;
	if (installVersions.converter) {
		var tool = 'converter';
		var version = installVersions.converter;
		url += Zotero.Fulltext.pdfConverterFileName + '-' + installVersions.converter;
	}
	else if (installVersions.info) {
		var tool = 'info';
		var version = installVersions.info;
		url += Zotero.Fulltext.pdfInfoFileName + '-' + installVersions.info;
	}
	else {
		return; 
	}
	
	// Find latest version for this platform
	var sent = Zotero.HTTP.doHead(url, function (xmlhttp) {
		try {
			if (xmlhttp.status == 200) {
				// If doing both and on converter, chain pdfinfo
				if (installVersions.converter && installVersions.info) {
					downloadPDFTool(tool, version, function () {
						return installPDFTools({ info: installVersions.info });
					});
				}
				else {
					downloadPDFTool(tool, version);
				}
			}
			// Version not found for platform
			else if (xmlhttp.status == 404) {
				onPDFToolsDownloadError(404);
			}
		}
		catch (e) {
			onPDFToolsDownloadError(e);
		}
	});
	
	// Browser is offline
	if (!sent) {
		onPDFToolsDownloadError();
	}
}


/*
 * Download and install specified PDF tool
 */
function downloadPDFTool(tool, version, callback) {
	var ioService = Components.classes["@mozilla.org/network/io-service;1"]
						.getService(Components.interfaces.nsIIOService);
	
	if (tool == 'converter') {
		var fileName = Zotero.Fulltext.pdfConverterFileName; 
	}
	else {
		var fileName = Zotero.Fulltext.pdfInfoFileName;
	}
	
	
	var url = Zotero.Fulltext.pdfToolsDownloadBaseURL + fileName + '-' + version;
	var uri = ioService.newURI(url, null, null);
	
	var file = Zotero.getZoteroDirectory();
	file.append(fileName);
	var fileURL = ioService.newFileURI(file);
	
	const nsIWBP = Components.interfaces.nsIWebBrowserPersist;
	var wbp = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"]
				.createInstance(nsIWBP);
	
	var progressListener = new Zotero.WebProgressFinishListener(function () {
		// Set permissions to 755
		if (Zotero.isMac) {
			file.permissions = 33261;
		}
		else if (Zotero.isLinux) {
			file.permissions = 493;
		}
		
		// Write the version number to a file
		var versionFile = Zotero.getZoteroDirectory();
		versionFile.append(fileName + '.version');
		Zotero.File.putContents(versionFile, version + '');
		
		Zotero.Fulltext.registerPDFTool(tool);
		
		// Used to install info tool after converter
		if (callback) {
			callback();
		}
		// If done
		else {
			updatePDFToolsStatus();
		}
	});
	
	/*
	var tr = Components.classes["@mozilla.org/transfer;1"].
		createInstance(Components.interfaces.nsITransfer);
	tr.init(uri, fileURL, "", null, null, null, wbp);
	*/
	
	document.getElementById('pdftools-update-button').disabled = true;
	var str = Zotero.getString('zotero.preferences.search.pdf.downloading');
	document.getElementById('pdftools-update-button').setAttribute('label', str);
	
	wbp.progressListener = progressListener;
	Zotero.debug("Saving " + uri.spec + " to " + fileURL.spec);
	wbp.saveURI(uri, null, null, null, null, fileURL);
}


function onPDFToolsDownloadError(e) {
	if (e == 404) {
		var str = Zotero.getString('zotero.preferences.search.pdf.toolDownloadsNotAvailable',
			Zotero.Fulltext.pdfToolsName) + ' '
			+ Zotero.getString('zotero.preferences.search.pdf.viewManualInstructions');
	}
	else if (e) {
		Components.utils.reportError(e);
		var str = Zotero.getString('zotero.preferences.search.pdf.toolsDownloadError', Zotero.Fulltext.pdfToolsName)
			+ ' ' + Zotero.getString('zotero.preferences.search.pdf.tryAgainOrViewManualInstructions');
	}
	else {
		var info = Components.classes["@mozilla.org/xre/app-info;1"]
                     .getService(Components.interfaces.nsIXULAppInfo);
		var browser = info.name; // Returns "Firefox" for Firefox
		var str = Zotero.getString('general.browserIsOffline', browser);
	}
	alert(str);
}


function updateIndexStats() {
	var stats = Zotero.Fulltext.getIndexStats();
	document.getElementById('fulltext-stats-indexed').
		lastChild.setAttribute('value', stats.indexed);
	document.getElementById('fulltext-stats-partial').
		lastChild.setAttribute('value', stats.partial);
	document.getElementById('fulltext-stats-unindexed').
		lastChild.setAttribute('value', stats.unindexed);
	document.getElementById('fulltext-stats-words').
		lastChild.setAttribute('value', stats.words);
}


function revealDataDirectory() {
	var dataDir = Zotero.getZoteroDirectory();
	dataDir.QueryInterface(Components.interfaces.nsILocalFile);
	try {
		dataDir.reveal();
	}
	catch (e) {
		// On platforms that don't support nsILocalFile.reveal() (e.g. Linux), we
		// open a small window with a selected read-only textbox containing the
		// file path, so the user can open it, Control-c, Control-w, Alt-Tab, and
		// Control-v the path into another app
		var io = {alertText: dataDir.path};
		window.openDialog('chrome://zotero/content/selectableAlert.xul', "zotero-reveal-window", "chrome", io);
	}
}


function runIntegrityCheck() {
	var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
		.getService(Components.interfaces.nsIPromptService);
	
	var ok = Zotero.DB.integrityCheck();
	if (ok) {
		ok = Zotero.Schema.integrityCheck();
	}
	var str = ok ? 'passed' : 'failed';
	
	ps.alert(window,
		Zotero.getString('general.' + str),
		Zotero.getString('db.integrityCheck.' + str)
		+ (!ok ? "\n\n" + Zotero.getString('db.integrityCheck.dbRepairTool') : ''));
}


function updateTranslators() {
	Zotero.Schema.updateFromRepository(true, function (xmlhttp, updated) {
		var button = document.getElementById('updateButton');
		if (button) {
			if (updated===-1) {
				var label = Zotero.getString('zotero.preferences.update.upToDate');
			}
			else if (updated) {
				var label = Zotero.getString('zotero.preferences.update.updated');
			}
			else {
				var label = Zotero.getString('zotero.preferences.update.error');
			}
			button.setAttribute('label', label);
		}
	});

	//<abszh>
	/*	var button = document.getElementById('updateButton');
	if (button) {
		var label = Zotero.getString('zotero.preferences.update.upToDate');
		button.setAttribute('label', label);
	}*/
	//</abszh>
	

}


function resetTranslatorsAndStyles() {
	var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
		.getService(Components.interfaces.nsIPromptService);
	
	var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
		+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_CANCEL);
	
	var index = ps.confirmEx(null,
		Zotero.getString('general.warning'),
		Zotero.getString('zotero.preferences.advanced.resetTranslatorsAndStyles.changesLost'),
		buttonFlags,
		Zotero.getString('zotero.preferences.advanced.resetTranslatorsAndStyles'),
		null, null, null, {});
	
	if (index == 0) {
		Zotero.Schema.resetTranslatorsAndStyles(function (xmlhttp, updated) {
			populateQuickCopyList();
		});
	}
}


function resetTranslators() {
	var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
		.getService(Components.interfaces.nsIPromptService);
	
	var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
		+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_CANCEL);
	
	var index = ps.confirmEx(null,
		Zotero.getString('general.warning'),
		Zotero.getString('zotero.preferences.advanced.resetTranslators.changesLost'),
		buttonFlags,
		Zotero.getString('zotero.preferences.advanced.resetTranslators'),
		null, null, null, {});
	
	if (index == 0) {
		Zotero.Schema.resetTranslators();
	}
}


function resetStyles() {
	var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
		.getService(Components.interfaces.nsIPromptService);
	
	var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
		+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_CANCEL);
	
	var index = ps.confirmEx(null,
		Zotero.getString('general.warning'),
		Zotero.getString('zotero.preferences.advanced.resetStyles.changesLost'),
		buttonFlags,
		Zotero.getString('zotero.preferences.advanced.resetStyles'),
		null, null, null, {});
	
	if (index == 0) {
		Zotero.Schema.resetStyles(function (xmlhttp, updated) {
			populateQuickCopyList();
		});
	}
}


Zotero_Preferences.Debug_Output = {
	_timer: null,
	
	init: function () {
		var storing = Zotero.Debug.storing;
		this._updateButton();
		this.updateLines();
		if (storing) {
			this._initTimer();
		}
	},
	
	
	toggleStore: function () {
		var storing = Zotero.Debug.storing;
		Zotero.Debug.setStore(!storing);
		if (!storing) {
			this._initTimer();
		}
		else {
			if (this._timerID) {
				this._timer.cancel();
				this._timerID = null;
			}
		}
		this._updateButton();
		this.updateLines();
	},
	
	
	view: function () {
		var uri = "zotero://debug/";
		var features = "menubar=yes,toolbar=no,location=no,scrollbars,centerscreen,resizable";
		
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
		.getService(Components.interfaces.nsIWindowMediator);
		var win = wm.getMostRecentWindow("navigator:browser");
		if (win) {
			win.open(uri, null, features);
		}
		else {
			var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
						.getService(Components.interfaces.nsIWindowWatcher);
			var win = ww.openWindow(null, uri, null, features + ",width=775,height=575", null);
		}
	},
	
	
	// TODO: localize
	submit: function () {
		document.getElementById('debug-output-submit').disabled = true;
		document.getElementById('debug-output-submit-progress').hidden = false;
		
		//<abszh>
		//var url = "https://repo.zotero.org/repo/report?debug=1";
		//var url = "http://192.168.1.10:8888/report?debug=1";
		var url = "http://pzotero.com/repo/report.php?debug=1";
		//</abszh>
		var output = Zotero.Debug.get(
			Zotero.Prefs.get('debug.store.submitSize'),
			Zotero.Prefs.get('debug.store.submitLineLength')
		);
		
		var uploadCallback = function (xmlhttp) {
			document.getElementById('debug-output-submit').disabled = false;
			document.getElementById('debug-output-submit-progress').hidden = true;
			
			Zotero.debug(xmlhttp.responseText);
			
			var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
									.getService(Components.interfaces.nsIPromptService);
			
			if (!xmlhttp.responseXML) {
				ps.alert(
					null,
					Zotero.getString('general.error'),
					'Invalid response from server'
				);
				return;
			}
			var reported = xmlhttp.responseXML.getElementsByTagName('reported');
			if (reported.length != 1) {
				ps.alert(
					null,
					Zotero.getString('general.error'),
					'The server returned an error. Please try again.'
				);
				return;
			}
			
			var reportID = reported[0].getAttribute('reportID');
			ps.alert(
				null,
				"Submitted",
				"Debug output has been sent to the Pajoohyar server.\n\n"
					+ "The Debug ID is D" + reportID + "."
			);
		}
		
		var bufferUploader = function (data) {
			var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
									.getService(Components.interfaces.nsIPromptService);
			
			var oldLen = output.length;
			var newLen = data.length;
			var savings = Math.round(((oldLen - newLen) / oldLen) * 100)
			Zotero.debug("HTTP POST " + newLen + " bytes to " + url
				+ " (gzipped from " + oldLen + " bytes; "
				+ savings + "% savings)");
			
			if (Zotero.HTTP.browserIsOffline()) {
				ps.alert(
					null,
					Zotero.getString(
						'general.error',
						Zotero.appName + " is in offline mode."
					)
				);
				return false;
			}
			
			var req =
				Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].
					createInstance();
			req.open('POST', url, true);
			req.setRequestHeader('Content-Type', "text/plain");
			req.setRequestHeader('Content-Encoding', 'gzip');
			
			req.channel.notificationCallbacks = {
				onProgress: function (request, context, progress, progressMax) {
					var pm = document.getElementById('debug-output-submit-progress');
					pm.mode = 'determined'
					pm.value = progress;
					pm.max = progressMax;
				},
				
				// nsIInterfaceRequestor
				getInterface: function (iid) {
					try {
						return this.QueryInterface(iid);
					}
					catch (e) {
						throw Components.results.NS_NOINTERFACE;
					}
				},
				
				QueryInterface: function(iid) {
					if (iid.equals(Components.interfaces.nsISupports) ||
							iid.equals(Components.interfaces.nsIInterfaceRequestor) ||
							iid.equals(Components.interfaces.nsIProgressEventSink)) {
						return this;
					}
					throw Components.results.NS_NOINTERFACE;
				},

			}
			req.onreadystatechange = function () {
				if (req.readyState == 4) {
					uploadCallback(req);
				}
			};
			try {
				req.sendAsBinary(data);
			}
			catch (e) {
				ps.alert(
					null,
					Zotero.getString('general.error'),
					"An error occurred sending debug output."
				);
			}
		}
		
		// Get input stream from debug output data
		var unicodeConverter =
			Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
				.createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
		unicodeConverter.charset = "UTF-8";
		var bodyStream = unicodeConverter.convertToInputStream(output);
		
		// Get listener for when compression is done
		var listener = new Zotero.BufferedInputListener(bufferUploader);
		
		// Initialize stream converter
		var converter =
			Components.classes["@mozilla.org/streamconv;1?from=uncompressed&to=gzip"]
				.createInstance(Components.interfaces.nsIStreamConverter);
		converter.asyncConvertData("uncompressed", "gzip", listener, null);
		
		// Send input stream to stream converter
		var pump = Components.classes["@mozilla.org/network/input-stream-pump;1"].
				createInstance(Components.interfaces.nsIInputStreamPump);
		pump.init(bodyStream, -1, -1, 0, 0, true);
		pump.asyncRead(converter, null);
	},
	
	
	clear: function () {
		Zotero.Debug.clear();
		this.updateLines();
	},
	
	
	updateLines: function () {
		var enabled = Zotero.Debug.storing;
		var lines = Zotero.Debug.count();
		document.getElementById('debug-output-lines').value = lines;
		var empty = lines == 0;
		document.getElementById('debug-output-view').disabled = !enabled && empty;
		document.getElementById('debug-output-clear').disabled = empty;
		document.getElementById('debug-output-submit').disabled = empty;
	},
	
	
	_initTimer: function () {
		this._timer = Components.classes["@mozilla.org/timer;1"].
			createInstance(Components.interfaces.nsITimer);
		this._timer.initWithCallback({
			notify: function() {
				Zotero_Preferences.Debug_Output.updateLines();
			}
		}, 10000, Components.interfaces.nsITimer.TYPE_REPEATING_SLACK);
	},
	
	
	_updateButton: function () {
		var storing = Zotero.Debug.storing
		
		var button = document.getElementById('debug-output-enable');
		if (storing) {
			button.label = Zotero.getString('general.disable');
		}
		else {
			button.label = Zotero.getString('general.enable');
		}
	},
	
	
	onUnload: function () {
		if (this._timer) {
			this._timer.cancel();
		}
	}
}

function onOpenURLSelected()
{
	var openURLServerField = document.getElementById('openURLServerField');
	var openURLVersionMenu = document.getElementById('openURLVersionMenu');
	var openURLMenu = document.getElementById('openURLMenu');
	
	if(openURLMenu.value == "custom")
	{
		openURLServerField.focus();
	}
	else
	{
		openURLServerField.value = openURLResolvers[openURLMenu.selectedIndex]['url'];
		openURLVersionMenu.value = openURLResolvers[openURLMenu.selectedIndex]['version'];
		Zotero.Prefs.set("openURL.resolver", openURLResolvers[openURLMenu.selectedIndex]['url']);
		Zotero.Prefs.set("openURL.version", openURLResolvers[openURLMenu.selectedIndex]['version']);
	}
}

function onOpenURLCustomized()
{
	document.getElementById('openURLMenu').value = "custom";
}

/** STYLES **/

/**
 * Refreshes the list of styles in the styles pane
 * @param {String} cslID Style to select
 */
function refreshStylesList(cslID) {
	var treechildren = document.getElementById('styleManager-rows');
	while (treechildren.hasChildNodes()) {
		treechildren.removeChild(treechildren.firstChild);
	}
	
	var styles = Zotero.Styles.getVisible();
	
	var selectIndex = false;
	var i = 0;
	for each(var style in styles) {
		var treeitem = document.createElement('treeitem');
		var treerow = document.createElement('treerow');
		var titleCell = document.createElement('treecell');
		var updatedCell = document.createElement('treecell');
		var cslCell = document.createElement('treecell');
		
		if (style.updated) {
			var updatedDate = Zotero.Date.formatDate(Zotero.Date.strToDate(style.updated), true);
		}
		else {
			var updatedDate = '';
		}
		
		treeitem.setAttribute('id', 'zotero-csl-' + style.styleID);
		titleCell.setAttribute('label', style.title);
		updatedCell.setAttribute('label', updatedDate);
		// if not EN
		if(style.type == "csl") {
			cslCell.setAttribute('src', 'chrome://zotero/skin/tick.png');
		}
		
		treerow.appendChild(titleCell);
		treerow.appendChild(updatedCell);
		treerow.appendChild(cslCell);
		treeitem.appendChild(treerow);
		treechildren.appendChild(treeitem);
		
		if (cslID == style.styleID) {
			document.getElementById('styleManager').view.selection.select(i);
		}
		i++;
	}
}

/**
 * Adds a new style to the style pane
 **/
function addStyle() {	
	const nsIFilePicker = Components.interfaces.nsIFilePicker;
	var fp = Components.classes["@mozilla.org/filepicker;1"]
			.createInstance(nsIFilePicker);
	fp.init(window, Zotero.getString("zotero.preferences.styles.addStyle"), nsIFilePicker.modeOpen);
	
	fp.appendFilter("CSL Style", "*.csl");
	fp.appendFilter("ENS Style", "*.ens");
	
	var rv = fp.show();
	if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace) {
		Zotero.Styles.install(fp.file);
	}
}

/**
 * Deletes selected styles from the styles pane
 **/
function deleteStyle() {
	// get selected cslIDs
	var tree = document.getElementById('styleManager');
	var treeItems = tree.lastChild.childNodes;
	var cslIDs = [];
	var start = {};
	var end = {};
	var nRanges = tree.view.selection.getRangeCount();
	for(var i=0; i<nRanges; i++) {
		tree.view.selection.getRangeAt(i, start, end);
		for(var j=start.value; j<=end.value; j++) {
			cslIDs.push(treeItems[j].getAttribute('id').substr(11));
		}
	}
	
	if(cslIDs.length == 0) {
		return;
	} else if(cslIDs.length == 1) {
		var selectedStyle = Zotero.Styles.get(cslIDs[0])
		var text = Zotero.getString('styles.deleteStyle', selectedStyle.title);
	} else {
		var text = Zotero.getString('styles.deleteStyles');
	}
	
	var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
		.getService(Components.interfaces.nsIPromptService);
	if(ps.confirm(null, '', text)) {
		// delete if requested
		if(cslIDs.length == 1) {
			selectedStyle.remove();
		} else {
			for(var i=0; i<cslIDs.length; i++) {
				Zotero.Styles.get(cslIDs[i]).remove();
			}
		}
		
		this.refreshStylesList();
		document.getElementById('styleManager-delete').disabled = true;
	}
}

/**
 * Shows an error if import fails
 **/
function styleImportError() {
	alert(Zotero.getString('styles.installError', "This"));
}

/**PROXIES**/

/**
 * Adds a proxy to the proxy pane
 */
function showProxyEditor(index) {
	if(index == -1) return;
	window.openDialog('chrome://zotero/content/preferences/proxyEditor.xul',
		"zotero-preferences-proxyEditor", "chrome, modal", index !== undefined ? proxies[index] : null);
	refreshProxyList();
}

/**
 * Deletes the currently selected proxy
 */
function deleteProxy() {
	if(document.getElementById('proxyTree').currentIndex == -1) return;
	proxies[document.getElementById('proxyTree').currentIndex].erase();
	refreshProxyList();
	document.getElementById('proxyTree-delete').disabled = true;
}

/**
 * Refreshes the proxy pane
 */
function refreshProxyList() {
	if(!document.getElementById("zotero-prefpane-proxies")) return;
	
	// get and sort proxies
	proxies = Zotero.Proxies.proxies.slice();
	for(var i=0; i<proxies.length; i++) {
		if(!proxies[i].proxyID) {
			proxies.splice(i, 1);
			i--;
		}
	}
	proxies = proxies.sort(function(a, b) {
		if(a.multiHost) {
			if(b.multiHost) {
				if(a.hosts[0] < b.hosts[0]) {
					return -1;
				} else {
					return 1;
				}
			} else {
				return -1;
			}
		} else if(b.multiHost) {
			return 1;
		}
		
		if(a.scheme < b.scheme) {
			return -1;
		} else if(b.scheme > a.scheme) {
			return 1;
		}
		
		return 0;
	});
	
	// erase old children
	var treechildren = document.getElementById('proxyTree-rows');
	while (treechildren.hasChildNodes()) {
		treechildren.removeChild(treechildren.firstChild);
	}
	
	// add proxies to list
	for (var i=0; i<proxies.length; i++) {
		var treeitem = document.createElement('treeitem');
		var treerow = document.createElement('treerow');
		var hostnameCell = document.createElement('treecell');
		var schemeCell = document.createElement('treecell');
		
		hostnameCell.setAttribute('label', proxies[i].multiHost ? Zotero.getString("proxies.multiSite") : proxies[i].hosts[0]);
		schemeCell.setAttribute('label', proxies[i].scheme);
		
		treerow.appendChild(hostnameCell);
		treerow.appendChild(schemeCell);
		treeitem.appendChild(treerow);
		treechildren.appendChild(treeitem);
	}
	
	document.getElementById('proxyTree').currentIndex = -1;
	document.getElementById('proxyTree-delete').disabled = true;
	document.getElementById('zotero-proxies-transparent').checked = Zotero.Prefs.get("proxies.transparent");
	document.getElementById('zotero-proxies-autoRecognize').checked = Zotero.Prefs.get("proxies.autoRecognize");
	document.getElementById('zotero-proxies-disableByDomain-checkbox').checked = Zotero.Prefs.get("proxies.disableByDomain");
	document.getElementById('zotero-proxies-disableByDomain-textbox').value = Zotero.Prefs.get("proxies.disableByDomainString");
}

/**
 * Updates proxy autoRecognize and transparent settings based on checkboxes
 */
function updateProxyPrefs() {
	var transparent = document.getElementById('zotero-proxies-transparent').checked;
	Zotero.Prefs.set("proxies.transparent", transparent);
	Zotero.Prefs.set("proxies.autoRecognize", document.getElementById('zotero-proxies-autoRecognize').checked);	
	Zotero.Prefs.set("proxies.disableByDomainString", document.getElementById('zotero-proxies-disableByDomain-textbox').value);
	Zotero.Prefs.set("proxies.disableByDomain", document.getElementById('zotero-proxies-disableByDomain-checkbox').checked &&
			document.getElementById('zotero-proxies-disableByDomain-textbox').value != "");
	
	Zotero.Proxies.init();
	
	document.getElementById('proxyTree-add').disabled =
		document.getElementById('proxyTree-delete').disabled =
		document.getElementById('proxyTree').disabled = 
		document.getElementById('zotero-proxies-autoRecognize').disabled = 
		document.getElementById('zotero-proxies-disableByDomain-checkbox').disabled = 
		document.getElementById('zotero-proxies-disableByDomain-textbox').disabled = !transparent;
}

/**
 * Determines if there are word processors, and if not, enables no word processor message
 */
function updateWordProcessorInstructions() {
	if(document.getElementById("wordProcessors").childNodes.length == 2) {
		document.getElementById("wordProcessors-noWordProcessorPluginsInstalled").hidden = undefined;
	}
	if(Zotero.isStandalone) {
		document.getElementById("wordProcessors-getWordProcessorPlugins").hidden = true;
	}
}

/**
 * Sets "Status bar icon" to "None" if Zotero is set to load in separate tab on Fx 4
 */
function handleShowInPreferenceChange() {
	var showInSeparateTab = document.getElementById("zotero-prefpane-general-showIn-separateTab");
	if(Zotero.isFx4) {
		if(showInSeparateTab.selected) {
			document.getElementById('statusBarIcon').selectedItem = document.getElementById('statusBarIcon-none');
			Zotero.Prefs.set("statusBarIcon", 0);
		} else if(Zotero.isFx4) {
			document.getElementById('statusBarIcon').selectedItem = document.getElementById('statusBarIcon-full');
			Zotero.Prefs.set("statusBarIcon", 2);
		}
	}
}

/*
//<abszh>
function citationLanguage_change() {
	alert("going to write this:"+document.getElementById('citationLanguageMenu').value);
	Zotero.Prefs.set("citationLanguage", document.getElementById('citationLanguageMenu').value);
}

function citationLanguage_load() {
	var theLanguage=Zotero.Prefs.get("citationLanguage");
	alert("pref is:"+theLanguage.toSource());
	var theMenu=document.getElementById('citationLanguageMenu');
	var foundIndex=0;
	for (i=0; i<theMenu.itemCount; i++)	{
		var theMenuItem=theMenu.getItemAtIndex(i).value;
		alert("i is:"+i);
		alert(theMenuItem.toSource());
		if (theMenuItem==theLanguage) {
			foundIndex=i;
			break;
		}
	}
	theMenu.selectedIndex=foundIndex;
}
*/
	
//<web.ebox>
function direction_update() {
	 Zotero.Prefs.set("user.direction", document.getElementById('direction').value);
}

function language_update() {
	  var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefService);

		prefs.setCharPref("general.useragent.locale",document.getElementById('language').value); 

}
//</web.ebox>

function separate_update() {
	 Zotero.Prefs.set('crcis.dontSeparatePersianAndArabic', document.getElementById('separate-checkbox').checked);
}


function searchSettings_update() {
	 Zotero.Prefs.set('crcis.persianSearch', document.getElementById('persianSearch-checkbox').checked);
}


//<abszh>
function separate1_update() {
		//Zotero.Utilities.writeToDiagFile("separate-checkbox:"+document.getElementById('separate-checkbox').checked+"\r\n");
	Zotero.Prefs.set('crcis.separateByLanguage', document.getElementById('separate-checkbox1').checked);
	var sep1=document.getElementById('separate-checkbox1').checked;
	if (sep1) {
		document.getElementById('separate-checkbox').disabled=false;
		document.getElementById('bibliographyFirstLanguageMenu').disabled=false;
		document.getElementById('bibliographySecondLanguageMenu').disabled=false;
	} else {
		document.getElementById('separate-checkbox').disabled=true;
		document.getElementById('bibliographyFirstLanguageMenu').disabled=true;
		document.getElementById('bibliographySecondLanguageMenu').disabled=true;
	}		
	 
}
//</abszh>
	
		