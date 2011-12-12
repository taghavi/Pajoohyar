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

Zotero.MIMETypeHandler = new function () {
	var _typeHandlers, _ignoreContentDispositionTypes, _observers;
	
	/**
	 * Registers URIContentListener to handle MIME types
	 */
	this.init = function() {
		Zotero.debug("Registering URIContentListener");
		// register our nsIURIContentListener and nsIObserver
		Components.classes["@mozilla.org/uriloader;1"].
			getService(Components.interfaces.nsIURILoader).
			registerContentListener(_URIContentListener);
		Components.classes["@mozilla.org/observer-service;1"].
			getService(Components.interfaces.nsIObserverService).
			addObserver(_Observer, "http-on-examine-response", false);
		this.initializeHandlers();
	}
	
	/**
	 * Initializes handlers for MIME types
	 */
	this.initializeHandlers = function() {
		_typeHandlers = {};
		_ignoreContentDispositionTypes = [];
		_observers = [];
		
		if(Zotero.Prefs.get("parseEndNoteMIMETypes")) {
			this.addHandler("application/x-endnote-refer", _importHandler, true);
			this.addHandler("application/x-research-info-systems", _importHandler, true);
			// Add ISI
			this.addHandler("application/x-inst-for-Scientific-info", _importHandler, true);
			//
			// And some non-standard ones
			//
			this.addHandler("text/x-research-info-systems", _importHandler, true);
			// Nature uses this one
			this.addHandler("text/application/x-research-info-systems", _importHandler, true);
			// Cell uses this one
			this.addHandler("text/ris", _importHandler, true);
			// Not even trying
			this.addHandler("ris", _importHandler, true);
		}
		this.addHandler("text/x-csl", function(a1, a2) { Zotero.Styles.install(a1, a2) });
		this.addHandler("application/x-zotero-schema", Zotero.Schema.importSchema);
		this.addHandler("application/x-zotero-settings", Zotero.Prefs.importSettings);
	}
	
	/**
	 * Adds a handler to handle a specific MIME type
	 * @param {String} type MIME type to handle
	 * @param {Function} fn Function to call to handle type - fn(string, uri)
	 * @param {Boolean} ignoreContentDisposition If true, ignores the Content-Disposition header,
	 *	which is often used to force a file to download rather than let it be handled by the web
	 *	browser
	 */
	this.addHandler = function(type, fn, ignoreContentDisposition) {
		_typeHandlers[type] = fn;
		_ignoreContentDispositionTypes.push(type);
	}
	
	/**
	 * Adds an observer to inspect and possibly modify page headers
	 */
	this.addObserver = function(fn) {
		_observers.push(fn);
	}
	
	
	/**
	 * Handles Refer/RIS/ISI MIME types
	 * @param {String} string The Refer/RIS/ISI formatted records
	 * @param {String} uri The URI from which the Refer/RIS/ISI formatted records were downloaded
	 */
	function _importHandler(string, uri, contentType, channel) {
		var win = channel.notificationCallbacks.getInterface(Components.interfaces.nsIDOMWindow).top;
		if(!win) throw "Attempt to import from a channel without an attached document refused";
		
		var hostPort = channel.URI.hostPort.replace(";", "_", "g");
		
		var allowedSitesString = Zotero.Prefs.get("ingester.allowedSites");
		allowedSites = allowedSitesString.split(";");
		
		if(allowedSites.indexOf(hostPort) === -1) {
			var title = Zotero.getString("ingester.importReferRISDialog.title");
			var text = Zotero.getString("ingester.importReferRISDialog.text", channel.URI.hostPort)+"\n\n";
			var checkMsg = Zotero.getString("ingester.importReferRISDialog.checkMsg");
			var checkValue = {"value":false};
			
			// make tab-modal dialog (https://developer.mozilla.org/en/Using_tab-modal_prompts)
			if(Zotero.isFx4) {
				var prompt = Components.classes["@mozilla.org/prompter;1"]
					 .getService(Components.interfaces.nsIPromptFactory)
					 .getPrompt(win, Components.interfaces.nsIPrompt);
				
				var bag = prompt.QueryInterface(Components.interfaces.nsIWritablePropertyBag2);
				bag.setPropertyAsBool("allowTabModal", true);
			
				var continueDownload = prompt.confirmCheck(title, text, checkMsg, checkValue);
			} else {
				var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
						.getService(Components.interfaces.nsIPromptService);
			
				var continueDownload = ps.confirmCheck(win, title, text, checkMsg, checkValue);
			}
			
			if(!continueDownload) return;
			if(checkValue.value) {
				// add to allowed sites if desired
				Zotero.Prefs.set("ingester.allowedSites", allowedSitesString+";"+hostPort);
			}
		}
		
		var frontWindow = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].
			getService(Components.interfaces.nsIWindowWatcher).activeWindow;
		
		if (Zotero.locked) {
			frontWindow.Zotero_Browser.progress.changeHeadline(Zotero.getString("ingester.scrapeError"));
			var desc = Zotero.localeJoin([
				Zotero.getString('general.operationInProgress'), Zotero.getString('general.operationInProgress.waitUntilFinishedAndTryAgain')
			]);
			frontWindow.Zotero_Browser.progress.addDescription(desc);
			frontWindow.Zotero_Browser.progress.show();
			frontWindow.Zotero_Browser.progress.startCloseTimer(8000);
			return;
		}
		
		// attempt to import through Zotero.Translate
		var translation = new Zotero.Translate("import");
		translation.setLocation(uri);
		translation.setString(string);
		
		frontWindow.Zotero_Browser.progress.show();
		var libraryID = null;
		var collection = null;
		try {
			libraryID = frontWindow.ZoteroPane.getSelectedLibraryID();
			collection = frontWindow.ZoteroPane.getSelectedCollection();
		} catch(e) {}
		translation.setHandler("itemDone", function(obj, item) { frontWindow.Zotero_Browser.itemDone(obj, item, collection) });
		translation.setHandler("done", function(obj, item) { frontWindow.Zotero_Browser.finishScraping(obj, item, collection) });
		
		// attempt to retrieve translators
		var translators = translation.getTranslators();
		if(!translators.length) {
			// we lied. we can't really translate this file.
			frontWindow.Zotero_Browser.progress.close();
			throw "No translator found for handled RIS, Refer or ISI file"
		}
		
		// translate using first available
		translation.setTranslator(translators[0]);
		translation.translate(libraryID);
	}
	
	/**
	 * Called to observe a page load
	 */
	var _Observer = new function() {
		this.observe = function(channel) {
			channel.QueryInterface(Components.interfaces.nsIRequest);
			if(channel.loadFlags & Components.interfaces.nsIHttpChannel.LOAD_DOCUMENT_URI) {
				channel.QueryInterface(Components.interfaces.nsIHttpChannel);
				try {
					// remove content-disposition headers for EndNote, etc.
					var contentType = channel.getResponseHeader("Content-Type").toLowerCase();
					for each(var handledType in _ignoreContentDispositionTypes) {
						if(contentType.length < handledType.length) {
							break;
						} else {
							if(contentType.substr(0, handledType.length) == handledType) {
								channel.setResponseHeader("Content-Disposition", "", false);
								break;
							}
						}
					}
				} catch(e) {}
				
				for each(var observer in _observers) {
					observer(channel);
				}
			}
		}
	}
	
	var _URIContentListener = new function() {
		/**
		 * Standard QI definiton
		 */
		this.QueryInterface = function(iid) {
			if  (iid.equals(Components.interfaces.nsISupports)
			   || iid.equals(Components.interfaces.nsISupportsWeakReference)
			   || iid.equals(Components.interfaces.nsIURIContentListener)) {
				return this;
			}
			throw Components.results.NS_ERROR_NO_INTERFACE;
		}
		
		/**
		 * Called to see if we can handle a content type
		 */
		this.canHandleContent = this.isPreferred = function(contentType, isContentPreferred, desiredContentType) {
			return !!_typeHandlers[contentType.toLowerCase()];
		}
		
		/**
		 * Called to begin handling a content type
		 */
		this.doContent = function(contentType, isContentPreferred, request, contentHandler) {
			Zotero.debug("MIMETypeHandler: handling "+contentType+" from " + request.name);
			contentHandler.value = new _StreamListener(request, contentType.toLowerCase());
			return false;
		}
		
		/**
		 * Called so that we could stop a load before it happened if we wanted to
		 */
		this.onStartURIOpen = function(URI) {
			return true;
		}
	}
		
	/**
	 * @class Implements nsIStreamListener and nsIRequestObserver interfaces to download MIME types
	 * 	we've registered ourself as the handler for
	 * @param {nsIRequest} request The request to handle
	 * @param {String} contenType The content type being handled
	 */
	var _StreamListener = function(request, contentType) {
		this._request = request;
		this._contentType = contentType
		this._storageStream = null;
		this._outputStream = null;
		this._binaryInputStream = null;
	}
	
	/**
	 * Standard QI definiton
	 */
	_StreamListener.prototype.QueryInterface = function(iid) {
		if (iid.equals(Components.interfaces.nsISupports)
		   || iid.equals(Components.interfaces.nsIRequestObserver)
		   || iid.equals(Components.interfaces.nsIStreamListener)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
	
	/**
	 * Called when the request is started; we ignore this
	 */
	_StreamListener.prototype.onStartRequest = function(channel, context) {}
	

	/**
	 * Called when there's data available; we collect this data and keep it until the request is
	 * done
	 */
	_StreamListener.prototype.onDataAvailable = function(request, context, inputStream, offset, count) {
		Zotero.debug(count + " bytes available");
		
		if (!this._storageStream) {
			this._storageStream = Components.classes["@mozilla.org/storagestream;1"].
					createInstance(Components.interfaces.nsIStorageStream);
			this._storageStream.init(4096, 4294967295, null); // PR_UINT32_MAX
			this._outputStream = this._storageStream.getOutputStream(0);
			
			this._binaryInputStream = Components.classes["@mozilla.org/binaryinputstream;1"].
					createInstance(Components.interfaces.nsIBinaryInputStream);
			this._binaryInputStream.setInputStream(inputStream);
		}
		
		var bytes = this._binaryInputStream.readBytes(count);
		this._outputStream.write(bytes, count);
	}
	
	/**
	 * Called when the request is done
	 */
	_StreamListener.prototype.onStopRequest = function(channel, context, status) {
		Zotero.debug("charset is " + channel.contentCharset);
		
		var inputStream = this._storageStream.newInputStream(0);
		var charset = channel.contentCharset ? channel.contentCharset : "UTF-8";
		const replacementChar = Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER;
		var convStream = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
					.createInstance(Components.interfaces.nsIConverterInputStream);
		convStream.init(inputStream, charset, 1024, replacementChar);
		var readString = "";
		var str = {};
		while (convStream.readString(4096, str) != 0) {
			readString += str.value;
		}
		convStream.close();
		inputStream.close();
		
		try {
			_typeHandlers[this._contentType](readString, (this._request.name ? this._request.name : null),
				this._contentType, channel);
		} catch(e) {
			// if there was an error, handle using nsIExternalHelperAppService
			var externalHelperAppService = Components.classes["@mozilla.org/uriloader/external-helper-app-service;1"].
				getService(Components.interfaces.nsIExternalHelperAppService);
			var frontWindow = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].
				getService(Components.interfaces.nsIWindowWatcher).activeWindow;
			
			var inputStream = this._storageStream.newInputStream(0);
			var streamListener = externalHelperAppService.doContent(this._contentType, this._request, frontWindow, null);
			if (streamListener) {
				streamListener.onStartRequest(channel, context);
				streamListener.onDataAvailable(this._request, context, inputStream, 0, this._storageStream.length);
				streamListener.onStopRequest(channel, context, status);
			}
			this._storageStream.close();
			
			// then throw our error
			throw e;
		}
		
		this._storageStream.close();
	}
}
