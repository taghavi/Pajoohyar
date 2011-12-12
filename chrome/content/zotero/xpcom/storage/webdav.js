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


Zotero.Sync.Storage.Session.WebDAV = function (callbacks) {
	this.onChangesMade = callbacks.onChangesMade ? callbacks.onChangesMade : function () {};
	this.onError = callbacks.onError ? function (e) {
		if (!e) {
			e = Zotero.Sync.Storage.Session.WebDAV.prototype.defaultError;
		}
		callbacks.onError(e);
	} : function () {};
	
	this._parentURI;
	this._rootURI;
	this._cachedCredentials = false;
}

Zotero.Sync.Storage.Session.WebDAV.prototype.name = "WebDAV";

Zotero.Sync.Storage.Session.WebDAV.prototype.__defineGetter__('includeUserFiles', function () {
	return Zotero.Prefs.get("sync.storage.enabled") && Zotero.Prefs.get("sync.storage.protocol") == 'webdav';
});

Zotero.Sync.Storage.Session.WebDAV.prototype.includeGroupItems = false;

// TEMP
// TODO: localize
Zotero.Sync.Storage.Session.WebDAV.prototype.defaultError = "A WebDAV file sync error occurred. Please try syncing again.\n\nIf you receive this message repeatedly, check your WebDAV server settings in the Sync pane of the Zotero preferences.";
Zotero.Sync.Storage.Session.WebDAV.prototype.defaultErrorRestart = "A WebDAV file sync error occurred. Please restart Firefox and try syncing again.\n\nIf you receive this message repeatedly, check your WebDAV server settings in the Sync pane of the Zotero preferences.";


Zotero.Sync.Storage.Session.WebDAV.prototype.__defineGetter__('enabled', function () {
	return this.includeUserFiles;
});

Zotero.Sync.Storage.Session.WebDAV.prototype.__defineGetter__('verified', function () {
	return Zotero.Prefs.get("sync.storage.verified");
});

Zotero.Sync.Storage.Session.WebDAV.prototype.__defineGetter__('active', function () {
	return this.enabled && this.verified;
});

Zotero.Sync.Storage.Session.WebDAV.prototype._loginManagerHost = 'chrome://zotero';
Zotero.Sync.Storage.Session.WebDAV.prototype._loginManagerURL = 'Zotero Storage Server';

Zotero.Sync.Storage.Session.WebDAV.prototype.__defineGetter__('username', function () {
	return Zotero.Prefs.get('sync.storage.username');
});

Zotero.Sync.Storage.Session.WebDAV.prototype.__defineGetter__('password', function () {
	var username = this.username;
	
	if (!username) {
		Zotero.debug('Username not set before getting Zotero.Sync.Storage.Session.WebDAV.password');
		return '';
	}
	
	Zotero.debug('Getting WebDAV password');
	var loginManager = Components.classes["@mozilla.org/login-manager;1"]
							.getService(Components.interfaces.nsILoginManager);
	var logins = loginManager.findLogins({}, this._loginManagerHost, this._loginManagerURL, null);
	
	// Find user from returned array of nsILoginInfo objects
	for (var i = 0; i < logins.length; i++) {
		if (logins[i].username == username) {
			return logins[i].password;
		}
	}
	
	return '';
});

Zotero.Sync.Storage.Session.WebDAV.prototype.__defineSetter__('password', function (password) {
	var username = this.username;
	if (!username) {
		Zotero.debug('Username not set before setting Zotero.Sync.Server.Session.WebDAV.password');
		return;
	}
	
	this._cachedCredentials = false;
	
	var loginManager = Components.classes["@mozilla.org/login-manager;1"]
							.getService(Components.interfaces.nsILoginManager);
	var logins = loginManager.findLogins({}, this._loginManagerHost, this._loginManagerURL, null);
	
	for (var i = 0; i < logins.length; i++) {
		Zotero.debug('Clearing WebDAV passwords');
		loginManager.removeLogin(logins[i]);
		break;
	}
	
	if (password) {
		Zotero.debug(this._loginManagerURL);
		var nsLoginInfo = new Components.Constructor("@mozilla.org/login-manager/loginInfo;1",
			Components.interfaces.nsILoginInfo, "init");
		var loginInfo = new nsLoginInfo(this._loginManagerHost, this._loginManagerURL,
			null, username, password, "", "");
		loginManager.addLogin(loginInfo);
	}
});

Zotero.Sync.Storage.Session.WebDAV.prototype.__defineGetter__('rootURI', function () {
	if (!this._rootURI) {
		throw ("Root URI not initialized in Zotero.Sync.Storage.Session.WebDAV.rootURI");
	}
	return this._rootURI.clone();
});

Zotero.Sync.Storage.Session.WebDAV.prototype.__defineGetter__('parentURI', function () {
	if (!this._parentURI) {
		throw ("Parent URI not initialized in Zotero.Sync.Storage.Session.WebDAV.parentURI");
	}
	return this._parentURI.clone();
});


Zotero.Sync.Storage.Session.WebDAV.prototype.init = function (url, dir, username, password) {
	if (!url) {
		var msg = "WebDAV URL not provided";
		Zotero.debug(msg);
		throw ({
			message: msg,
			name: "Z_ERROR_NO_URL",
			filename: "webdav.js",
			toString: function () { return this.message; }
		});
	}
	
	if (username && !password) {
		var msg = "WebDAV password not provided";
		Zotero.debug(msg);
		throw ({
			message: msg,
			name: "Z_ERROR_NO_PASSWORD",
			filename: "webdav.js",
			toString: function () { return this.message; }
		});
	}
	
	var ios = Components.classes["@mozilla.org/network/io-service;1"].
				getService(Components.interfaces.nsIIOService);
	try {
		var uri = ios.newURI(url, null, null);
		if (username) {
			uri.username = username;
			uri.password = password;
		}
	}
	catch (e) {
		Zotero.debug(e);
		Components.utils.reportError(e);
		return false;
	}
	if (!uri.spec.match(/\/$/)) {
		uri.spec += "/";
	}
	this._parentURI = uri;
	
	var uri = uri.clone();
	uri.spec += "zotero/";
	this._rootURI = uri;
	return true;
}


Zotero.Sync.Storage.Session.WebDAV.prototype.initFromPrefs = function () {
	var scheme = Zotero.Prefs.get('sync.storage.scheme');
	switch (scheme) {
		case 'http':
		case 'https':
			break;
		
		default:
			throw ("Invalid WebDAV scheme '" + scheme
				+ "' in Zotero.Sync.Storage.Session.WebDAV.rootURI");
	}
	
	var url = Zotero.Prefs.get('sync.storage.url');
	if (!url) {
		return false;
	}
	
	url = scheme + '://' + url;
	var dir = "zotero";
	var username = this.username;
	var password = this.password;
	
	return this.init(url, dir, username, password);
}


/**
 * Get mod time of file on storage server
 *
 * @param	{Zotero.Item}	item
 * @param	{Function}		callback		Callback f(item, mdate)
 */
Zotero.Sync.Storage.Session.WebDAV.prototype._getStorageModificationTime = function (item, callback) {
	var uri = this._getItemPropertyURI(item);
	
	var self = this;
	
	Zotero.HTTP.doGet(uri, function (req) {
		self._checkResponse(req, self);
		
		var funcName = "Zotero.Sync.Storage.WebDAV_getStorageModificationTime()";
		
		// mod_speling can return 300s for 404s with base name matches
		if (req.status == 404 || req.status == 300) {
			callback(item, false);
			return;
		}
		else if (req.status != 200) {
			Zotero.debug(req.responseText);
			self.onError("Unexpected status code " + req.status + " in " + funcName);
			return;
		}
		
		Zotero.debug(req.responseText);
		
		// No modification time set
		if (!req.responseText) {
			callback(item, false);
			return;
		}
		
		try {
			var xml = new XML(req.responseText);
		}
		catch (e) {
			Zotero.debug(e);
			var xml = null;
		}
		
		if (xml) {
			Zotero.debug(xml.children().length());
		}
		
		if (xml && xml.children().length()) {
			// TODO: other stuff, but this makes us forward-compatible
			mtime = xml.mtime.toString();
			var seconds = false;
		}
		else {
			mtime = req.responseText;
			var seconds = true;
		}
		
		var invalid = false;
		
		// Unix timestamps need to be converted to ms-based timestamps
		if (seconds) {
			if (mtime.match(/^[0-9]{1,10}$/)) {
				Zotero.debug("Converting Unix timestamp '" + mtime + "' to milliseconds");
				mtime = mtime * 1000;
			}
			else {
				invalid = true;
			}
		}
		else if (!mtime.match(/^[0-9]{1,13}$/)) {
			invalid = true;
		}
		
		// Delete invalid .prop files
		if (invalid) {
			var msg = "Invalid mod date '" + Zotero.Utilities.ellipsize(mtime, 20)
				+ "' for item " + Zotero.Items.getLibraryKeyHash(item);
			Zotero.debug(msg, 1);
			Components.utils.reportError(msg);
			self._deleteStorageFiles([item.key + ".prop"], null, self);
			self.onError();
			return;
		}
		
		var mdate = new Date(parseInt(mtime));
		callback(item, mdate);
	});
}


/**
 * Set mod time of file on storage server
 *
 * @param	{Zotero.Item}	item
 * @param	{Function}		callback		Callback f(item, props)
 */
Zotero.Sync.Storage.Session.WebDAV.prototype._setStorageModificationTime = function (item, callback) {
	var uri = this._getItemPropertyURI(item);
	
	var mtime = item.attachmentModificationTime;
	var hash = item.attachmentHash;
	
	var prop = <properties version="1">
		<mtime>{mtime}</mtime>
		<hash>{hash}</hash>
	</properties>;
	
	Zotero.HTTP.WebDAV.doPut(uri, prop.toXMLString(), function (req) {
		switch (req.status) {
			case 200:
			case 201:
			case 204:
				break;
			
			default:
				Zotero.debug(req.responseText);
				throw ("Unexpected status code " + req.status + " in "
					+ "Zotero.Sync.Storage._setStorageModificationTime()");
		}
		callback(item, { mtime: mtime, hash: hash });
	});
}



/**
 * Begin download process for individual file
 *
 * @param	{Zotero.Sync.Storage.Request}	[request]
 */
Zotero.Sync.Storage.Session.WebDAV.prototype.downloadFile = function (request) {
	var funcName = "Zotero.Sync.Storage.Session.WebDAV.downloadFile()";
	
	var item = Zotero.Sync.Storage.getItemFromRequestName(request.name);
	if (!item) {
		throw ("Item '" + request.name + "' not found in " + funcName);
	}
	
	var self = this;
	
	// Retrieve modification time from server to store locally afterwards 
	this._getStorageModificationTime(item, function (item, mdate) {
		if (!request.isRunning()) {
			Zotero.debug("Download request '" + request.name
				+ "' is no longer running after getting mod time");
			return;
		}
		
		if (!mdate) {
			Zotero.debug("Remote file not found for item " + Zotero.Items.getLibraryKeyHash(item));
			request.finish();
			return;
		}
		
		try {
			var syncModTime = mdate.getTime();
			
			// Skip download if local file exists and matches mod time
			var file = item.getFile();
			if (file && file.exists() && syncModTime == file.lastModifiedTime) {
				Zotero.debug("File mod time matches remote file -- skipping download");
				
				Zotero.DB.beginTransaction();
				var syncState = Zotero.Sync.Storage.getSyncState(item.id);
				var updateItem = syncState != 1;
				Zotero.Sync.Storage.setSyncedModificationTime(item.id, syncModTime, updateItem);
				Zotero.Sync.Storage.setSyncState(item.id, Zotero.Sync.Storage.SYNC_STATE_IN_SYNC);
				Zotero.DB.commitTransaction();
				self.onChangesMade();
				request.finish();
				return;
			}
			
			var uri = self._getItemURI(item);
			var destFile = Zotero.getTempDirectory();
			destFile.append(item.key + '.zip.tmp');
			if (destFile.exists()) {
				destFile.remove(false);
			}
			
			var listener = new Zotero.Sync.Storage.StreamListener(
				{
					onStart: function (request, data) {
						if (data.request.isFinished()) {
							Zotero.debug("Download request " + data.request.name
								+ " stopped before download started -- closing channel");
							request.cancel(0x804b0002); // NS_BINDING_ABORTED
							return;
						}
					},
					onProgress: function (a, b, c) {
						request.onProgress(a, b, c)
					},
					onStop: function (request, status, response, data) {
						if (status == 404) {
							var msg = "Remote ZIP file not found for item " + item.key;
							Zotero.debug(msg, 2);
							Components.utils.reportError(msg);
							
							// Delete the orphaned prop file
							self._deleteStorageFiles([item.key + ".prop"], null, self);
							
							data.request.finish();
							return;
						}
						else if (status != 200) {
							var msg = "Unexpected status code " + status
								+ " for request " + data.request.name + " in Zotero.Sync.Storage.Session.WebDAV.downloadFile()";
							Zotero.debug(msg, 1);
							Components.utils.reportError(msg);
							self.onError();
							return;
						}
						
						// Don't try to process if the request has been cancelled
						if (data.request.isFinished()) {
							Zotero.debug("Download request " + data.request.name
								+ " is no longer running after file download");
							return;
						}
						
						Zotero.debug("Finished download of " + destFile.path);
						
						try {
							Zotero.Sync.Storage.processDownload(data);
							data.request.finish();
						}
						catch (e) {
							self.onError(e);
						}
					},
					request: request,
					item: item,
					compressed: true,
					syncModTime: syncModTime
				}
			);
			
			// Don't display password in console
			var disp = uri.clone();
			if (disp.password) {
				disp.password = '********';
			}
			Zotero.debug('Saving ' + disp.spec + ' with saveURI()');
			const nsIWBP = Components.interfaces.nsIWebBrowserPersist;
			var wbp = Components
				.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"]
				.createInstance(nsIWBP);
			wbp.persistFlags = nsIWBP.PERSIST_FLAGS_BYPASS_CACHE;
			wbp.progressListener = listener;
			wbp.saveURI(uri, null, null, null, null, destFile);
		}
		catch (e) {
			request.error(e);
		}
	});
}


Zotero.Sync.Storage.Session.WebDAV.prototype.uploadFile = function (request) {
	var self = this;
	Zotero.Sync.Storage.createUploadFile(request, function (data) { self._processUploadFile(data); });
}

/**
 * Upload the generated ZIP file to the server
 *
 * @param	{Object}		Object with 'request' property
 * @return	{void}
 */
Zotero.Sync.Storage.Session.WebDAV.prototype._processUploadFile = function (data) {
	/*
	_updateSizeMultiplier(
		(100 - Zotero.Sync.Storage.compressionTracker.ratio) / 100
	);
	*/
	var request = data.request;
	var item = Zotero.Sync.Storage.getItemFromRequestName(request.name);
	
	var self = this;
	
	this._getStorageModificationTime(item, function (item, mdate) {
		try {
			if (!request.isRunning()) {
				Zotero.debug("Upload request '" + request.name
					+ "' is no longer running after getting mod time");
				return;
			}
			
			// Check for conflict
			if (Zotero.Sync.Storage.getSyncState(item.id)
					!= Zotero.Sync.Storage.SYNC_STATE_FORCE_UPLOAD) {
				if (mdate) {
					// Remote prop time
					var mtime = mdate.getTime();
					
					// Local file time
					var fmtime = item.attachmentModificationTime;
					
					var same = false;
					if (fmtime == mtime) {
						same = true;
						Zotero.debug("File mod time matches remote file -- skipping upload");
					}
					// Allow floored timestamps for filesystems that don't support
					// millisecond precision (e.g., HFS+)
					else if (Math.floor(mtime / 1000) * 1000 == fmtime || Math.floor(fmtime / 1000) * 1000 == mtime) {
						same = true;
						Zotero.debug("File mod times are within one-second precision (" + fmtime + " ≅ " + mtime + ") "
							+ "-- skipping upload");
					}
					// Allow timestamp to be exactly one hour off to get around
					// time zone issues -- there may be a proper way to fix this
					else if (Math.abs(fmtime - mtime) == 3600000
							// And check with one-second precision as well
							|| Math.abs(fmtime - Math.floor(mtime / 1000) * 1000) == 3600000
							|| Math.abs(Math.floor(fmtime / 1000) * 1000 - mtime) == 3600000) {
						same = true;
						Zotero.debug("File mod time (" + fmtime + ") is exactly one hour off remote file (" + mtime + ") "
							+ "-- assuming time zone issue and skipping upload");
					}
					
					if (same) {
						Zotero.DB.beginTransaction();
						var syncState = Zotero.Sync.Storage.getSyncState(item.id);
						Zotero.Sync.Storage.setSyncedModificationTime(item.id, fmtime, true);
						Zotero.Sync.Storage.setSyncState(item.id, Zotero.Sync.Storage.SYNC_STATE_IN_SYNC);
						Zotero.DB.commitTransaction();
						self.onChangesMade();
						request.finish();
						return;
					}
					
					var smtime = Zotero.Sync.Storage.getSyncedModificationTime(item.id);
					if (smtime != mtime) {
						var localData = { modTime: fmtime };
						var remoteData = { modTime: mtime };
						Zotero.Sync.Storage.QueueManager.addConflict(
							request.name, localData, remoteData
						);
						Zotero.debug("Conflict -- last synced file mod time "
							+ "does not match time on storage server"
							+ " (" + smtime + " != " + mtime + ")");
						request.finish();
						return;
					}
				}
				else {
					Zotero.debug("Remote file not found for item " + item.id);
				}
			}
			
			var file = Zotero.getTempDirectory();
			file.append(item.key + '.zip');
			
			var fis = Components.classes["@mozilla.org/network/file-input-stream;1"]
						.createInstance(Components.interfaces.nsIFileInputStream);
			fis.init(file, 0x01, 0, 0);
			
			var bis = Components.classes["@mozilla.org/network/buffered-input-stream;1"]
						.createInstance(Components.interfaces.nsIBufferedInputStream)
			bis.init(fis, 64 * 1024);
			
			var uri = self._getItemURI(item);
			
			var ios = Components.classes["@mozilla.org/network/io-service;1"].
						getService(Components.interfaces.nsIIOService);
			var channel = ios.newChannelFromURI(uri);
			channel.QueryInterface(Components.interfaces.nsIUploadChannel);
			channel.setUploadStream(bis, 'application/octet-stream', -1);
			channel.QueryInterface(Components.interfaces.nsIHttpChannel);
			channel.requestMethod = 'PUT';
			channel.allowPipelining = false;
			
			channel.setRequestHeader('Keep-Alive', '', false);
			channel.setRequestHeader('Connection', '', false);
			
			var listener = new Zotero.Sync.Storage.StreamListener(
				{
					onProgress: function (a, b, c) {
						request.onProgress(a, b, c);
					},
					onStop: function (httpRequest, status, response, data) { self._onUploadComplete(httpRequest, status, response,data); },
					onCancel: function (httpRequest, status, data) { self._onUploadCancel(httpRequest, status, data); },
					request: request,
					item: item,
					streams: [fis, bis]
				}
			);
			channel.notificationCallbacks = listener;
			
			var dispURI = uri.clone();
			if (dispURI.password) {
				dispURI.password = '********';
			}
			Zotero.debug("HTTP PUT of " + file.leafName + " to " + dispURI.spec);
			
			channel.asyncOpen(listener, null);
		}
		catch (e) {
			self.onError(e);
		}
	});
}


Zotero.Sync.Storage.Session.WebDAV.prototype._onUploadComplete = function (httpRequest, status, response, data) {
	var request = data.request;
	var item = data.item;
	var url = httpRequest.name;
	
	Zotero.debug("Upload of attachment " + item.key
		+ " finished with status code " + status);
	
	switch (status) {
		case 200:
		case 201:
		case 204:
			break;
		
		case 403:
		case 500:
			this.onError(Zotero.localeJoin([
				Zotero.getString('sync.storage.error.fileUploadFailed'),
				Zotero.getString('sync.storage.error.checkFileSyncSettings')
			]));
			return;
		
		case 507:
			this.onError(Zotero.getString('sync.storage.error.webdav.insufficientSpace'));
			return;
		
		default:
			this.onError("Unexpected file upload status " + status
				+ " in Zotero.Sync.Storage.WebDAV._onUploadComplete()");
			return;
	}
	
	var self = this;
	
	this._setStorageModificationTime(item, function (item, props) {
		if (!request.isRunning()) {
			Zotero.debug("Upload request '" + request.name
				+ "' is no longer running after getting mod time");
			return;
		}
		
		Zotero.DB.beginTransaction();
		
		Zotero.Sync.Storage.setSyncState(item.id, Zotero.Sync.Storage.SYNC_STATE_IN_SYNC);
		Zotero.Sync.Storage.setSyncedModificationTime(item.id, props.mtime, true);
		Zotero.Sync.Storage.setSyncedHash(item.id, props.hash);
		
		Zotero.DB.commitTransaction();
		
		try {
			var file = Zotero.getTempDirectory();
			file.append(item.key + '.zip');
			file.remove(false);
		}
		catch (e) {
			Components.utils.reportError(e);
		}
		
		self.onChangesMade();
		request.finish();
	});
}


Zotero.Sync.Storage.Session.WebDAV.prototype._onUploadCancel = function (httpRequest, status, data) {
	var request = data.request;
	var item = data.item;
	
	Zotero.debug("Upload of attachment " + item.key + " cancelled with status code " + status);
	
	try {
		var file = Zotero.getTempDirectory();
		file.append(item.key + '.zip');
		file.remove(false);
	}
	catch (e) {
		Components.utils.reportError(e);
	}
	
	request.finish();
}


Zotero.Sync.Storage.Session.WebDAV.prototype.getLastSyncTime = function (callback) {
	// Cache the credentials at the root URI
	if (!this._cachedCredentials) {
		var self = this;
		
		Zotero.HTTP.doOptions(this.rootURI, function (req) {
			self._checkResponse(req, self);
			
			if (req.status != 200) {
				var msg = "Unexpected status code " + req.status + " for OPTIONS request "
					+ "in Zotero.Sync.Storage.Session.WebDAV.getLastSyncTime()";
				Zotero.debug(msg, 1);
				Components.utils.reportError(msg);
				self.onError(Zotero.Sync.Storage.Session.WebDAV.prototype.defaultErrorRestart);
				return;
			}
			self._cachedCredentials = true;
			self.getLastSyncTime(callback);
		});
		return;
	}
	
	try {
		var uri = this.rootURI;
		var successFileURI = uri.clone();
		successFileURI.spec += "lastsync";
		Zotero.HTTP.doGet(successFileURI, function (req) {
			var ts = undefined;
			try {
				if (req.responseText) {
					Zotero.debug(req.responseText);
				}
				Zotero.debug(req.status);
				
				if (req.status == 403) {
					Zotero.debug("Clearing WebDAV authentication credentials", 2);
					self._cachedCredentials = false;
				}
				
				if (req.status != 200 && req.status != 404) {
					var msg = "Unexpected status code " + req.status + " for HEAD request "
						+ "in Zotero.Sync.Storage.Session.WebDAV.getLastSyncTime()";
					Zotero.debug(msg, 1);
					Components.utils.reportError(msg);
					self.onError();
					return;
				}
				
				if (req.status == 200) {
					var lastModified = req.getResponseHeader("Last-Modified");
					var date = new Date(lastModified);
					Zotero.debug("Last successful storage sync was " + date);
					ts = Zotero.Date.toUnixTimestamp(date);
				}
				else {
					ts = null;
				}
			}
			finally {
				callback(ts);
			}
		});
		return;
	}
	catch (e) {
		Zotero.debug(e);
		Components.utils.reportError(e);
		callback();
		return;
	}
}


Zotero.Sync.Storage.Session.WebDAV.prototype.setLastSyncTime = function (callback) {
	try {
		var uri = this.rootURI;
		var successFileURI = uri.clone();
		successFileURI.spec += "lastsync";
		
		var self = this;
		
		Zotero.HTTP.WebDAV.doPut(successFileURI, " ", function (req) {
			Zotero.debug(req.responseText);
			Zotero.debug(req.status);
			
			switch (req.status) {
				case 200:
				case 201:
				case 204:
					self.getLastSyncTime(function (ts) {
						if (ts) {
							var sql = "REPLACE INTO version VALUES ('storage_webdav', ?)";
							Zotero.DB.query(sql, { int: ts });
						}
						if (callback) {
							callback();
						}
					});
					return;
			}
			
			var msg = "Unexpected error code " + req.status + " uploading storage success file";
			Zotero.debug(msg, 2);
			Components.utils.reportError(msg);
			if (callback) {
				callback();
			}
		});
	}
	catch (e) {
		Zotero.debug(e);
		Components.utils.reportError(e);
		if (callback) {
			callback();
		}
		return;
	}
}


/**
 * @param	{Function}	callback			Function to pass URI and result value to
 * @param	{Object}		errorCallbacks
 */
Zotero.Sync.Storage.Session.WebDAV.prototype.checkServer = function (callback) {
	try {
		var parentURI = this.parentURI;
		var uri = this.rootURI;
	}
	catch (e) {
		switch (e.name) {
			case 'Z_ERROR_NO_URL':
				callback(null, Zotero.Sync.Storage.ERROR_NO_URL);
				return;
			
			case 'Z_ERROR_NO_PASSWORD':
				callback(null, Zotero.Sync.Storage.ERROR_NO_PASSWORD);
				return;
				
			default:
				Zotero.debug(e);
				Components.utils.reportError(e);
				callback(null, Zotero.Sync.Storage.ERROR_UNKNOWN);
				return;
		}
	}
	
	var requestHolder = { request: null };
	
	var prolog = '<?xml version="1.0" encoding="utf-8" ?>\n';
	var D = new Namespace("D", "DAV:");
	var nsDeclarations = 'xmlns:' + D.prefix + '=' + '"' + D.uri + '"';
	
	var requestXML = new XML('<D:propfind ' + nsDeclarations + '/>');
	requestXML.D::prop = '';
	// IIS 5.1 requires at least one property in PROPFIND
	requestXML.D::prop.D::getcontentlength = '';
	
	var xmlstr = prolog + requestXML.toXMLString();
	
	var self = this;
	
	// Test whether URL is WebDAV-enabled
	var request = Zotero.HTTP.doOptions(uri, function (req) {
		// Timeout
		if (req.status == 0) {
			self._checkResponse(req, self);
			
			callback(uri, Zotero.Sync.Storage.ERROR_UNREACHABLE);
			return;
		}
		
		Zotero.debug(req.getAllResponseHeaders());
		Zotero.debug(req.responseText);
		Zotero.debug(req.status);
		
		switch (req.status) {
			case 400:
				callback(uri, Zotero.Sync.Storage.ERROR_BAD_REQUEST);
				return;
			
			case 401:
				callback(uri, Zotero.Sync.Storage.ERROR_AUTH_FAILED);
				return;
			
			case 403:
				callback(uri, Zotero.Sync.Storage.ERROR_FORBIDDEN);
				return;
			
			case 500:
				callback(uri, Zotero.Sync.Storage.ERROR_SERVER_ERROR);
				return;
		}
		
		var dav = req.getResponseHeader("DAV");
		if (dav == null) {
			callback(uri, Zotero.Sync.Storage.ERROR_NOT_DAV);
			return;
		}
		
		// Get the Authorization header used in case we need to do a request
		// on the parent below
		var channelAuthorization = Zotero.HTTP.getChannelAuthorization(req.channel);
		
		var headers = { Depth: 0 };
		
		// Test whether Zotero directory exists
		Zotero.HTTP.WebDAV.doProp("PROPFIND", uri, xmlstr, function (req) {
			Zotero.debug(req.responseText);
			Zotero.debug(req.status);
			
			switch (req.status) {
				case 207:
					// Test if Zotero directory is writable
					var testFileURI = uri.clone();
					testFileURI.spec += "zotero-test-file";
					Zotero.HTTP.WebDAV.doPut(testFileURI, " ", function (req) {
						Zotero.debug(req.responseText);
						Zotero.debug(req.status);
						
						switch (req.status) {
							case 200:
							case 201:
							case 204:
								Zotero.HTTP.doGet(
									testFileURI,
									function (req) {
										Zotero.debug(req.responseText);
										Zotero.debug(req.status);
										
										switch (req.status) {
											case 200:
												// Delete test file
												Zotero.HTTP.WebDAV.doDelete(
													testFileURI,
													function (req) {
														Zotero.debug(req.responseText);
														Zotero.debug(req.status);
														
														switch (req.status) {
															case 200: // IIS 5.1 and Sakai return 200
															case 204:
																callback(
																	uri,
																	Zotero.Sync.Storage.SUCCESS
																);
																return;
															
															case 401:
																callback(uri, Zotero.Sync.Storage.ERROR_AUTH_FAILED);
																return;
															
															case 403:
																callback(uri, Zotero.Sync.Storage.ERROR_FORBIDDEN);
																return;
															
															default:
																callback(uri, Zotero.Sync.Storage.ERROR_UNKNOWN);
																return;
														}
													}
												);
												return;
											
											case 401:
												callback(uri, Zotero.Sync.Storage.ERROR_AUTH_FAILED);
												return;
											
											case 403:
												callback(uri, Zotero.Sync.Storage.ERROR_FORBIDDEN);
												return;
											
											// IIS 6+ configured not to serve extensionless files or .prop files
											// http://support.microsoft.com/kb/326965
											case 404:
												callback(uri, Zotero.Sync.Storage.ERROR_FILE_MISSING_AFTER_UPLOAD);
												return;
											
											case 500:
												callback(uri, Zotero.Sync.Storage.ERROR_SERVER_ERROR);
												return;
											
											default:
												callback(uri, Zotero.Sync.Storage.ERROR_UNKNOWN);
												return;
										}
									}
								);
								return;
							
							case 401:
								callback(uri, Zotero.Sync.Storage.ERROR_AUTH_FAILED);
								return;
							
							case 403:
								callback(uri, Zotero.Sync.Storage.ERROR_FORBIDDEN);
								return;
							
							case 500:
								callback(uri, Zotero.Sync.Storage.ERROR_SERVER_ERROR);
								return;
							
							default:
								callback(uri, Zotero.Sync.Storage.ERROR_UNKNOWN);
								return;
						}
					});
					return;
				
				case 400:
					callback(uri, Zotero.Sync.Storage.ERROR_BAD_REQUEST);
					return;
				
				case 401:
					callback(uri, Zotero.Sync.Storage.ERROR_AUTH_FAILED);
					return;
				
				case 403:
					callback(uri, Zotero.Sync.Storage.ERROR_FORBIDDEN);
					return;
				
				case 404:
					// Include Authorization header from /zotero request,
					// since Firefox probably won't apply it to the parent request
					var newHeaders = {};
					for (var header in headers) {
						newHeaders[header] = headers[header];
					}
					newHeaders["Authorization"] = channelAuthorization;
					
					// Zotero directory wasn't found, so see if at least
					// the parent directory exists
					Zotero.HTTP.WebDAV.doProp("PROPFIND", parentURI, xmlstr,
						function (req) {
							Zotero.debug(req.responseText);
							Zotero.debug(req.status);
							
							switch (req.status) {
								// Parent directory existed
								case 207:
									callback(uri, Zotero.Sync.Storage.ERROR_ZOTERO_DIR_NOT_FOUND);
									return;
								
								case 400:
									callback(uri, Zotero.Sync.Storage.ERROR_BAD_REQUEST);
									return;
								
								case 401:
									callback(uri, Zotero.Sync.Storage.ERROR_AUTH_FAILED);
									return;
								
								// Parent directory wasn't found either
								case 404:
									callback(uri, Zotero.Sync.Storage.ERROR_PARENT_DIR_NOT_FOUND);
									return;
								
								default:
									callback(uri, Zotero.Sync.Storage.ERROR_UNKNOWN);
									return;
							}
						},  newHeaders);
					return;
				
				case 500:
					callback(uri, Zotero.Sync.Storage.ERROR_SERVER_ERROR);
					return;
					
				default:
					callback(uri, Zotero.Sync.Storage.ERROR_UNKNOWN);
					return;
			}
		}, headers);
	});
	
	if (!request) {
		callback(uri, Zotero.Sync.Storage.ERROR_OFFLINE);
	}
	
	requestHolder.request = request;
	return requestHolder;
}


Zotero.Sync.Storage.Session.WebDAV.prototype.checkServerCallback = function (uri, status, window, skipSuccessMessage, e) {
	var promptService =
		Components.classes["@mozilla.org/embedcomp/prompt-service;1"].
			createInstance(Components.interfaces.nsIPromptService);
	if (uri) {
		var spec = uri.scheme + '://' + uri.hostPort + uri.path;
	}
	
	// If there's an error, just display that
	if (e) {
		promptService.alert(
			window,
			Zotero.getString('general.error'),
			e.toString()
		);
		return false;
	}
	
	switch (status) {
		case Zotero.Sync.Storage.SUCCESS:
			if (!skipSuccessMessage) {
				promptService.alert(
					window,
					Zotero.getString('sync.storage.serverConfigurationVerified'),
					Zotero.getString('sync.storage.fileSyncSetUp')
				);
			}
			Zotero.Prefs.set("sync.storage.verified", true);
			return true;
		
		case Zotero.Sync.Storage.ERROR_NO_URL:
			var errorMessage = Zotero.getString('sync.storage.error.webdav.enterURL');
			break;
		
		case Zotero.Sync.Storage.ERROR_NO_PASSWORD:
			var errorMessage = Zotero.getString('sync.error.enterPassword');
			break;
		
		case Zotero.Sync.Storage.ERROR_UNREACHABLE:
			var errorMessage = Zotero.getString('sync.storage.error.serverCouldNotBeReached', uri.host);
			break;
		
		case Zotero.Sync.Storage.ERROR_NOT_DAV:
			var errorMessage = Zotero.getString('sync.storage.error.webdav.invalidURL', spec);
			break;
		
		case Zotero.Sync.Storage.ERROR_AUTH_FAILED:
			var errorTitle = Zotero.getString('general.permissionDenied');
			var errorMessage = Zotero.localeJoin([
				Zotero.getString('sync.storage.error.webdav.invalidLogin'),
				Zotero.getString('sync.storage.error.checkFileSyncSettings')
			]);
			break;
		
		case Zotero.Sync.Storage.ERROR_FORBIDDEN:
			var errorTitle = Zotero.getString('general.permissionDenied');
			var errorMessage = Zotero.localeJoin([
				Zotero.getString('sync.storage.error.webdav.permissionDenied', uri.path),
				Zotero.getString('sync.storage.error.checkFileSyncSettings')
			]);
			break;
		
		case Zotero.Sync.Storage.ERROR_PARENT_DIR_NOT_FOUND:
			var errorTitle = Zotero.getString('sync.storage.error.directoryNotFound');
			var parentSpec = spec.replace(/\/zotero\/$/, "");
			var errorMessage = Zotero.getString('sync.storage.error.doesNotExist', parentSpec);
			break;
		
		case Zotero.Sync.Storage.ERROR_ZOTERO_DIR_NOT_FOUND:
			var create = promptService.confirmEx(
				window,
				Zotero.getString('sync.storage.error.directoryNotFound'),
				Zotero.getString('sync.storage.error.doesNotExist', spec) + "\n\n"
					+ Zotero.getString('sync.storage.error.createNow'),
				promptService.BUTTON_POS_0
					* promptService.BUTTON_TITLE_IS_STRING
				+ promptService.BUTTON_POS_1
					* promptService.BUTTON_TITLE_CANCEL,
				Zotero.getString('general.create'),
				null, null, null, {}
			);
			
			if (create != 0) {
				return;
			}
			
			this._createServerDirectory(function (uri, status) {
				switch (status) {
					case Zotero.Sync.Storage.SUCCESS:
						if (!skipSuccessMessage) {
							promptService.alert(
								window,
								Zotero.getString('sync.storage.serverConfigurationVerified'),
								Zotero.getString('sync.storage.fileSyncSetUp')
							);
						}
						Zotero.Prefs.set("sync.storage.verified", true);
						return true;
					
					case Zotero.Sync.Storage.ERROR_FORBIDDEN:
						var errorTitle = Zotero.getString('general.permissionDenied');
						var errorMessage = Zotero.getString('sync.storage.error.permissionDeniedAtAddress') + "\n\n"
							+ spec + "\n\n"
							+ Zotero.getString('sync.storage.error.checkFileSyncSettings');
						break;
				}
				
				// TEMP
				if (!errorMessage) {
					var errorMessage = status;
				}
				promptService.alert(window, errorTitle, errorMessage);
			});
			
			return false;
		
		case Zotero.Sync.Storage.ERROR_FILE_MISSING_AFTER_UPLOAD:
			// TODO: localize
			var errorTitle = "WebDAV Server Configuration Error";
			var errorMessage = "Your WebDAV server must be configured to serve files without extensions "
				+ "and files with .prop extensions in order to work with Zotero.";
			break;
		
		case Zotero.Sync.Storage.ERROR_SERVER_ERROR:
			// TODO: localize
			var errorTitle = "WebDAV Server Configuration Error";
			var errorMessage = "Your WebDAV server returned an internal error."
				+ "\n\n" + Zotero.getString('sync.storage.error.checkFileSyncSettings');
			break;
		
		case Zotero.Sync.Storage.ERROR_UNKNOWN:
			var errorMessage = Zotero.localeJoin([
				Zotero.getString('general.unknownErrorOccurred'),
				Zotero.getString('sync.storage.error.checkFileSyncSettings')
			]);
			break;
	}
	
	if (!skipSuccessMessage) {
		if (!errorTitle) {
			var errorTitle = Zotero.getString("general.error");
		}
		// TEMP
		if (!errorMessage) {
			var errorMessage = status;
		}
		promptService.alert(window, errorTitle, errorMessage);
	}
	return false;
}


/**
 * Remove files on storage server that were deleted locally more than
 * sync.storage.deleteDelayDays days ago
 *
 * @param	{Function}	callback		Passed number of files deleted
 */
Zotero.Sync.Storage.Session.WebDAV.prototype.purgeDeletedStorageFiles = function (callback) {
	if (!this.active) {
		return;
	}
	
	Zotero.debug("Purging deleted storage files");
	var files = Zotero.Sync.Storage.getDeletedFiles();
	if (!files) {
		Zotero.debug("No files to delete remotely");
		if (callback) {
			callback();
		}
		return;
	}
	
	// Add .zip extension
	var files = files.map(function (file) file + ".zip");
	
	this._deleteStorageFiles(files, function (results) {
		// Remove deleted and nonexistent files from storage delete log
		var toPurge = results.deleted.concat(results.missing);
		if (toPurge.length > 0) {
			var done = 0;
			var maxFiles = 999;
			var numFiles = toPurge.length;
			
			Zotero.DB.beginTransaction();
			
			do {
				var chunk = toPurge.splice(0, maxFiles);
				var sql = "DELETE FROM storageDeleteLog WHERE key IN ("
					+ chunk.map(function () '?').join() + ")";
				Zotero.DB.query(sql, chunk);
				done += chunk.length;
			}
			while (done < numFiles);
			
			Zotero.DB.commitTransaction();
		}
		
		if (callback) {
			callback(results.deleted.length);
		}
	});
}


/**
 * Delete orphaned storage files older than a day before last sync time
 *
 * @param	{Function}	callback
 */
Zotero.Sync.Storage.Session.WebDAV.prototype.purgeOrphanedStorageFiles = function (callback) {
	const daysBeforeSyncTime = 1;
	
	if (!this.active) {
		return;
	}
	
	// If recently purged, skip
	var lastpurge = Zotero.Prefs.get('lastWebDAVOrphanPurge');
	var days = 10;
	if (lastpurge && new Date(lastpurge * 1000) > (new Date() - (1000 * 60 * 60 * 24 * days))) {
		return;
	}
	
	Zotero.debug("Purging orphaned storage files");
	
	var uri = this.rootURI;
	var path = uri.path;
	
	var prolog = '<?xml version="1.0" encoding="utf-8" ?>\n';
	var D = new Namespace("D", "DAV:");
	var nsDeclarations = 'xmlns:' + D.prefix + '=' + '"' + D.uri + '"';
	
	var requestXML = new XML('<D:propfind ' + nsDeclarations + '/>');
	requestXML.D::prop = '';
	requestXML.D::prop.D::getlastmodified = '';
	
	var xmlstr = prolog + requestXML.toXMLString();
	
	var lastSyncDate = new Date(Zotero.Sync.Server.lastLocalSyncTime * 1000);
	
	var self = this;
	
	Zotero.HTTP.WebDAV.doProp("PROPFIND", uri, xmlstr, function (req) {
		Zotero.debug(req.responseText);
			
		var funcName = "Zotero.Sync.Storage.purgeOrphanedStorageFiles()";
		
		// Strip XML declaration and convert to E4X
		var xml = new XML(req.responseText.replace(/<\?xml.*\?>/, ''));
		
		var deleteFiles = [];
		var trailingSlash = !!path.match(/\/$/);
		for each(var response in xml.D::response) {
			var href = response.D::href.toString();
			
			// Strip trailing slash if there isn't one on the root path
			if (!trailingSlash) {
				href = href.replace(/\/$/, "")
			}
			
			// Absolute
			if (href.match(/^https?:\/\//)) {
				var ios = Components.classes["@mozilla.org/network/io-service;1"].
							getService(Components.interfaces.nsIIOService);
				var href = ios.newURI(href, null, null);
				href = href.path;
			}
			
			// Skip root URI
			if (href == path
					// Some Apache servers respond with a "/zotero" href
					// even for a "/zotero/" request
					|| (trailingSlash && href + '/' == path)
					// Try URL-encoded as well, as above
					|| decodeURIComponent(href) == path) {
				continue;
			}
			
			if (href.indexOf(path) == -1
					// Try URL-encoded as well, in case there's a '~' or similar
					// character in the URL and the server (e.g., Sakai) is
					// encoding the value
					&& decodeURIComponent(href).indexOf(path) == -1) {
				self.onError("DAV:href '" + href
						+ "' does not begin with path '" + path + "' in " + funcName);
			}
			
			var matches = href.match(/[^\/]+$/);
			if (!matches) {
				self.onError("Unexpected href '" + href + "' in " + funcName)
			}
			var file = matches[0];
			
			if (file.indexOf('.') == 0) {
				Zotero.debug("Skipping hidden file " + file);
				continue;
			}
			if (!file.match(/\.zip$/) && !file.match(/\.prop$/)) {
				Zotero.debug("Skipping file " + file);
				continue;
			}
			
			var key = file.replace(/\.(zip|prop)$/, '');
			var item = Zotero.Items.getByLibraryAndKey(null, key);
			if (item) {
				Zotero.debug("Skipping existing file " + file);
				continue;
			}
			
			Zotero.debug("Checking orphaned file " + file);
			
			// TODO: Parse HTTP date properly
			var lastModified = response..*::getlastmodified.toString();
			lastModified = Zotero.Date.strToISO(lastModified);
			lastModified = Zotero.Date.sqlToDate(lastModified);
			
			// Delete files older than a day before last sync time
			var days = (lastSyncDate - lastModified) / 1000 / 60 / 60 / 24;
			
			if (days > daysBeforeSyncTime) {
				deleteFiles.push(file);
			}
		}
		
		self._deleteStorageFiles(deleteFiles, function (results) {
			Zotero.Prefs.set("lastWebDAVOrphanPurge", Math.round(new Date().getTime() / 1000))
			if (callback) {
				callback(results);
			}
		});
	},
	{ Depth: 1 });
}


/**
 * Create a Zotero directory on the storage server
 */
Zotero.Sync.Storage.Session.WebDAV.prototype._createServerDirectory = function (callback) {
	var uri = this.rootURI;
	Zotero.HTTP.WebDAV.doMkCol(uri, function (req) {
		Zotero.debug(req.responseText);
		Zotero.debug(req.status);
		
		switch (req.status) {
			case 201:
				callback(uri, Zotero.Sync.Storage.SUCCESS);
				break;
			
			case 401:
				callback(uri, Zotero.Sync.Storage.ERROR_AUTH_FAILED);
				return;
			
			case 403:
				callback(uri, Zotero.Sync.Storage.ERROR_FORBIDDEN);
				return;
			
			case 405:
				callback(uri, Zotero.Sync.Storage.ERROR_NOT_ALLOWED);
				return;
			
			case 500:
				callback(uri, Zotero.Sync.Storage.ERROR_SERVER_ERROR);
				return;
			
			default:
				callback(uri, Zotero.Sync.Storage.ERROR_UNKNOWN);
				return;
		}
	});
}



//
// Private methods
//

/**
 * Get the storage URI for an item
 *
 * @inner
 * @param	{Zotero.Item}
 * @return	{nsIURI}					URI of file on storage server
 */
Zotero.Sync.Storage.Session.WebDAV.prototype._getItemURI = function (item) {
	var uri = this.rootURI;
	uri.spec = uri.spec + item.key + '.zip';
	return uri;
}


/**
 * Get the storage property file URI for an item
 *
 * @inner
 * @param	{Zotero.Item}
 * @return	{nsIURI}					URI of property file on storage server
 */
Zotero.Sync.Storage.Session.WebDAV.prototype._getItemPropertyURI = function (item) {
	var uri = this.rootURI;
	uri.spec = uri.spec + item.key + '.prop';
	return uri;
}
	
	
/**
 * Get the storage property file URI corresponding to a given item storage URI
 *
 * @param	{nsIURI}			Item storage URI
 * @return	{nsIURI|FALSE}	Property file URI, or FALSE if not an item storage URI
 */
Zotero.Sync.Storage.Session.WebDAV.prototype._getPropertyURIFromItemURI = function (uri) {
	if (!uri.spec.match(/\.zip$/)) {
		return false;
	}
	var propURI = uri.clone();
	propURI.QueryInterface(Components.interfaces.nsIURL);
	propURI.fileName = uri.fileName.replace(/\.zip$/, '.prop');
	propURI.QueryInterface(Components.interfaces.nsIURI);
	return propURI;
}


/**
 * @inner
 * @param	{String[]}	files		Remote filenames to delete (e.g., ZIPs)
 * @param	{Function}	callback		Passed object containing three arrays:
 *										'deleted', 'missing', and 'error',
 *										each containing filenames
 */
Zotero.Sync.Storage.Session.WebDAV.prototype._deleteStorageFiles = function (files, callback, session) {
	var results = {
		deleted: [],
		missing: [],
		error: []
	};
	
	if (files.length == 0) {
		if (callback) {
			callback(results);
		}
		return;
	}
	
	var self = session ? session : this;
	
	for (var i=0; i<files.length; i++) {
		let last = (i == files.length - 1);
		let fileName = files[i];
		
		let deleteURI = self.rootURI;
		// This should never happen, but let's be safe
		if (!deleteURI.spec.match(/\/$/)) {
			if (callback) {
				callback(deleted);
			}
			this.onError("Root URI does not end in slash in "
				+ "Zotero.Sync.Storage._deleteStorageFiles()");
		}
		deleteURI.QueryInterface(Components.interfaces.nsIURL);
		deleteURI.fileName = files[i];
		deleteURI.QueryInterface(Components.interfaces.nsIURI);
		Zotero.HTTP.WebDAV.doDelete(deleteURI, function (req) {
			switch (req.status) {
				case 204:
				// IIS 5.1 and Sakai return 200
				case 200:
					var fileDeleted = true;
					break;
				
				case 404:
					var fileDeleted = false;
					break;
				
				default:
					if (last && callback) {
						callback(results);
					}
					
					results.error.push(fileName);
					var msg = "An error occurred attempting to delete "
						+ "'" + fileName
						+ "' (" + req.status + " " + req.statusText + ").";
					self.onError(msg);
					return;
			}
			
			// If an item file URI, get the property URI
			var deletePropURI = self._getPropertyURIFromItemURI(deleteURI);
			if (!deletePropURI) {
				if (fileDeleted) {
					results.deleted.push(fileName);
				}
				else {
					results.missing.push(fileName);
				}
				if (last && callback) {
					callback(results);
				}
				return;
			}
			
			// If property file appears separately in delete queue,
			// remove it, since we're taking care of it here
			var propIndex = files.indexOf(deletePropURI.fileName);
			if (propIndex > i) {
				delete files[propIndex];
				i--;
				last = (i == files.length - 1);
			}
			
			// Delete property file
			Zotero.HTTP.WebDAV.doDelete(deletePropURI, function (req) {
				switch (req.status) {
					case 204:
					// IIS 5.1 and Sakai return 200
					case 200:
						results.deleted.push(fileName);
						break;
					
					case 404:
						if (fileDeleted) {
							results.deleted.push(fileName);
						}
						else {
							results.missing.push(fileName);
						}
						break;
					
					default:
						var error = true;
				}
				
				if (last && callback) {
					callback(results);
				}
				
				if (error) {
					results.error.push(fileName);
					var msg = "An error occurred attempting to delete "
						+ "'" + fileName
						+ "' (" + req.status + " " + req.statusText + ").";
					self.onError(msg);
				}
			});
		});
	}
}


/**
 * Checks for an invalid SSL certificate and displays a nice error
 */
Zotero.Sync.Storage.Session.WebDAV.prototype._checkResponse = function (req, obj) {
	var channel = req.channel;
	if (!channel instanceof Ci.nsIChannel) {
		obj.onError('No HTTPS channel available');
	}
	var secInfo = channel.securityInfo;
	if (secInfo instanceof Ci.nsITransportSecurityInfo) {
		secInfo.QueryInterface(Ci.nsITransportSecurityInfo);
		if ((secInfo.securityState & Ci.nsIWebProgressListener.STATE_IS_INSECURE) == Ci.nsIWebProgressListener.STATE_IS_INSECURE) {
			var host = 'host';
			try {
				host = channel.URI.host;
			}
			catch (e) {
				Zotero.debug(e);
			}
			
			var msg = Zotero.localeJoin([
				Zotero.getString('sync.storage.error.webdav.sslCertificateError', host),
				Zotero.getString('sync.storage.error.webdav.loadURLForMoreInfo')
			]);
			
			obj.onError(msg);
			return;
		}
		else if ((secInfo.securityState & Ci.nsIWebProgressListener.STATE_IS_BROKEN) == Ci.nsIWebProgressListener.STATE_IS_BROKEN) {
			var msg = Zotero.localeJoin([
				Zotero.getString('sync.storage.error.webdav.sslConnectionError', host),
				Zotero.getString('sync.storage.error.webdav.loadURLForMoreInfo')
			]);
			obj.onError(msg);
			return;
		}
	}
}
