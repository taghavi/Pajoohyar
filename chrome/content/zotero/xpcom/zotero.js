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

//<abszh>
/*
const ZOTERO_CONFIG = {
	GUID: 'pajoohyar@pajoohyar.ir',
	DB_REBUILD: false, // erase DB and recreate from schema
	REPOSITORY_URL: 'https://repo.zotero.org/repo',
	REPOSITORY_CHECK_INTERVAL: 86400, // 24 hours
	REPOSITORY_RETRY_INTERVAL: 3600, // 1 hour
	BASE_URI: 'http://zotero.org/',
	WWW_BASE_URL: 'http://www.zotero.org/',
	SYNC_URL: 'https://sync.zotero.org/',
	API_URL: 'https://api.zotero.org/',
	PREF_BRANCH: 'extensions.zotero.'
};
*/
const ZOTERO_CONFIG = {
	GUID: 'pajoohyar@pajoohyar.ir',
	DB_REBUILD: false, // erase DB and recreate from schema
	REPOSITORY_URL: 'http://pzotero.com/repo',
	REPOSITORY_CHECK_INTERVAL: 86400, // 24 hours
	REPOSITORY_RETRY_INTERVAL: 3600, // 1 hour
	BASE_URI: 'http://zotero.org/',
	WWW_BASE_URL: 'http://www.zotero.org/',
	SYNC_URL: 'https://sync.zotero.org/',
	API_URL: 'https://api.zotero.org/',
	PREF_BRANCH: 'extensions.zotero.'
};
//</abszh>

// Fx4.0b8+ use implicit SJOWs and get rid of explicit XPCSafeJSObjectWrapper constructor
// Ugly hack to get around this until we can just kill the XPCSafeJSObjectWrapper calls (when we
// drop Fx3.6 support)
try {
	XPCSafeJSObjectWrapper;
} catch(e) {
	eval("var XPCSafeJSObjectWrapper = function(arg) { return arg }");
}

/*
 * Core functions
 */
var Zotero = new function(){
	// Privileged (public) methods
	this.init = init;
	this.stateCheck = stateCheck;
	this.getProfileDirectory = getProfileDirectory;
	this.getInstallDirectory = getInstallDirectory;
	this.getZoteroDirectory = getZoteroDirectory;
	this.getStorageDirectory = getStorageDirectory;
	this.getZoteroDatabase = getZoteroDatabase;
	this.chooseZoteroDirectory = chooseZoteroDirectory;
	this.debug = debug;
	this.log = log;
	this.logError = logError;
	this.getErrors = getErrors;
	this.getSystemInfo = getSystemInfo;
	this.varDump = varDump;
	this.safeDebug = safeDebug;
	this.getString = getString;
	this.localeJoin = localeJoin;
	this.getLocaleCollation = getLocaleCollation;
	this.setFontSize = setFontSize;
	this.flattenArguments = flattenArguments;
	this.getAncestorByTagName = getAncestorByTagName;
	this.join = join;
	this.randomString = randomString;
	this.moveToUnique = moveToUnique;
	
	// Public properties
	this.initialized = false;
	this.skipLoading = false;
	this.startupError;
	this.__defineGetter__("startupErrorHandler", function() { return _startupErrorHandler; });
	this.version;
	this.platform;
	this.locale;
	this.dir; // locale direction: 'ltr' or 'rtl'
	this.isMac;
	this.isWin;
	this.initialURL; // used by Schema to show the changelog on upgrades
	
	
	this.__defineGetter__('userID', function () {
		var sql = "SELECT value FROM settings WHERE "
					+ "setting='account' AND key='userID'";
		return Zotero.DB.valueQuery(sql);
	});
	
	this.__defineSetter__('userID', function (val) {
		var sql = "REPLACE INTO settings VALUES ('account', 'userID', ?)";
		Zotero.DB.query(sql, parseInt(val));
	});
	
	this.__defineGetter__('libraryID', function () {
		var sql = "SELECT value FROM settings WHERE "
					+ "setting='account' AND key='libraryID'";
		return Zotero.DB.valueQuery(sql);
	});
	
	this.__defineSetter__('libraryID', function (val) {
		var sql = "REPLACE INTO settings VALUES ('account', 'libraryID', ?)";
		Zotero.DB.query(sql, parseInt(val));
	});
	
	this.__defineGetter__('username', function () {
		var sql = "SELECT value FROM settings WHERE "
					+ "setting='account' AND key='username'";
		return Zotero.DB.valueQuery(sql);
	});
	
	this.__defineSetter__('username', function (val) {
		var sql = "REPLACE INTO settings VALUES ('account', 'username', ?)";
		Zotero.DB.query(sql, val);
	});
	
	this.getActiveZoteroPane = function() {
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator);
		var win = wm.getMostRecentWindow("navigator:browser");
		return win.ZoteroPane;
	};
	
	this.getLocalUserKey = function (generate) {
		if (_localUserKey) {
			return _localUserKey;
		}
		
		var sql = "SELECT value FROM settings WHERE "
					+ "setting='account' AND key='localUserKey'";
		var key = Zotero.DB.valueQuery(sql);
		
		// Generate a local user key if we don't have a global library id
		if (!key && generate) {
			key = Zotero.randomString(8);
			var sql = "INSERT INTO settings VALUES ('account', 'localUserKey', ?)";
			Zotero.DB.query(sql, key);
		}
		_localUserKey = key;
		return key;
	};
	
	/**
	 * @property	{Boolean}	waiting		Whether Zotero is waiting for other
	 *										main thread events to be processed
	 */
	this.__defineGetter__('waiting', function () _waiting);
	
	/**
	 * @property	{Boolean}	locked		Whether all Zotero panes are locked
	 *										with an overlay
	 */
	this.__defineGetter__('locked', function () _locked);
	
	/**
	 * @property	{Boolean}	suppressUIUpdates	Don't update UI on Notifier triggers
	 */
	this.suppressUIUpdates = false;
	
	var _startupErrorHandler;
	var _zoteroDirectory = false;
	var _localizedStringBundle;
	var _localUserKey;
	var _waiting;
	
	var _locked;
	var _unlockCallbacks = [];
	var _progressMeters;
	var _lastPercentage;
	
	/**
	 * Maintains nsITimers to be used when Zotero.wait() completes (to reduce performance penalty
	 * of initializing new objects)
	 */
	var _waitTimers = [];
	
	/**
	 * Maintains nsITimerCallbacks to be used when Zotero.wait() completes
	 */
	var _waitTimerCallbacks = [];
	
	/*
	 * Maintains running nsITimers in global scope, so that they don't disappear randomly
	 */
	var _runningTimers = [];
	
	/**
	 * Initialize the extension
	 */
	function init(){
		if (this.initialized || this.skipLoading) {
			return false;
		}
		
		var start = (new Date()).getTime()
		
		// Register shutdown handler to call Zotero.shutdown()
		var observerService = Components.classes["@mozilla.org/observer-service;1"]
			.getService(Components.interfaces.nsIObserverService);
		observerService.addObserver({
			observe: Zotero.shutdown
		}, "quit-application", false);
		
		// Load in the preferences branch for the extension
		Zotero.Prefs.init();
		
		Zotero.Debug.init();
		
		this.mainThread = Components.classes["@mozilla.org/thread-manager;1"].getService().mainThread;
		
		var appInfo =
			Components.classes["@mozilla.org/xre/app-info;1"].
				getService(Components.interfaces.nsIXULAppInfo);
		var versionComparator = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
			.getService(Components.interfaces.nsIVersionComparator);
		this.isFx = true;
		this.isFx3 = appInfo.platformVersion.indexOf('1.9') === 0;
		this.isFx35 = appInfo.platformVersion.indexOf('1.9.1') === 0;
		this.isFx31 = this.isFx35;
		this.isFx36 = appInfo.platformVersion.indexOf('1.9.2') === 0;
		this.isFx4 = versionComparator.compare(appInfo.platformVersion[0], "2.0a1") >= 0;
		this.isFx5 = versionComparator.compare(appInfo.platformVersion[0], "5.0a1") >= 0;
		
		this.isStandalone = appInfo.ID == ZOTERO_CONFIG['GUID'];
		if(this.isStandalone) {
			this.version = appInfo.version;
		} else {
			// Load in the extension version from the extension manager
			if(this.isFx4) {
				AddonManager.getAddonByID(ZOTERO_CONFIG['GUID'],
					function(addon) { Zotero.version = addon.version; Zotero.addon = addon; });
			} else {
				var gExtensionManager =
					Components.classes["@mozilla.org/extensions/manager;1"]
						.getService(Components.interfaces.nsIExtensionManager);
				this.version
					= gExtensionManager.getItemForID(ZOTERO_CONFIG['GUID']).version;
			}
		}
		
		// OS platform
		var win = Components.classes["@mozilla.org/appshell/appShellService;1"]
			   .getService(Components.interfaces.nsIAppShellService)
			   .hiddenDOMWindow;
		this.platform = win.navigator.platform;
		this.isMac = (this.platform.substr(0, 3) == "Mac");
		this.isWin = (this.platform.substr(0, 3) == "Win");
		this.isLinux = (this.platform.substr(0, 5) == "Linux");
		this.oscpu = win.navigator.oscpu;
		
		// Locale
		var prefs = Components.classes["@mozilla.org/preferences-service;1"]
						.getService(Components.interfaces.nsIPrefService);
		this.locale = prefs.getBranch("general.useragent.").getCharPref("locale");
		if (this.locale.length == 2) {
			this.locale = this.locale + '-' + this.locale.toUpperCase();
		}
		
		// Load in the localization stringbundle for use by getString(name)
		var stringBundleService =
			Components.classes["@mozilla.org/intl/stringbundle;1"]
			.getService(Components.interfaces.nsIStringBundleService);
		var localeService = Components.classes['@mozilla.org/intl/nslocaleservice;1'].
							getService(Components.interfaces.nsILocaleService);
		var appLocale = localeService.getApplicationLocale();
		
		_localizedStringBundle = stringBundleService.createBundle(
			"chrome://zotero/locale/zotero.properties", appLocale);
		
		// Also load the brand as appName
		var brandBundle = stringBundleService.createBundle(
			"chrome://branding/locale/brand.properties", appLocale);
		this.appName = brandBundle.GetStringFromName("brandShortName");
		
		// Set the locale direction to Zotero.dir
		// DEBUG: is there a better way to get the entity from JS?
		var xmlhttp = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
						.createInstance();
		xmlhttp.open('GET', 'chrome://global/locale/global.dtd', false);
		xmlhttp.overrideMimeType('text/plain');
		xmlhttp.send(null);
		var matches = xmlhttp.responseText.match(/(ltr|rtl)/);
		if (matches && matches[0] == 'rtl') {
			this.dir = 'rtl';
		}
		else {
			this.dir = 'ltr';
		}
		
		try {
			var dataDir = this.getZoteroDirectory();
		}
		catch (e) {
			// Zotero dir not found
			if (e.name == 'NS_ERROR_FILE_NOT_FOUND') {
				this.startupError = Zotero.getString('dataDir.notFound');
				_startupErrorHandler = function() {
					var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
						.getService(Components.interfaces.nsIWindowMediator);
					var win = wm.getMostRecentWindow('navigator:browser');
					
					var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].
							createInstance(Components.interfaces.nsIPromptService);
					var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_OK)
						+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_IS_STRING)
						+ (ps.BUTTON_POS_2) * (ps.BUTTON_TITLE_IS_STRING);
					var index = ps.confirmEx(win,
						Zotero.getString('general.error'),
						this.startupError + '\n\n' +
						Zotero.getString('dataDir.previousDir') + ' '
							+ Zotero.Prefs.get('lastDataDir'),
						buttonFlags, null,
						Zotero.getString('dataDir.useProfileDir'),
						Zotero.getString('general.locate'),
						null, {});
					
					// Revert to profile directory
					if (index == 1) {
						Zotero.chooseZoteroDirectory(false, true);
					}
					// Locate data directory
					else if (index == 2) {
						Zotero.chooseZoteroDirectory();
					}
				}
				return;
			} else if(e.name == "ZOTERO_DIR_MAY_EXIST") {
				var app = Zotero.isStandalone ? Zotero.getString('app.standalone') : Zotero.getString('app.firefox');
				var altApp = !Zotero.isStandalone ? Zotero.getString('app.standalone') : Zotero.getString('app.firefox');
				
				var message = Zotero.getString("dataDir.standaloneMigration.description", [app, altApp]);
				if(e.multipleProfiles) {
					message += "\n\n"+Zotero.getString("dataDir.standaloneMigration.multipleProfiles", [app, altApp]);
				}
				
				var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].
						createInstance(Components.interfaces.nsIPromptService);
				var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_YES)
					+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_NO)
					+ (ps.BUTTON_POS_2) * (ps.BUTTON_TITLE_IS_STRING);
				var index = ps.confirmEx(null, Zotero.getString("dataDir.standaloneMigration.title"), message,
					buttonFlags, null, null,
					Zotero.getString('dataDir.standaloneMigration.selectCustom'),
					null, {});
				
				// Migrate data directory
				if (index == 0) {
					// copy prefs
					var prefsFile = e.profile.clone();
					prefsFile.append("prefs.js");
					if(prefsFile.exists()) {
						// build sandbox
						var sandbox = new Components.utils.Sandbox("http://www.example.com/");
						Components.utils.evalInSandbox(
							"var prefs = {};"+
							"function user_pref(key, val) {"+
								"prefs[key] = val;"+
							"}"
						, sandbox);
						
						// remove comments
						var prefsJs = Zotero.File.getContents(prefsFile);
						prefsJs = prefsJs.replace(/^#[^\r\n]*$/mg, "");
						
						// evaluate
						Components.utils.evalInSandbox(prefsJs, sandbox);
						var prefs = new XPCSafeJSObjectWrapper(sandbox.prefs);
						for(var key in prefs) {
							if(key.substr(0, ZOTERO_CONFIG.PREF_BRANCH.length) == ZOTERO_CONFIG.PREF_BRANCH) {
								Zotero.Prefs.set(key.substr(ZOTERO_CONFIG.PREF_BRANCH.length), prefs[key]);
							}
						}
					}
					
					// also set data dir if no custom data dir is now defined
					if(!Zotero.Prefs.get("useDataDir")) {
						var dir = e.dir.QueryInterface(Components.interfaces.nsILocalFile);
						Zotero.Prefs.set('dataDir', dir.persistentDescriptor);
						Zotero.Prefs.set('lastDataDir', dir.path);
						Zotero.Prefs.set('useDataDir', true);
					}
				}
				// Create new data directory
				else if (index == 1) {
					Zotero.File.createDirectoryIfMissing(e.curDir);
				}
				// Locate new data directory
				else if (index == 2) {
					Zotero.chooseZoteroDirectory(true);
				}
				var dataDir = this.getZoteroDirectory();
			}
			// DEBUG: handle more startup errors
			else {
				throw (e);
				return false;
			}
		}
		
		Zotero.VersionHeader.init();
		
		// Check for DB restore
		var restoreFile = dataDir.clone();
		restoreFile.append('restore-from-server');
		if (restoreFile.exists()) {
			try {
				// TODO: better error handling
				
				// TODO: prompt for location
				// TODO: Back up database
				
				restoreFile.remove(false);
				
				var dbfile = Zotero.getZoteroDatabase();
				dbfile.remove(false);
				
				// Recreate database with no quick start guide
				Zotero.Schema.skipDefaultData = true;
				Zotero.Schema.updateSchema();
				
				this.restoreFromServer = true;
			}
			catch (e) {
				// Restore from backup?
				alert(e);
			}
		}
		
		try {
			// Test read access
			Zotero.DB.test();
			
			var dbfile = Zotero.getZoteroDatabase();
			
			// Test write access on Zotero data directory
			if (!dbfile.parent.isWritable()) {
				var msg = 'Cannot write to ' + dbfile.parent.path + '/';
			}
			// Test write access on Zotero database
			else if (!dbfile.isWritable()) {
				var msg = 'Cannot write to ' + dbfile.path;
			}
			else {
				var msg = false;
			}
			
			if (msg) {
				var e = {
					name: 'NS_ERROR_FILE_ACCESS_DENIED',
					message: msg,
					toString: function () {
						return this.name + ': ' + this.message; 
					}
				};
				throw (e);
			}
		}
		catch (e) {
			if (e.name == 'NS_ERROR_FILE_ACCESS_DENIED') {
				var msg = Zotero.localeJoin([
					Zotero.getString('startupError.databaseCannotBeOpened'),
					Zotero.getString('startupError.checkPermissions')
				]);
				this.startupError = msg;
			} else if(e.name == "NS_ERROR_STORAGE_BUSY" || e.result == 2153971713) {
				var msg = Zotero.localeJoin([
					Zotero.getString('startupError.databaseInUse'),
					Zotero.getString(Zotero.isStandalone ? 'startupError.closeFirefox' : 'startupError.closeStandalone')
				]);
				this.startupError = msg;
			}
			
			Components.utils.reportError(e);
			this.skipLoading = true;
			return;
		}
		
		// Add notifier queue callbacks to the DB layer
		Zotero.DB.addCallback('begin', Zotero.Notifier.begin);
		Zotero.DB.addCallback('commit', Zotero.Notifier.commit);
		Zotero.DB.addCallback('rollback', Zotero.Notifier.reset);
		
		Zotero.Fulltext.init();
		
		// Require >=2.1b3 database to ensure proper locking
		if (this.isStandalone && Zotero.Schema.getDBVersion('system') > 0 && Zotero.Schema.getDBVersion('system') < 31) {
			var appStartup = Components.classes["@mozilla.org/toolkit/app-startup;1"]
					.getService(Components.interfaces.nsIAppStartup);
			
			var dir = Zotero.getProfileDirectory();
			dir.append('zotero');
			
			var zs = Zotero.getString('app.standalone');
			var zf = Zotero.getString('app.firefox');
			// TODO: localize
			var msg = "The currently selected data directory is not compatible "
					+ "with " + zs + ", which can share a database only with "
					+ zf + " 2.1b3 or later."
					+ "\n\n"
					+ "Upgrade to the latest version of " + zf + " first or select a "
					+ "different data directory for use with " + zs + ".";
					
			var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
						.createInstance(Components.interfaces.nsIPromptService);
			var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING)
				+ (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_IS_STRING)
				+ (ps.BUTTON_POS_2) * (ps.BUTTON_TITLE_IS_STRING)
				+ ps.BUTTON_POS_2_DEFAULT;
			var index = ps.confirmEx(
				null,
				// TODO: localize
				"Incompatible Database Version",
				msg,
				buttonFlags,
				"Use Default",
				Zotero.getString('dataDir.standaloneMigration.selectCustom'),
				"Quit",
				null,
				{}
			);
			
			var quit = false;
			
			// Default location
			if (index == 0) {
				Zotero.File.createDirectoryIfMissing(dir);
				
				Zotero.Prefs.set("useDataDir", false)
				
				appStartup.quit(
					Components.interfaces.nsIAppStartup.eAttemptQuit
						| Components.interfaces.nsIAppStartup.eRestart
				);
			}
			// Select new data directory
			else if (index == 1) {
				var dir = Zotero.chooseZoteroDirectory(true);
				if (!dir) {
					quit = true;
				}
			}
			else {
				quit = true;
			}
			
			if (quit) {
				appStartup.quit(Components.interfaces.nsIAppStartup.eAttemptQuit);
			}
			
			this.skipLoading = true;
			return false;
		}
		
		// Trigger updating of schema and scrapers
		if (Zotero.Schema.userDataUpgradeRequired()) {
			var upgraded = Zotero.Schema.showUpgradeWizard();
			if (!upgraded) {
				this.skipLoading = true;
				return false;
			}
		}
		// If no userdata upgrade, still might need to process system
		else {
			try {
				var updated = Zotero.Schema.updateSchema();
			}
			catch (e) {
				if (typeof e == 'string' && e.match('newer than SQL file')) {
					var kbURL = "http://zotero.org/support/kb/newer_db_version";
					var msg = Zotero.localeJoin([
							Zotero.getString('startupError.zoteroVersionIsOlder'),
							Zotero.getString('startupError.zoteroVersionIsOlder.upgrade')
						]) + "\n\n"
						+ Zotero.getString('startupError.zoteroVersionIsOlder.current', Zotero.version) + "\n\n"
						+ Zotero.getString('general.seeForMoreInformation', kbURL);
					this.startupError = msg;
				}
				else {
					this.startupError = Zotero.getString('startupError.databaseUpgradeError');
				}
				this.skipLoading = true;
				Components.utils.reportError(e);
				return false;
			}
		}
		
		Zotero.DB.startDummyStatement();
		Zotero.Schema.updateFromRepository();

		//<abszh>
		//Zotero.Schema.updateNoorLibrary();
		//</abszh>
		
		// Populate combined tables for custom types and fields -- this is likely temporary
		if (!upgraded && !updated) {
			Zotero.Schema.updateCustomTables();
		}
		
		// Initialize various services
		Zotero.Integration.init();
		
		if(Zotero.Prefs.get("connector.enabled")) {
			Zotero.Connector.init();
		}
		
		Zotero.Zeroconf.init();
		
		Zotero.Sync.init();
		Zotero.Sync.Runner.init();
		
		Zotero.MIMETypeHandler.init();
		Zotero.Proxies.init();
		
		// Initialize keyboard shortcuts
		Zotero.Keys.init();
		
		// Initialize Locate Manager
		Zotero.LocateManager.init();
		
		this.initialized = true;
		Zotero.debug("Initialized in "+((new Date()).getTime() - start)+" ms");
		
		return true;
	}
	
	
	/*
	 * Check if a DB transaction is open and, if so, disable Zotero
	 */
	function stateCheck() {
		if (Zotero.DB.transactionInProgress()) {
			this.initialized = false;
			this.skipLoading = true;
			return false;
		}
		
		return true;
	}
	
	
	this.shutdown = function (subject, topic, data) {
		Zotero.debug("Shutting down Zotero");
		Zotero.removeTempDirectory();
		return true;
	}
	
	
	function getProfileDirectory(){
		return Components.classes["@mozilla.org/file/directory_service;1"]
			 .getService(Components.interfaces.nsIProperties)
			 .get("ProfD", Components.interfaces.nsIFile);
	}
	
	
	function getInstallDirectory() {
		if(this.isStandalone) {
			var dir = Components.classes["@mozilla.org/file/directory_service;1"]
				.getService(Components.interfaces.nsIProperties)
				.get("CurProcD", Components.interfaces.nsILocalFile);
			return dir;
		} else {
			if(this.isFx4) {
				while(Zotero.addon === undefined) Zotero.mainThread.processNextEvent(true);
				var resourceURI = Zotero.addon.getResourceURI();
				return resourceURI.QueryInterface(Components.interfaces.nsIFileURL).file;
			} else {
				var id = ZOTERO_CONFIG.GUID;
				var em = Components.classes["@mozilla.org/extensions/manager;1"].
							getService(Components.interfaces.nsIExtensionManager);
				return em.getInstallLocation(id).getItemLocation(id);
			}
		}
	}
	
	function getDefaultProfile(prefDir) {
		// find profiles.ini file
		var profilesIni = prefDir.clone();
		profilesIni.append("profiles.ini");
		if(!profilesIni.exists()) return false;
		var iniContents = Zotero.File.getContents(profilesIni);
		
		// cheap and dirty ini parser
		var curSection = null;
		var defaultSection = null;
		var nSections = 0;
		for each(var line in iniContents.split(/(?:\r?\n|\r)/)) {
			let tline = line.trim();
			if(tline[0] == "[" && tline[tline.length-1] == "]") {
				curSection = {};
				if(tline != "[General]") nSections++;
			} else if(curSection && tline != "") {
				let equalsIndex = tline.indexOf("=");
				let key = tline.substr(0, equalsIndex);
				let val = tline.substr(equalsIndex+1);
				curSection[key] = val;
				if(key == "Default" && val == "1") {
					defaultSection = curSection;
				}
			}
		}
		if(!defaultSection && curSection) defaultSection = curSection;
		
		// parse out ini to reveal profile
		if(!defaultSection || !defaultSection.Path) return false;
		
		
		if(defaultSection.IsRelative) {
			var defaultProfile = prefDir.clone();
			[defaultProfile.append(dir) for each(dir in defaultSection.Path.split("/"))];
		} else {
			var defaultProfile = Components.classes["@mozilla.org/file/local;1"]
				.createInstance(Components.interfaces.nsILocalFile);
			defaultProfile.initWithPath(defaultSection.Path);
		}
		
		if(!defaultProfile.exists()) return false;
		return [defaultProfile, nSections > 1];
	}
	
	function getZoteroDirectory(){
		if (_zoteroDirectory != false) {
			// Return a clone of the file pointer so that callers can modify it
			return _zoteroDirectory.clone();
		}
		
		if (Zotero.Prefs.get('useDataDir')) {
			var file = Components.classes["@mozilla.org/file/local;1"].
				createInstance(Components.interfaces.nsILocalFile);
			try {
				file.persistentDescriptor = Zotero.Prefs.get('dataDir');
			}
			catch (e) {
				Zotero.debug("Persistent descriptor in extensions.zotero.dataDir did not resolve", 1);
				e = { name: "NS_ERROR_FILE_NOT_FOUND" };
				throw (e);
			}
			if (!file.exists()) {
				var e = { name: "NS_ERROR_FILE_NOT_FOUND" };
				throw (e);
			}
		}
		else {
			var file = Zotero.getProfileDirectory();
			file.append('zotero');
			
			// if standalone and no directory yet, check Firefox directory
			// or if in Firefox and no directory yet, check standalone Zotero directory
			if(!file.exists()) {
				var prefDir = Components.classes["@mozilla.org/file/directory_service;1"]
					.getService(Components.interfaces.nsIProperties)
					.get("DefProfRt", Components.interfaces.nsILocalFile).parent.parent;
				
				if(Zotero.isStandalone) {
					if(Zotero.isWin) {
						prefDir = prefDir.parent;
						prefDir.append("Mozilla");
						prefDir.append("Firefox");
					} else if(Zotero.isMac) {
						prefDir.append("Firefox");
					} else {
						prefDir.append(".mozilla");
						prefDir.append("firefox");
					}
				} else {
					if(Zotero.isWin) {
						prefDir = prefDir.parent;
						prefDir.append("Zotero");
						prefDir.append("Zotero");
					} else if(Zotero.isMac) {
						prefDir.append("Zotero");
					} else {
						prefDir.append(".zotero");
						prefDir.append("zotero");
					}
				}
				
				Zotero.debug("Looking for existing profile in "+prefDir.path);
				
				// get default profile
				var defProfile = getDefaultProfile(prefDir);
				if(defProfile) {
					// get Zotero directory
					var zoteroDir = defProfile[0].clone();
					zoteroDir.append("zotero");
					
					if(zoteroDir.exists()) {
						// if Zotero directory exists in default profile for alternative app, ask
						// whether to use
						var e = { name:"ZOTERO_DIR_MAY_EXIST", curDir:file, profile:defProfile[0], dir:zoteroDir, multipleProfiles:defProfile[1] };
						throw (e);
					}
				}
			}
			
			Zotero.File.createDirectoryIfMissing(file);
		}
		Zotero.debug("Using data directory " + file.path);
		
		_zoteroDirectory = file;
		return file.clone();
	}
	
	
	function getStorageDirectory(){
		var file = Zotero.getZoteroDirectory();
		
		file.append('storage');
		Zotero.File.createDirectoryIfMissing(file);
		return file;
	}
	
	function getZoteroDatabase(name, ext){
		name = name ? name + '.sqlite' : 'zotero.sqlite';
		ext = ext ? '.' + ext : '';
		
		var file = Zotero.getZoteroDirectory();
		file.append(name + ext);
		return file;
	}
	
	
	/**
	 * @return	{nsIFile}
	 */
	this.getTempDirectory = function () {
		var tmp = this.getZoteroDirectory();
		tmp.append('tmp');
		Zotero.File.createDirectoryIfMissing(tmp);
		return tmp;
	}
	
	
	this.removeTempDirectory = function () {
		var tmp = this.getZoteroDirectory();
		tmp.append('tmp');
		if (tmp.exists()) {
			try {
				tmp.remove(true);
			}
			catch (e) {}
		}
	}
	
	
	this.getStylesDirectory = function () {
		var dir = this.getZoteroDirectory();
		dir.append('styles');
		Zotero.File.createDirectoryIfMissing(dir);
		return dir;
	}
	
	
	this.getTranslatorsDirectory = function () {
		var dir = this.getZoteroDirectory();
		dir.append('translators');
		Zotero.File.createDirectoryIfMissing(dir);
		return dir;
	}
	
	
	function chooseZoteroDirectory(forceRestartNow, useProfileDir) {
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
			.getService(Components.interfaces.nsIWindowMediator);
		var win = wm.getMostRecentWindow('navigator:browser');
		
		var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
			.getService(Components.interfaces.nsIPromptService);
		
		if (useProfileDir) {
			Zotero.Prefs.set('useDataDir', false);
		}
		else {
			var nsIFilePicker = Components.interfaces.nsIFilePicker;
			while (true) {
				var fp = Components.classes["@mozilla.org/filepicker;1"]
							.createInstance(nsIFilePicker);
				fp.init(win, Zotero.getString('dataDir.selectDir'), nsIFilePicker.modeGetFolder);
				fp.appendFilters(nsIFilePicker.filterAll);
				if (fp.show() == nsIFilePicker.returnOK) {
					var file = fp.file;
					
					if (file.directoryEntries.hasMoreElements()) {
						var dbfile = file.clone();
						dbfile.append('zotero.sqlite');
						
						// Warn if non-empty and no zotero.sqlite
						if (!dbfile.exists()) {
							var buttonFlags = ps.STD_YES_NO_BUTTONS;
							var index = ps.confirmEx(null,
								Zotero.getString('dataDir.selectedDirNonEmpty.title'),
								Zotero.getString('dataDir.selectedDirNonEmpty.text'),
								buttonFlags, null, null, null, null, {});
							
							// Not OK -- return to file picker
							if (index == 1) {
								continue;
							}
						}
					}
					else {
						var buttonFlags = ps.STD_YES_NO_BUTTONS;
						var index = ps.confirmEx(null,
							//Zotero.getString('dataDir.selectedDirEmpty.title'),
							//Zotero.getString('dataDir.selectedDirEmpty.text'),
							'Directory Empty',
							'The directory you selected is empty. To move an existing Zotero data directory, '
							+ 'you will need to manually copy files from the existing data directory to the new location. '
							+ 'See http://zotero.org/support/zotero_data for more information.\n\nUse the new directory?',
							
							buttonFlags, null, null, null, null, {});
						
						// Not OK -- return to file picker
						if (index == 1) {
							continue;
						}
					}
					
					
					// Set new data directory
					Zotero.Prefs.set('dataDir', file.persistentDescriptor);
					Zotero.Prefs.set('lastDataDir', file.path);
					Zotero.Prefs.set('useDataDir', true);
					
					break;
				}
				else {
					return false;
				}
			}
		}
		
		var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING);
		if (!forceRestartNow) {
			buttonFlags += (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_IS_STRING);
		}
		var app = Zotero.isStandalone ? Zotero.getString('app.standalone') : Zotero.getString('app.firefox');
		var index = ps.confirmEx(null,
			Zotero.getString('general.restartRequired'),
			Zotero.getString('general.restartRequiredForChange', app),
			buttonFlags,
			Zotero.getString('general.restartNow'),
			forceRestartNow ? null : Zotero.getString('general.restartLater'),
			null, null, {});
		
		if (index == 0) {
			var appStartup = Components.classes["@mozilla.org/toolkit/app-startup;1"]
					.getService(Components.interfaces.nsIAppStartup);
			appStartup.quit(Components.interfaces.nsIAppStartup.eAttemptQuit
				| Components.interfaces.nsIAppStartup.eRestart);
		}
		
		return useProfileDir ? true : file;
	}
	
	
	/*
	 * Debug logging function
	 *
	 * Uses prefs e.z.debug.log and e.z.debug.level (restart required)
	 *
	 * Defaults to log level 3 if level not provided
	 */
	function debug(message, level) {
		Zotero.Debug.log(message, level);
	}
	
	
	/*
	 * Log a message to the Mozilla JS error console
	 *
	 * |type| is a string with one of the flag types in nsIScriptError:
	 *    'error', 'warning', 'exception', 'strict'
	 */
	function log(message, type, sourceName, sourceLine, lineNumber, columnNumber) {
		var consoleService = Components.classes["@mozilla.org/consoleservice;1"]
			.getService(Components.interfaces.nsIConsoleService);
		var scriptError = Components.classes["@mozilla.org/scripterror;1"]
			.createInstance(Components.interfaces.nsIScriptError);
		
		if (!type) {
			type = 'warning';
		}
		var flags = scriptError[type + 'Flag'];
		
		scriptError.init(
			message,
			sourceName ? sourceName : null,
			sourceLine != undefined ? sourceLine : null,
			lineNumber != undefined ? lineNumber : null, 
			columnNumber != undefined ? columnNumber : null,
			flags,
			'component javascript'
		);
		consoleService.logMessage(scriptError);
	}
	
	/**
	 * Log a JS error to the Mozilla JS error console.
	 * @param {Exception} err
	 */
	function logError(err) {
		log(err.message ? err.message : err.toString(), "error",
			err.fileName ? err.fileName : null, null,
			err.lineNumber ? err.lineNumber : null, null);
	}
	
	function getErrors(asStrings) {
		var errors = [];
		var cs = Components.classes["@mozilla.org/consoleservice;1"].
			getService(Components.interfaces.nsIConsoleService);
		var messages = {};
		cs.getMessageArray(messages, {})
		
		var skip = ['CSS Parser', 'content javascript'];
		
		msgblock:
		for each(var msg in messages.value) {
			//Zotero.debug(msg);
			try {
				msg.QueryInterface(Components.interfaces.nsIScriptError);
				//Zotero.debug(msg);
				if (skip.indexOf(msg.category) != -1 || msg.flags & msg.warningFlag) {
					continue;
				}
			}
			catch (e) { }
			
			var blacklist = [
				"No chrome package registered for chrome://communicator",
				'[JavaScript Error: "Components is not defined" {file: "chrome://nightly/content/talkback/talkback.js',
				'[JavaScript Error: "document.getElementById("sanitizeItem")',
				'No chrome package registered for chrome://piggy-bank',
				'[JavaScript Error: "[Exception... "\'Component is not available\' when calling method: [nsIHandlerService::getTypeFromExtension',
				'[JavaScript Error: "this._uiElement is null',
				'Error: a._updateVisibleText is not a function',
				'[JavaScript Error: "Warning: unrecognized command line flag ',
				'[JavaScript Error: "Warning: unrecognized command line flag -foreground',
				'LibX:',
				'function skype_',
				'[JavaScript Error: "uncaught exception: Permission denied to call method Location.toString"]',
				'CVE-2009-3555'
			];
			
			for (var i=0; i<blacklist.length; i++) {
				if (msg.message.indexOf(blacklist[i]) != -1) {
					//Zotero.debug("Skipping blacklisted error: " + msg.message);
					continue msgblock;
				}
			}
			
			// Remove password in malformed XML messages
			if (msg.category == 'malformed-xml') {
				try {
					// msg.message is read-only, so store separately
					var altMessage = msg.message.replace(/(file: "https?:\/\/[^:]+:)([^@]+)(@[^"]+")/, "$1********$3");
				}
				catch (e) {}
			}
			
			if (asStrings) {
				errors.push(altMessage ? altMessage : msg.message)
			}
			else {
				errors.push(msg);
			}
		}
		return errors;
	}
	
	
	function getSystemInfo() {
		var appInfo = Components.classes["@mozilla.org/xre/app-info;1"].
			getService(Components.interfaces.nsIXULAppInfo);
		
		var info = {
			version: Zotero.version,
			platform: Zotero.platform,
			oscpu: Zotero.oscpu,
			locale: Zotero.locale,
			appName: appInfo.name,
			appVersion: appInfo.version,
			extensions: this.getInstalledExtensions().join(', ')
		};
		
		var str = '';
		for (var key in info) {
			str += key + ' => ' + info[key] + ', ';
		}
		str = str.substr(0, str.length - 2);
		return str;
	}
	
	
	/**
	 * @return	{String[]}		Array of extension names and versions
	 */
	this.getInstalledExtensions = function () {
		if(this.isFx4) {
			if(!Zotero.addons) {
				AddonManager.getAllAddons(function(addonList) { Zotero.addons = addonList; });
				while(Zotero.addons === undefined) Zotero.mainThread.processNextEvent(true);
			}
			var installed = Zotero.addons;
		} else {
			var em = Components.classes["@mozilla.org/extensions/manager;1"].
						getService(Components.interfaces.nsIExtensionManager);
			var installed = em.getItemList(
				Components.interfaces.nsIUpdateItem.TYPE_ANY, {}
			);
		}
		
		var addons = [];
		for each(var addon in installed) {
			switch (addon.id) {
				case "pajoohyar@pajoohyar.ir":
				case "{972ce4c6-7e08-4474-a285-3208198ce6fd}": // Default theme
					continue;
			}
			
			addons.push(addon.name + " (" + addon.version
				+ (addon.type != 2 ? ", " + addon.type : "") + ")");
		}
		return addons;
	}
	
	
	/**
	 * PHP var_dump equivalent for JS
	 *
	 * Adapted from http://binnyva.blogspot.com/2005/10/dump-function-javascript-equivalent-of.html
	 */
	function varDump(arr,level) {
		var dumped_text = "";
		if (!level){
			level = 0;
		}
		
		// The padding given at the beginning of the line.
		var level_padding = "";
		for (var j=0;j<level+1;j++){
			level_padding += "    ";
		}
		
		if (typeof(arr) == 'object') { // Array/Hashes/Objects
			for (var item in arr) {
				var value = arr[item];
				
				if (typeof(value) == 'object') { // If it is an array,
					dumped_text += level_padding + "'" + item + "' ...\n";
					dumped_text += arguments.callee(value,level+1);
				}
				else {
					if (typeof value == 'function'){
						dumped_text += level_padding + "'" + item + "' => function(...){...} \n";
					}
					else if (typeof value == 'number') {
						dumped_text += level_padding + "'" + item + "' => " + value + "\n";
					}
					else {
						dumped_text += level_padding + "'" + item + "' => \"" + value + "\"\n";
					}
				}
			}
		}
		else { // Stings/Chars/Numbers etc.
			dumped_text = "===>"+arr+"<===("+typeof(arr)+")";
		}
		return dumped_text;
	}
	
	
	function safeDebug(obj){
		for (var i in obj){
			try {
				Zotero.debug(i + ': ' + obj[i]);
			}
			catch (e){
				try {
					Zotero.debug(i + ': ERROR');
				}
				catch (e){}
			}
		}
	}
	
	
	function getString(name, params){
		try {
			if (params != undefined){
				if (typeof params != 'object'){
					params = [params];
				}
				var l10n = _localizedStringBundle.formatStringFromName(name, params, params.length);
			}
			else {
				var l10n = _localizedStringBundle.GetStringFromName(name);
			}
		}
		catch (e){
			throw ('Localized string not available for ' + name);
		}
		return l10n;
	}
	
	
	/*
	 * This function should be removed
	 *
	 * |separator| defaults to a space (not a comma like Array.join()) if
	 *   not specified
	 *
	 * TODO: Substitute localized characters (e.g. Arabic comma and semicolon)
	 */
	function localeJoin(arr, separator) {
		if (typeof separator == 'undefined') {
			separator = ' ';
		}
		return arr.join(separator);
	}
	
	
	function getLocaleCollation() {
		var localeService = Components.classes["@mozilla.org/intl/nslocaleservice;1"]
			.getService(Components.interfaces.nsILocaleService);
		var collationFactory = Components.classes["@mozilla.org/intl/collation-factory;1"]
			.getService(Components.interfaces.nsICollationFactory);
		return collationFactory.CreateCollation(localeService.getApplicationLocale());
	}
	
	
	/*
	 * Sets font size based on prefs -- intended for use on root element
	 *  (zotero-pane, note window, etc.)
	 */
	function setFontSize(rootElement) {
		var size = Zotero.Prefs.get('fontSize');
		rootElement.style.fontSize = size + 'em';
		if (size <= 1) {
			size = 'small';
		}
		else if (size <= 1.25) {
			size = 'medium';
		}
		else {
			size = 'large';
		}
		// Custom attribute -- allows for additional customizations in zotero.css
		rootElement.setAttribute('zoteroFontSize', size);
	}
	
	
	/*
	 * Flattens mixed arrays/values in a passed _arguments_ object and returns
	 * an array of values -- allows for functions to accept both arrays of
	 * values and/or an arbitrary number of individual values
	 */
	function flattenArguments(args){
		var isArguments = args.callee && args.length;
		
		// Put passed scalar values into an array
		if (args === null || (args.constructor.name != 'Array' && !isArguments)) {
			args = [args];
		}
		
		var returns = [];
		for (var i=0; i<args.length; i++){
			if (!args[i]) {
				continue;
			}
			if (args[i].constructor.name == 'Array') {
				for (var j=0; j<args[i].length; j++){
					returns.push(args[i][j]);
				}
			}
			else {
				returns.push(args[i]);
			}
		}
		
		return returns;
	}
	
	
	function getAncestorByTagName(elem, tagName){
		while (elem.parentNode){
			elem = elem.parentNode;
			if (elem.localName == tagName) {
				return elem;
			}
		}
		return false;
	}
	
	
	/*
	 * A version of join() that operates externally for use on objects other
	 * than arrays (e.g. _arguments_)
	 *
	 * Note that this is safer than extending Object()
	 */
	function join(obj, delim){
		var a = [];
		for (var i=0, len=obj.length; i<len; i++){
			a.push(obj[i]);
		}
		return a.join(delim);
	}
	
	
	/**
	* Generate a random string of length 'len' (defaults to 8)
	**/
	function randomString(len, chars) {
		if (!chars) {
			chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
		}
		if (!len) {
			len = 8;
		}
		var randomstring = '';
		for (var i=0; i<len; i++) {
			var rnum = Math.floor(Math.random() * chars.length);
			randomstring += chars.substring(rnum,rnum+1);
		}
		return randomstring;
	}
	
	
	function moveToUnique(file, newFile){
		newFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0644);
		var newName = newFile.leafName;
		newFile.remove(null);
		
		// Move file to unique name
		file.moveTo(newFile.parent, newName);
		return file;
	}
	
	
	/**
	 * Sleep for a given amount of time, allowing other events on main thread to be processed
	 *
	 * @param	{Integer}	ms			Milliseconds to wait
	 */
	this.sleep = function (ms) {
		var mainThread = Zotero.mainThread;
		var endTime = Date.now() + ms;
		do {
			mainThread.processNextEvent(false);
		} while (Date.now() < endTime);
		
		return;
	};
	
	
	/**
	 * Allow other events (e.g., UI updates) on main thread to be processed if necessary
	 *
	 * @param	{Integer}	[timeout=50]		Maximum number of milliseconds to wait
	 */
	this.wait = function (timeout) {
		if (!timeout) {
			timeout = 50;
		}
		var mainThread = Zotero.mainThread;
		var endTime = Date.now() + timeout;
		var more;
		//var cycles = 0;
		
		_waiting = true;
		
		do {
			more = mainThread.processNextEvent(false);
			//cycles++;
		} while (more && Date.now() < endTime);
		
		_waiting = false;
		
		// requeue nsITimerCallbacks that came up during Zotero.wait() but couldn't execute
		for(var i in _waitTimers) {
			_waitTimers[i].initWithCallback(_waitTimerCallbacks[i], 0, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
		}
		_waitTimers = [];
		_waitTimerCallbacks = [];
		
		//Zotero.debug("Waited " + cycles + " cycles");
		return;
	};
	
	/**
	 * Emulates the behavior of window.setTimeout, but ensures that timeouts do not get called
	 * during Zotero.wait()
	 *
	 * @param {Function} func The function to be called
	 * @param {Integer} ms The number of milliseconds to wait before calling func
	 */
	this.setTimeout = function(func, ms) {
		var timer = Components.classes["@mozilla.org/timer;1"].
			createInstance(Components.interfaces.nsITimer);
		var timerCallback = {"notify":function() {
			if(_waiting) {
				// if our callback gets called during Zotero.wait(), queue it to be set again
				// when Zotero.wait() completes
				_waitTimers.push(timer);
				_waitTimerCallbacks.push(timerCallback);
			} else {
				// execute callback function
				func();
				// remove timer from global scope, so it can be garbage collected
				_runningTimers.splice(_runningTimers.indexOf(timer), 1);
			}
		}}
		timer.initWithCallback(timerCallback, ms, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
		// add timer to global scope so that it doesn't get garbage collected before it completes
		_runningTimers.push(timer);
	}
	
	/**
	 * Show Zotero pane overlay and progress bar in all windows
	 *
	 * @param	{String}		msg
	 * @param	{Boolean}		[determinate=false]
	 * @return	void
	 */
	this.showZoteroPaneProgressMeter = function (msg, determinate) {
		Zotero.debug("showing progress meter");
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
					.getService(Components.interfaces.nsIWindowMediator);
		var enumerator = wm.getEnumerator("navigator:browser");
		var progressMeters = [];
		while (enumerator.hasMoreElements()) {
			var win = enumerator.getNext();
			Zotero.debug("win found");
			if(!win.ZoteroPane) continue;
			Zotero.debug("win has pane");
			
			win.ZoteroPane.document.getElementById('zotero-pane-progress-label').value = msg;
			var progressMeter = win.ZoteroPane.document.getElementById('zotero-pane-progressmeter')
			if (determinate) {
				progressMeter.mode = 'determined';
				progressMeter.value = 0;
				progressMeter.max = 1000;
			}
			else {
				progressMeter.mode = 'undetermined';
			}
			
			_showWindowZoteroPaneOverlay(win.ZoteroPane.document);
			win.ZoteroPane.document.getElementById('zotero-pane-overlay-deck').selectedIndex = 0;
			
			progressMeters.push(progressMeter);
			Zotero.debug("added meter for win");
		}
		_locked = true;
		_progressMeters = progressMeters;
	}
	
	
	/**
	 * @param	{Number}	percentage		Percentage complete as integer or float
	 */
	this.updateZoteroPaneProgressMeter = function (percentage) {
		if(percentage !== null) {
			if (percentage < 0 || percentage > 100) {
				Zotero.debug("Invalid percentage value '" + percentage + "' in Zotero.updateZoteroPaneProgressMeter()");
				return;
			}
			percentage = Math.round(percentage * 10);
		}
		if (percentage === _lastPercentage) {
			return;
		}
		for each(var pm in _progressMeters) {
			if (percentage !== null) {
				if (pm.mode == 'undetermined') {
					pm.max = 1000;
					pm.mode = 'determined';
				}
				pm.value = percentage;
			} else if(pm.mode === 'determined') {
				pm.mode = 'undetermined';
			}
		}
		_lastPercentage = percentage;
	}
	
	
	/**
	 * Hide Zotero pane overlay in all windows
	 */
	this.hideZoteroPaneOverlay = function () {
		// Run any queued callbacks
		if (_unlockCallbacks.length) {
			var func;
			while (func = _unlockCallbacks.shift()) {
				func();
			}
		}
		
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
					.getService(Components.interfaces.nsIWindowMediator);
		var enumerator = wm.getEnumerator("navigator:browser");
		while (enumerator.hasMoreElements()) {
			var win = enumerator.getNext();
			if(win.ZoteroPane && win.ZoteroPane.document) {
				_hideWindowZoteroPaneOverlay(win.ZoteroPane.document);
			}
		}
		_locked = false;
		_progressMeters = [];
		_lastPercentage = null;
	}
	
	
	/**
	 * Adds a callback to be called when the Zotero pane overlay closes
	 *
	 * @param	{Boolean}	TRUE if added, FALSE if not locked
	 */
	this.addUnlockCallback = function (callback) {
		if (!_locked) {
			return false;
		}
		_unlockCallbacks.push(callback);
		return true;
	}
	
	
	function _showWindowZoteroPaneOverlay(doc) {
		doc.getElementById('zotero-collections-tree').disabled = true;
		doc.getElementById('zotero-items-tree').disabled = true;
		doc.getElementById('zotero-pane-tab-catcher-top').hidden = false;
		doc.getElementById('zotero-pane-tab-catcher-bottom').hidden = false;
		doc.getElementById('zotero-pane-overlay').hidden = false;
	}
	
	
	function _hideWindowZoteroPaneOverlay(doc) {
		doc.getElementById('zotero-collections-tree').disabled = false;
		doc.getElementById('zotero-items-tree').disabled = false;
		doc.getElementById('zotero-pane-tab-catcher-top').hidden = true;
		doc.getElementById('zotero-pane-tab-catcher-bottom').hidden = true;
		doc.getElementById('zotero-pane-overlay').hidden = true;
	}
	
	
	/*
	 * Clear entries that no longer exist from various tables
	 */
	this.purgeDataObjects = function (skipStoragePurge) {
		Zotero.Creators.purge();
		Zotero.Tags.purge();
		Zotero.Fulltext.purgeUnusedWords();
		Zotero.Items.purge();
		// DEBUG: this might not need to be permanent
		Zotero.Relations.purge();
		
		if (!skipStoragePurge && Math.random() < 1/10) {
			Zotero.Sync.Storage.purgeDeletedStorageFiles('zfs');
			Zotero.Sync.Storage.purgeDeletedStorageFiles('webdav');
		}
		
		if (!skipStoragePurge) {
			Zotero.Sync.Storage.purgeOrphanedStorageFiles('webdav');
		}
	}
	
	
	this.reloadDataObjects = function () {
		Zotero.Tags.reloadAll();
		Zotero.Collections.reloadAll();
		Zotero.Creators.reloadAll();
		Zotero.Items.reloadAll();
	}
};



Zotero.Prefs = new function(){
	// Privileged methods
	this.init = init;
	this.get = get;
	this.set = set;
	
	this.register = register;
	this.unregister = unregister;
	this.observe = observe;
	
	// Public properties
	this.prefBranch;
	
	function init(){
		var prefs = Components.classes["@mozilla.org/preferences-service;1"]
						.getService(Components.interfaces.nsIPrefService);
		this.prefBranch = prefs.getBranch(ZOTERO_CONFIG.PREF_BRANCH);
		
		// Register observer to handle pref changes
		this.register();
	}
	
	
	/**
	* Retrieve a preference
	**/
	function get(pref, global){
		try {
			if (global) {
				var service = Components.classes["@mozilla.org/preferences-service;1"]
					.getService(Components.interfaces.nsIPrefService);
			}
			else {
				var service = this.prefBranch;
			}
			
			switch (this.prefBranch.getPrefType(pref)){
				case this.prefBranch.PREF_BOOL:
					return this.prefBranch.getBoolPref(pref);
				case this.prefBranch.PREF_STRING:
					return this.prefBranch.getCharPref(pref);
				case this.prefBranch.PREF_INT:
					return this.prefBranch.getIntPref(pref);
			}
		}
		catch (e){
			throw ("Invalid preference '" + pref + "'");
		}
	}
	
	
	/**
	* Set a preference
	**/
	function set(pref, value) {
		try {
			switch (this.prefBranch.getPrefType(pref)){
				case this.prefBranch.PREF_BOOL:
					return this.prefBranch.setBoolPref(pref, value);
				case this.prefBranch.PREF_STRING:
					return this.prefBranch.setCharPref(pref, value);
				case this.prefBranch.PREF_INT:
					return this.prefBranch.setIntPref(pref, value);
				
				// If not an existing pref, create appropriate type automatically
				case 0:
					if (typeof value == 'boolean') {
						Zotero.debug("Creating boolean pref '" + pref + "'");
						return this.prefBranch.setBoolPref(pref, value);
					}
					if (typeof value == 'string') {
						Zotero.debug("Creating string pref '" + pref + "'");
						return this.prefBranch.setCharPref(pref, value);
					}
					if (parseInt(value) == value) {
						Zotero.debug("Creating integer pref '" + pref + "'");
						return this.prefBranch.setIntPref(pref, value);
					}
					throw ("Invalid preference value '" + value + "' for pref '" + pref + "'");
			}
		}
		catch (e){
			throw ("Invalid preference '" + pref + "'");
		}
	}
	
	
	this.clear = function (pref) {
		try {
			this.prefBranch.clearUserPref(pref);
		}
		catch (e) {
			throw ("Invalid preference '" + pref + "'");
		}
	}
	
	
	// Import settings bundles
	this.importSettings = function (str, uri) {
		var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
								.getService(Components.interfaces.nsIPromptService);
		
		if (!uri.match(/https:\/\/([^\.]+\.)?zotero.org\//)) {
			Zotero.debug("Ignoring settings file not from https://zotero.org");
			return;
		}
		
		str = Zotero.Utilities.trim(str.replace(/<\?xml.*\?>\s*/, ''));
		Zotero.debug(str);
		
		var confirm = ps.confirm(
			null,
			"",
			"Apply settings from zotero.org?"
		);
		
		if (!confirm) {
			return;
		}
		
		var xml = new XML(str);
		
		var commonsEnable = xml.setting.(@id == 'commons-enable');
		if (commonsEnable == 'true') {
			Zotero.Commons.enabled = true;
			Zotero.Commons.accessKey = xml.setting.(@id == 'commons-accessKey').toString();
			Zotero.Commons.secretKey = xml.setting.(@id == 'commons-secretKey').toString();
		}
		else if (commonsEnable == 'false') {
			Zotero.Commons.enabled = false;
			Zotero.Commons.accessKey = '';
			Zotero.Commons.secretKey = '';
		}
		// This is kind of a hack
		Zotero.Notifier.trigger('refresh', 'collection', []);
	}
	
	
	//
	// Methods to register a preferences observer
	//
	function register(){
		this.prefBranch.QueryInterface(Components.interfaces.nsIPrefBranch2);
		this.prefBranch.addObserver("", this, false);
	}
	
	function unregister(){
		if (!this.prefBranch){
			return;
		}
		this.prefBranch.removeObserver("", this);
	}
	
	function observe(subject, topic, data){
		if(topic!="nsPref:changed"){
			return;
		}
		// subject is the nsIPrefBranch we're observing (after appropriate QI)
		// data is the name of the pref that's been changed (relative to subject)
		switch (data){
			case "automaticScraperUpdates":
				if (this.get('automaticScraperUpdates')){
					//<abszh>
					//updates cause problems when the zotero version is old
					Zotero.Schema.updateFromRepository();
					//</abszh>
				}
				else {
					Zotero.Schema.stopRepositoryTimer();
				}
				break;
			
			case "zoteroDotOrgVersionHeader":
				if (this.get("zoteroDotOrgVersionHeader")) {
					Zotero.VersionHeader.register();
				}
				else {
					Zotero.VersionHeader.unregister();
				}
				break;
			
			case "sync.autoSync":
				if (this.get("sync.autoSync")) {
					Zotero.Sync.Runner.IdleListener.register();
				}
				else {
					Zotero.Sync.Runner.IdleListener.unregister();
				}
				break;
		}
	}
}


/*
 * Handles keyboard shortcut initialization from preferences, optionally
 * overriding existing global shortcuts
 *
 * Actions are configured in ZoteroPane.handleKeyPress()
 */
Zotero.Keys = new function() {
	this.init = init;
	this.windowInit = windowInit;
	this.getCommand = getCommand;
	
	var _keys = {};
	
	
	/*
	 * Called by Zotero.init()
	 */
	function init() {
		var actions = Zotero.Prefs.prefBranch.getChildList('keys', {}, {});
		
		// Get the key=>command mappings from the prefs
		for each(var action in actions) {
			var action = action.substr(5); // strips 'keys.'
			if (action == 'overrideGlobal') {
				continue;
			}
			_keys[Zotero.Prefs.get('keys.' + action)] = action;
		}
	}
	
	
	/*
	 * Called by ZoteroPane.onLoad()
	 */
	function windowInit(document) {
		var useShift = Zotero.isMac;
		
		// Zotero pane shortcut
		var keyElem = document.getElementById('key_openZotero');
		if(keyElem) {
			var zKey = Zotero.Prefs.get('keys.openZotero');
			// Only override the default with the pref if the <key> hasn't been manually changed
			// and the pref has been
			if (keyElem.getAttribute('key') == 'Z' && keyElem.getAttribute('modifiers') == 'accel alt'
					&& (zKey != 'Z' || useShift)) {
				keyElem.setAttribute('key', zKey);
				if (useShift) {
					keyElem.setAttribute('modifiers', 'accel shift');
				}
			}
		}
		
		if (Zotero.Prefs.get('keys.overrideGlobal')) {
			var keys = document.getElementsByTagName('key');
			for each(var key in keys) {
				try {
					var id = key.getAttribute('id');
				}
				// A couple keys are always invalid
				catch (e) {
					continue;
				}
				
				if (id == 'key_openZotero') {
					continue;
				}
				
				var mods = key.getAttribute('modifiers').split(/[\,\s]/);
				var second = useShift ? 'shift' : 'alt';
				// Key doesn't match a Zotero shortcut
				if (mods.length != 2 || !((mods[0] == 'accel' && mods[1] == second) ||
						(mods[0] == second && mods[1] == 'accel'))) {
					continue;
				}
				
				if (_keys[key.getAttribute('key')] || key.getAttribute('key') == zKey) {
					// Don't override Redo on Fx3 Mac, since Redo and Zotero can coexist
					if (zKey == 'Z' && key.getAttribute('key') == 'Z'
							&& id == 'key_redo' && Zotero.isFx3 && Zotero.isMac) {
						continue;
					}
					
					Zotero.debug('Removing key ' + id + ' with accesskey ' + key.getAttribute('key'));
					key.parentNode.removeChild(key);
				}
			}
		}
	}
	
	
	function getCommand(key) {
		return _keys[key] ? _keys[key] : false;
	}
}


/**
 * Add X-Zotero-Version header to HTTP requests to zotero.org
 *
 * @namespace
 */
Zotero.VersionHeader = {
	init: function () {
		if (Zotero.Prefs.get("zoteroDotOrgVersionHeader")) {
			this.register();
		}
	},
	
	// Called from this.init() and Zotero.Prefs.observe()
	register: function () {
		var observerService = Components.classes["@mozilla.org/observer-service;1"]
								.getService(Components.interfaces.nsIObserverService);
		observerService.addObserver(this, "http-on-modify-request", false);
	},
	
	observe: function (subject, topic, data) {
		try {
			var channel = subject.QueryInterface(Components.interfaces.nsIHttpChannel);
			if (channel.URI.host.match(/zotero\.org$/)) {
				channel.setRequestHeader("X-Zotero-Version", Zotero.version, false);
			}
		}
		catch (e) {
			Zotero.debug(e);
		}
	},
	
	unregister: function () {
		var observerService = Components.classes["@mozilla.org/observer-service;1"]
								.getService(Components.interfaces.nsIObserverService);
		observerService.removeObserver(this, "http-on-modify-request");
	}
}



/**
* Class for creating hash arrays that behave a bit more sanely
*
*   Hashes can be created in the constructor by alternating key and val:
*
*   var hasharray = new Zotero.Hash('foo','foovalue','bar','barvalue');
*
*   Or using hasharray.set(key, val)
*
*   _val_ defaults to true if not provided
*
*   If using foreach-style looping, be sure to use _for (i in arr.items)_
*   rather than just _for (i in arr)_, or else you'll end up with the
*   methods and members instead of the hash items
*
*   Most importantly, hasharray.length will work as expected, even with
*   non-numeric keys
*
* Adapated from http://www.mojavelinux.com/articles/javascript_hashes.html
* (c) Mojavelinux, Inc.
* License: Creative Commons
**/
Zotero.Hash = function(){
	this.length = 0;
	this.items = {};
	
	// Public methods defined on prototype below
	
	for (var i = 0; i < arguments.length; i += 2) {
		if (typeof(arguments[i + 1]) != 'undefined') {
			this.items[arguments[i]] = arguments[i + 1];
			this.length++;
		}
	}
}

Zotero.Hash.prototype.get = function(in_key){
	return this.items[in_key] ? this.items[in_key] : false;
}

Zotero.Hash.prototype.set = function(in_key, in_value){
	// Default to a boolean hash if value not provided
	if (typeof(in_value) == 'undefined'){
		in_value = true;
	}
	
	if (typeof(this.items[in_key]) == 'undefined') {
		this.length++;
	}
	
	this.items[in_key] = in_value;
	
	return in_value;
}

Zotero.Hash.prototype.remove = function(in_key){
	var tmp_value;
	if (typeof(this.items[in_key]) != 'undefined') {
		this.length--;
		var tmp_value = this.items[in_key];
		delete this.items[in_key];
	}
	
	return tmp_value;
}

Zotero.Hash.prototype.has = function(in_key){
	return typeof(this.items[in_key]) != 'undefined';
}

/**
 * Singleton for common text formatting routines
 **/
Zotero.Text = new function() {
	this.titleCase = titleCase;
	
	var skipWords = ["but", "or", "yet", "so", "for", "and", "nor", "a", "an",
		"the", "at", "by", "from", "in", "into", "of", "on", "to", "with", "up",
		"down", "as"];
	// this may only match a single character
	var delimiterRegexp = /([ \/\-–—])/;
	
	function titleCase(string) {
		if (!string) {
			return "";
		}
		
		// split words
		var words = string.split(delimiterRegexp);
		var isUpperCase = string.toUpperCase() == string;
		
		var newString = "";
		var delimiterOffset = words[0].length;
		var lastWordIndex = words.length-1;
		var previousWordIndex = -1;
		for(var i=0; i<=lastWordIndex; i++) {
			// only do manipulation if not a delimiter character
			if(words[i].length != 0 && (words[i].length != 1 || !delimiterRegexp.test(words[i]))) {
				var upperCaseVariant = words[i].toUpperCase();
				var lowerCaseVariant = words[i].toLowerCase();
				
				// only use if word does not already possess some capitalization
				if(isUpperCase || words[i] == lowerCaseVariant) {
					if(
						// a skip word
						skipWords.indexOf(lowerCaseVariant.replace(/[^a-zA-Z]+/, "")) != -1
						// not first or last word
						&& i != 0 && i != lastWordIndex
						// does not follow a colon
						&& (previousWordIndex == -1 || words[previousWordIndex][words[previousWordIndex].length-1] != ":")
					) {
						words[i] = lowerCaseVariant;
					} else {
						// this is not a skip word or comes after a colon;
						// we must capitalize
						words[i] = upperCaseVariant[0] + lowerCaseVariant.substr(1);
					}
				}
				
				previousWordIndex = i;
			}
			
			newString += words[i];
		}
		
		return newString;
	}
}

Zotero.DragDrop = {
	currentDataTransfer: null,
	
	getDragData: function (element, firstOnly) {
		var dragData = {
			dataType: '',
			data: []
		};
		
		var dt = this.currentDataTransfer;
		if (!dt) {
			Zotero.debug("Drag data not available");
			return false;
		}
		
		var len = firstOnly ? 1 : dt.mozItemCount;
		
		if (dt.types.contains('zotero/collection')) {
			dragData.dataType = 'zotero/collection';
			var ids = dt.getData('zotero/collection').split(",");
			dragData.data = ids;
		}
		else if (dt.types.contains('zotero/item')) {
			dragData.dataType = 'zotero/item';
			var ids = dt.getData('zotero/item').split(",");
			dragData.data = ids;
		}
		else if (dt.types.contains('application/x-moz-file')) {
			dragData.dataType = 'application/x-moz-file';
			var files = [];
			for (var i=0; i<len; i++) {
				var file = dt.mozGetDataAt("application/x-moz-file", i);
				file.QueryInterface(Components.interfaces.nsIFile);
				// Don't allow folder drag
				if (file.isDirectory()) {
					continue;
				}
				files.push(file);
			}
			dragData.data = files;
		}
		else if (dt.types.contains('text/x-moz-url')) {
			dragData.dataType = 'text/x-moz-url';
			var urls = [];
			for (var i=0; i<len; i++) {
				var url = dt.getData("text/x-moz-url").split("\n")[0];
				urls.push(url);
			}
			dragData.data = urls;
		}
		
		return dragData;
	}
}


/**
 * Functions for creating and destroying hidden browser objects
 **/
Zotero.Browser = new function() {
	this.createHiddenBrowser = createHiddenBrowser;
	this.deleteHiddenBrowser = deleteHiddenBrowser;
	
	function createHiddenBrowser(win) {
	 	if (!win) {
			var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
							.getService(Components.interfaces.nsIWindowMediator)
							.getMostRecentWindow("navigator:browser");
			if(!win) {
				var win = Components.classes["@mozilla.org/appshell/window-mediator;1"]
								.getService(Components.interfaces.nsIWindowWatcher)
								.activeWindow;
			}
		}
		
		// Create a hidden browser
		var hiddenBrowser = win.document.createElement("browser");
		hiddenBrowser.setAttribute('type', 'content');
		hiddenBrowser.setAttribute('disablehistory', 'true');
		win.document.documentElement.appendChild(hiddenBrowser);
		// Disable some features
		hiddenBrowser.docShell.allowImages = false;
		hiddenBrowser.docShell.allowJavascript = false;
		hiddenBrowser.docShell.allowMetaRedirects = false;
		hiddenBrowser.docShell.allowPlugins = false;
		Zotero.debug("created hidden browser ("
			+ (win.document.getElementsByTagName('browser').length - 1) + ")");
		return hiddenBrowser;
	}
	
	function deleteHiddenBrowser(myBrowser) {
		myBrowser.stop();
		myBrowser.destroy();
		myBrowser.parentNode.removeChild(myBrowser);
		myBrowser = null;
		Zotero.debug("deleted hidden browser");
	}
}

/**
 * Functions for disabling and enabling the unresponsive script indicator
 **/
Zotero.UnresponsiveScriptIndicator = new function() {
	this.disable = disable;
	this.enable = enable;
	
	// stores the state of the unresponsive script preference prior to disabling
	var _unresponsiveScriptPreference, _isDisabled;
	
	/**
	 * disables the "unresponsive script" warning; necessary for import and
	 * export, which can take quite a while to execute
	 **/
	function disable() {
		// don't do anything if already disabled
		if (_isDisabled) {
			return false;
		}
		
		var prefService = Components.classes["@mozilla.org/preferences-service;1"].
		                  getService(Components.interfaces.nsIPrefBranch);
		_unresponsiveScriptPreference = prefService.getIntPref("dom.max_chrome_script_run_time");
		prefService.setIntPref("dom.max_chrome_script_run_time", 0);
		
		_isDisabled = true;
		return true;
	}
	 
	/**
	 * restores the "unresponsive script" warning
	 **/
	function enable() {
		var prefService = Components.classes["@mozilla.org/preferences-service;1"].
		                  getService(Components.interfaces.nsIPrefBranch);
		prefService.setIntPref("dom.max_chrome_script_run_time", _unresponsiveScriptPreference);
		
		_isDisabled = false;
	}
}


/*
 * Implements nsIWebProgressListener
 */
Zotero.WebProgressFinishListener = function(onFinish) {
	this.onStateChange = function(wp, req, stateFlags, status) {
		//Zotero.debug('onStageChange: ' + stateFlags);
		if ((stateFlags & Components.interfaces.nsIWebProgressListener.STATE_STOP)
				&& (stateFlags & Components.interfaces.nsIWebProgressListener.STATE_IS_NETWORK)) {
			onFinish();
		}
	}
	
	this.onProgressChange = function(wp, req, curSelfProgress, maxSelfProgress, curTotalProgress, maxTotalProgress) {
		//Zotero.debug('onProgressChange');
		//Zotero.debug('Current: ' + curTotalProgress);
		//Zotero.debug('Max: ' + maxTotalProgress);
	}
	
	this.onLocationChange = function(wp, req, location) {}
	this.onSecurityChange = function(wp, req, stateFlags, status) {}
	this.onStatusChange = function(wp, req, status, msg) {}
}

/*
 * Saves or loads JSON objects.
 */
Zotero.JSON = new function() {
	this.serialize = function(arg) {
		Zotero.debug("WARNING: Zotero.JSON.serialize() is deprecated; use JSON.stringify()");
		return JSON.stringify(arg);
	}
	
	this.unserialize = function(arg) {
		Zotero.debug("WARNING: Zotero.JSON.unserialize() is deprecated; use JSON.parse()");
		return JSON.parse(arg);
	}
}
