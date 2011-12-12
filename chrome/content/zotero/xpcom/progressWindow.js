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


Zotero.ProgressWindowSet = new function() {
	this.add = add;
	this.tile = tile;
	this.remove = remove;
	this.updateTimers = updateTimers;
	
	var _progressWindows = [];
	
	const X_OFFSET = 25;
	const Y_OFFSET = 35;
	const Y_SEPARATOR = 12;
	const X_WINDOWLESS_OFFSET = 50;
	const Y_WINDOWLESS_OFFSET = 100;
	
	function add(progressWindow, instance) {
		_progressWindows.push({
			progressWindow: progressWindow,
			instance: instance
		});
	}
	
	
	function tile(progressWin) {
		var parent = progressWin.opener;
		var y_sub = null;
		
		for (var i=0; i<_progressWindows.length; i++) {
			var p = _progressWindows[i].progressWindow;
			
			// Skip progress windows from other windows
			if (p.opener != parent) {
				continue;
			}
			
			if (!y_sub) {
				y_sub = Y_OFFSET + p.outerHeight;
			}
			
			if (parent) {
				var right = parent.screenX + parent.outerWidth;
				var bottom = parent.screenY + parent.outerHeight;
			}
			else {
				var right = progressWin.screen.width + X_OFFSET - X_WINDOWLESS_OFFSET;
				var bottom = progressWin.screen.height + Y_OFFSET - Y_WINDOWLESS_OFFSET;
			}
			
			p.moveTo(right - p.outerWidth - X_OFFSET, bottom - y_sub);
			
			y_sub += p.outerHeight + Y_SEPARATOR;
		}
	}
	
	
	function remove(progressWin) {
		for (var i=0; i<_progressWindows.length; i++) {
			if (_progressWindows[i].progressWindow == progressWin) {
				_progressWindows.splice(i, 1);
			}
		}
	}
	
	
	function updateTimers() {
		if (!_progressWindows.length) {
			return;
		}
		
		for (var i=0; i<_progressWindows.length; i++) {
			// Pass |requireMouseOver| so that the window only closes
			// if the mouse was over it at some point
			_progressWindows[i].instance.startCloseTimer(null, true);
		}
	}
}


/*
 * Handles the display of a div showing progress in scraping, indexing, etc.
 *
 * Pass the active window into the constructor
 */
Zotero.ProgressWindow = function(_window){
	this.show = show;
	this.changeHeadline = changeHeadline;
	this.addLines = addLines;
	this.addDescription = addDescription;
	this.startCloseTimer = startCloseTimer;
	this.close = close;
	
	var _window = null;
	
	var _progressWindow = null;
	var _windowLoaded = false;
	var _windowLoading = false;
	var _timeoutID = false;
	var _mouseWasOver = false
	
	// keep track of all of these things in case they're called before we're
	// done loading the progress window
	var _loadHeadline = '';
	var _loadLines = [];
	var _loadIcons = [];
	var _loadDescription = null;
	
	
	function show() {
		if(_windowLoading || _windowLoaded) {	// already loading or loaded
			return false;
		}
		
		var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].
					getService(Components.interfaces.nsIWindowWatcher);
		
		if (!_window){
			_window = ww.activeWindow;
		}
		
		if (_window) {
			_progressWindow = _window.openDialog("chrome://zotero/content/progressWindow.xul",
				"", "chrome,dialog=no,titlebar=no,popup=yes");
		}
		else {
			_progressWindow = ww.openWindow(null, "chrome://zotero/content/progressWindow.xul",
				"", "chrome,dialog=no,titlebar=no,popup=yes", null);
		}
		_progressWindow.addEventListener("load", _onWindowLoaded, false);
		_progressWindow.addEventListener("mouseover", _onMouseOver, false);
		_progressWindow.addEventListener("mouseout", _onMouseOut, false);
		_progressWindow.addEventListener("mouseup", _onMouseUp, false);
		
		_windowLoading = true;
		
		Zotero.ProgressWindowSet.add(_progressWindow, this);
		
		return true;
	}
	
	function changeHeadline(headline) {
		if(_windowLoaded) {
			_progressWindow.document.getElementById("zotero-progress-text-headline").value = headline;
		} else {
			_loadHeadline = headline;
		}
	}
	
	function addLines(label, icon) {
		if(_windowLoaded) {
			for (var i in label) {
				var newLabel = _progressWindow.document.createElement("label");
				newLabel.setAttribute("class", "zotero-progress-item-label");
				newLabel.setAttribute("crop", "end");
				newLabel.setAttribute("value", label[i]);
				
				var newImage = _progressWindow.document.createElement("image");
				newImage.setAttribute("class", "zotero-progress-item-icon");
				newImage.setAttribute("src", icon[i]);
				
				var newHB = _progressWindow.document.createElement("hbox");
				newHB.setAttribute("class", "zotero-progress-item-hbox");
				newHB.setAttribute("valign", "center");
				newHB.appendChild(newImage);
				newHB.appendChild(newLabel);
				
				_progressWindow.document.getElementById("zotero-progress-text-box").appendChild(newHB);
			}
			
			_move();
		} else {
			_loadLines = _loadLines.concat(label);
			_loadIcons = _loadIcons.concat(icon);
		}
	}
	
	
	/*
	 * Add a description to the progress window
	 *
	 * <a> elements are turned into XUL links
	 */
	function addDescription(text) {
		if(_windowLoaded) {
			var newHB = _progressWindow.document.createElement("hbox");
			newHB.setAttribute("class", "zotero-progress-item-hbox");
			var newDescription = _progressWindow.document.createElement("description");
			
			var parts = Zotero.Utilities.parseMarkup(text);
			for each(var part in parts) {
				if (part.type == 'text') {
					var elem = _progressWindow.document.createTextNode(part.text);
				}
				else if (part.type == 'link') {
					var elem = _progressWindow.document.createElement('label');
					elem.setAttribute('value', part.text);
					elem.setAttribute('class', 'text-link');
					for (var i in part.attributes) {
						elem.setAttribute(i, part.attributes[i]);
					}
				}
				
				newDescription.appendChild(elem);
			}
			
			newHB.appendChild(newDescription);
			_progressWindow.document.getElementById("zotero-progress-text-box").appendChild(newHB);
			
			_move();
		} else {
			_loadDescription = text;
		}
	}
	
	
	function startCloseTimer(ms, requireMouseOver) {
		if (_windowLoaded || _windowLoading) {
			if (requireMouseOver && !_mouseWasOver) {
				return;
			}
			
			if (_timeoutID) {
				_disableTimeout();
			}
			
			if (typeof ms != 'number') {
				ms = 2500;
			}
			
			_timeoutID = _progressWindow.setTimeout(_timeout, ms);
		}
	}
	
	function close() {
		_disableTimeout();
		_windowLoaded = false;
		_windowLoading = false;
		Zotero.ProgressWindowSet.remove(_progressWindow);
		
		try {
			_progressWindow.close();
		} catch(ex) {}
	}
	
	function _onWindowLoaded() {
		_windowLoading = false;
		_windowLoaded = true;
		
		_move();
		// do things we delayed because the window was loading
		changeHeadline(_loadHeadline);
		addLines(_loadLines, _loadIcons);
		if (_loadDescription) {
			addDescription(_loadDescription);
		}
		
		// reset parameters
		_loadHeadline = '';
		_loadLines = [];
		_loadIcons = [];
		_loadDescription = null;
	}
	
	function _move() {
		// sizeToContent() fails in FF3 with multiple lines
		// if we don't change the height
		_progressWindow.outerHeight = _progressWindow.outerHeight + 1;
		_progressWindow.sizeToContent();
		Zotero.ProgressWindowSet.tile(_progressWindow);
	}
	
	function _timeout() {
		close();	// could check to see if we're really supposed to close yet
				// (in case multiple scrapers are operating at once)
		_timeoutID = false;
	}
	
	function _disableTimeout() {
		// FIXME: to prevent errors from translator saving (Create New Item appears to still work)
		// This shouldn't be necessary, and mouseover isn't properly
		// causing the popup to remain
		try {
			_progressWindow.clearTimeout(_timeoutID);
		}
		catch (e) {}
		_timeoutID = false;
	}
	
	
	/*
	 * Disable the close timer when the mouse is over the window
	 */
	function _onMouseOver(e) {
		_mouseWasOver = true;
		_disableTimeout();
	}
	
	
	/*
	 * Start the close timer when the mouse leaves the window
	 *
	 * Note that this onmouseout doesn't work correctly on popups in Fx2,
	 * so 1) we have to calculate the window borders manually to avoid fading
	 * when the mouse is still over the box, and 2) this only does anything
	 * when the mouse is moved off of the browser window -- otherwise the close
	 * is triggered by onmousemove on appcontent in overlay.xul.
	 */
	function _onMouseOut(e) {
		// |this| refers to progressWindow's XUL window
		var top = this.screenY + (Zotero.isMac ? 22 : 0);
		if ((e.screenX >= this.screenX && e.screenX <= (this.screenX + this.outerWidth))
			&& (e.screenY >= top) && e.screenY <= (top + this.outerHeight)) {
				return;
		}
		startCloseTimer();
	}
	
	
	function _onMouseUp(e) {
		close();
	}
}
