Zotero.Cite = function(){}
Zotero.Cite.System = function(){};

/**
 * Mappings for names
 * Note that this is the reverse of the text variable map, since all mappings should be one to one
 * and it makes the code cleaner
 */
Zotero.Cite.System._zoteroNameMap = {
	"author":"author",
	"bookAuthor":"container-author",
	"composer":"composer",
	"editor":"editor",
	"interviewer":"interviewer",
	"recipient":"recipient",
	"seriesEditor":"collection-editor",
	"translator":"translator"
}

/**
 * Mappings for text variables
 */
Zotero.Cite.System._zoteroFieldMap = {
	"title":["title"],
	"container-title":["publicationTitle",  "reporter", "code"], /* reporter and code should move to SQL mapping tables */
	"collection-title":["seriesTitle", "series"],
	"collection-number":["seriesNumber"],
	"publisher":["publisher", "distributor"], /* distributor should move to SQL mapping tables */
	"publisher-place":["place"],
	"authority":["court"],
	"page":["pages"],
	"volume":["volume"],
	"issue":["issue"],
	"number-of-volumes":["numberOfVolumes"],
	"number-of-pages":["numPages"],
	"edition":["edition"],
	"version":["version"],
	"section":["section"],
	"genre":["type", "artworkSize"], /* artworkSize should move to SQL mapping tables, or added as a CSL variable */
	"medium":["medium"],
	"archive":["archive"],
	"archive_location":["archiveLocation"],
	"event":["meetingName", "conferenceName"], /* these should be mapped to the same base field in SQL mapping tables */
	"event-place":["place"],
	"abstract":["abstractNote"],
	"URL":["url"],
	"DOI":["DOI"],
	"ISBN":["ISBN"],
	"call-number":["callNumber"],
	"note":["extra"],
	"number":["number"],
	"references":["history"],
	"shortTitle":["shortTitle"],
	"journalAbbreviation":["journalAbbreviation"],
	"language":["language"]
}
	/*<abszh>*/
	//abszh added language to the above array
	/*</abszh>*/

Zotero.Cite.System._zoteroDateMap = {
	"issued":"date",
	"accessed":"accessDate"
}

Zotero.Cite.System._zoteroTypeMap = {
	'book':"book",
	'bookSection':'chapter',
	'journalArticle':"article-journal",
	'magazineArticle':"article-magazine",
	'newspaperArticle':"article-newspaper",
	'thesis':"thesis",
	'encyclopediaArticle':"entry-encyclopedia",
	'dictionaryEntry':"entry-dictionary",
	'conferencePaper':"paper-conference",
	'letter':"personal_communication",
	'manuscript':"manuscript",
	'interview':"interview",
	'film':"motion_picture",
	'artwork':"graphic",
	'webpage':"webpage",
	'report':"report",
	'bill':"bill",
	'case':"legal_case",
	'hearing':"bill",				// ??
	'patent':"patent",
	'statute':"bill",				// ??
	'email':"personal_communication",
	'map':"map",
	'blogPost':"webpage",
	'instantMessage':"personal_communication",
	'forumPost':"webpage",
	'audioRecording':"song",		// ??
	'presentation':"speech",
	'videoRecording':"motion_picture",
	'tvBroadcast':"broadcast",
	'radioBroadcast':"broadcast",
	'podcast':"song",			// ??
	'computerProgram':"book"		// ??
};

Zotero.Cite.System._quotedRegexp = /^".+"$/;

// TODO: Clear this cache from time to time
Zotero.Cite.System._cache = new Object();


//<abszh>
//retriveItem is here. retrieveLocale is the next function.
//</abszh>

Zotero.Cite.System.retrieveItem = function(item){
	if(item instanceof Zotero.Item) {
		//if(this._cache[item.id]) return this._cache[item.id];
		var zoteroItem = item;
	} else {
		// is an item ID
		//if(this._cache[item]) return this._cache[item];
		var zoteroItem = Zotero.Items.get(item);
	}

	if(!zoteroItem) {
		throw "Zotero.Cite.getCSLItem called to wrap a non-item";
	}
	
	// don't return URL or accessed information for journal articles if a
	// pages field exists
	var itemType = Zotero.ItemTypes.getName(zoteroItem.itemTypeID);
	var cslType = Zotero.Cite.System._zoteroTypeMap[itemType];
	if(!cslType) cslType = "article";
	var ignoreURL = ((zoteroItem.getField("accessDate", true, true) || zoteroItem.getField("url", true, true)) &&
			["journalArticle", "newspaperArticle", "magazineArticle"].indexOf(itemType) !== -1
			&& zoteroItem.getField("pages")
			&& !Zotero.Prefs.get("export.citePaperJournalArticleURL"));
	
	var cslItem = {
		'id':zoteroItem.id,
		'type':cslType
	};
	
	//<abszh>
	var ablanguage;
	var abtitle;
	//</abszh>
	// get all text variables (there must be a better way)
	// TODO: does citeproc-js permit short forms?
	for(var variable in Zotero.Cite.System._zoteroFieldMap) {
		var fields = Zotero.Cite.System._zoteroFieldMap[variable];
		if(variable == "URL" && ignoreURL) continue;
		for each(var field in fields) {
			var value = zoteroItem.getField(field, false, true).toString();
			//<abszh>
			if (variable=="language") {
				ablanguage=value;
			} else if (variable=="title") {
				abtitle=value;
			}
			//</abszh>
			
			if(value != "") {
				// Strip enclosing quotes
				if(value.match(Zotero.Cite.System._quotedRegexp)) {
					value = value.substr(1, value.length-2);
				}
				cslItem[variable] = value;
				break;
			}
		}
	}
	
	//<abszh>
	cslItem["language"]=Zotero.Utilities.determineLang(ablanguage,abtitle);
	//</abszh>
	
	// separate name variables
	var authorID = Zotero.CreatorTypes.getPrimaryIDForType(zoteroItem.itemTypeID);
	var creators = zoteroItem.getCreators();
	for each(var creator in creators) {
		if(creator.creatorTypeID == authorID) {
			var creatorType = "author";
		} else {
			var creatorType = Zotero.CreatorTypes.getName(creator.creatorTypeID);
		}
		
		var creatorType = Zotero.Cite.System._zoteroNameMap[creatorType];
		if(!creatorType) continue;
		
		var nameObj = {'family':creator.ref.lastName, 'given':creator.ref.firstName};
		
		if(cslItem[creatorType]) {
			cslItem[creatorType].push(nameObj);
		} else {
			cslItem[creatorType] = [nameObj];
		}
	}
	
	// get date variables
	for(var variable in Zotero.Cite.System._zoteroDateMap) {
		var date = zoteroItem.getField(Zotero.Cite.System._zoteroDateMap[variable], false, true);
		if(date) {
			var dateObj = Zotero.Date.strToDate(date);
			// otherwise, use date-parts
			var dateParts = [];
			if(dateObj.year) {
				// add year, month, and day, if they exist
				dateParts.push(dateObj.year);
				if(dateObj.month !== undefined) {
					dateParts.push(dateObj.month+1);
					if(dateObj.day) {
						dateParts.push(dateObj.day);
					}
				}
				cslItem[variable] = {"date-parts":[dateParts]};
				
				// if no month, use season as month
				if(dateObj.part && !dateObj.month) {
					cslItem[variable].season = dateObj.part;
				}
			} else {
				// if no year, pass date literally
				cslItem[variable] = {"literal":date};
			}
		}
	}
	
	//this._cache[zoteroItem.id] = cslItem;
	return cslItem;
};

Zotero.Cite.System.retrieveLocale = function(lang) {
	var protHandler = Components.classes["@mozilla.org/network/protocol;1?name=chrome"]
		.createInstance(Components.interfaces.nsIProtocolHandler);
	var channel = protHandler.newChannel(protHandler.newURI("chrome://zotero/content/locale/csl/locales-"+lang+".xml", "UTF-8", null));
	try {
		var rawStream = channel.open();
	} catch(e) {
		return false;
	}
	var converterStream = Components.classes["@mozilla.org/intl/converter-input-stream;1"]
						   .createInstance(Components.interfaces.nsIConverterInputStream);
	converterStream.init(rawStream, "UTF-8", 65535,
		Components.interfaces.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
	var str = {};
	converterStream.readString(channel.contentLength, str);
	converterStream.close();
	//Zotero.Utilities.writeToDiagFile("lang is: "+lang+"\r\n");
	//Zotero.Utilities.writeToDiagFile("result is: "+str.value+"\r\n");
	return str.value;
};

Zotero.Cite.System.getAbbreviations = function() {
	return {};
}

Zotero.Cite.removeFromBibliography = function(bib, itemsToRemove) {
	var removeItems = [];
	for(let i in bib[0].entry_ids) {
		for(let j in bib[0].entry_ids[i]) {
			if(itemsToRemove[bib[0].entry_ids[i][j]]) {
				removeItems.push(i);
				break;
			}
		}
	}
	for(let i=removeItems.length-1; i>=0; i--) {
		bib[0].entry_ids.splice(removeItems[i], 1);
		bib[1].splice(removeItems[i], 1);
	}
}

Zotero.Cite.getBibliographyFormatParameters = function(bib) {
	var bibStyle = {"tabStops":[], "indent":0, "firstLineIndent":0,
	                "lineSpacing":(240*bib[0].linespacing),
	                "entrySpacing":(240*bib[0].entryspacing)};
	if(bib[0].hangingindent) {
		bibStyle.indent = 720;				// 720 twips = 0.5 in
		bibStyle.firstLineIndent = -720;	// -720 twips = -0.5 in
	} else if(bib[0]["second-field-align"]) {
		// this is a really sticky issue. the below works for first fields that look like "[1]"
		// and "1." otherwise, i have no idea. luckily, this will be good enough 99% of the time.
		var alignAt = 24+bib[0].maxoffset*120;
		bibStyle.firstLineIndent = -alignAt;
		if(bib[0]["second-field-align"] == "margin") {
			bibStyle.tabStops = [0];
		} else {
			bibStyle.indent = alignAt;
			bibStyle.tabStops = [alignAt];
		}
	}
	
	return bibStyle;
}

/**
 * Makes a formatted bibliography, if the style defines one; otherwise makes a formatted list of
 * items
 * @param {Zotero.Style} style The style to use
 * @param {Zotero.Item[]} items An array of items
 * @param {String} format The format of the output
 */
Zotero.Cite.makeFormattedBibliographyOrCitationList = function(style, items, format) {
	var cslEngine = style.csl;
	cslEngine.setOutputFormat(format);
	cslEngine.updateItems([item.id for each(item in items)]);
	
	var bibliography = Zotero.Cite.makeFormattedBibliography(cslEngine, format);
	if(bibliography) return bibliography;
	
	var styleClass = style.class;
	var citations = [cslEngine.appendCitationCluster({"citationItems":[{"id":item.id}], "properties":{}}, true)[0][1]
		for each(item in items)];
	
	if(styleClass == "note") {
		if(format == "html") {
			return "<ol>\n\t<li>"+citations.join("</li>\n\t<li>")+"</li>\n</ol>";
		} else if(format == "text") {
			var output = [];
			for(var i=0; i<citations.length; i++) {
				output.push((i+1)+". "+citations[i]+"\r\n");
			}
			return output.join("");
		} else if(format == "rtf") {
			var output = ["{\\rtf \n{\\*\\listtable{\\list\\listtemplateid1\\listhybrid{\\listlevel"+
				"\\levelnfc0\\levelnfcn0\\leveljc0\\leveljcn0\\levelfollow0\\levelstartat1"+
				"\\levelspace360\\levelindent0{\\*\\levelmarker \\{decimal\\}.}{\\leveltext"+
				"\\leveltemplateid1\\'02\\'00.;}{\\levelnumbers\\'01;}\\fi-360\\li720\\lin720 }"+
				"{\\listname ;}\\listid1}}\n{\\*\\listoverridetable{\\listoverride\\listid1"+
				"\\listoverridecount0\\ls1}}\n\\tx720\\li720\\fi-480\\ls1\\ilvl0\n"];
			for(var i=0; i<citations.length; i++) {
				output.push("{\\listtext "+(i+1)+".	}"+citations[i]+"\\\n");
			}
			output.push("}");
			return output.join("");
		} else {
			throw "Unimplemented bibliography format "+format;
		}
	} else {
		if(format == "html") {
			return citations.join("<br />");
		} else if(format == "text") {
			return citations.join("\r\n");
		} else if(format == "rtf") {
			return "<\\rtf \n"+citations.join("\\\n")+"\n}";
		}
	}
}

/**
 * Makes a formatted bibliography
 * @param {Zotero.Style} style The style
 * @param {Zotero.Item[]} items An array of items
 */
Zotero.Cite.makeFormattedBibliography = function(cslEngine, format) {
	cslEngine.setOutputFormat(format);
	var bib = cslEngine.makeBibliography();
	if(!bib) return false;
	
	//<abszh>
	var sepEnable=true;
	var psepEnable=Zotero.Prefs.get('crcis.separateByLanguage');
	if (typeof(psepEnable)=="boolean") {
		sepEnable=psepEnable;
	} else {
		sepEnable=(psepEnable=="true");
	}
	//Zotero.Utilities.writeToDiagFile("seperation by lang is: "+sepEnable.toSource()+"\r\n");
	if (sepEnable) {
		var bibliographyTextArray=["","",""];
		var septemp=Zotero.Prefs.get('crcis.dontSeparatePersianAndArabic');
		var sep=true;
		if (typeof(septemp)=="boolean") {
			sep=septemp;
		} else {
			sep=(septemp=="true");
		}
		var firstBibLanguage=Zotero.Prefs.get('crcis.firstBibLanguage');
		var secondBibLanguage=Zotero.Prefs.get('crcis.secondBibLanguage');
		
		var firstBibLanguages=new Array();
		var secondBibLanguages=new Array();
		if (((firstBibLanguage=="fa") || (firstBibLanguage=="ar"))&& sep) {
			firstBibLanguages.push("fa","ar");
		} else {
			firstBibLanguages.push(firstBibLanguage);
		}
		if (((secondBibLanguage=="fa") || (secondBibLanguage=="ar"))&& sep) {
			secondBibLanguages.push("fa","ar");
		} else {
			secondBibLanguages.push(secondBibLanguage);
		}
	}
	//</abszh>		
	/*
	var newBib=new Array();
	for (var jj in bib[1]) {
		var newObj;
		newObj[0]=bib[0].entry_ids[jj];
		newObj[1]=bib[1][jj];
		newBib.push(newObj);
	}
	function compare(a,b) {
		var abItem1=Zotero.Cite.System.retrieveItem(newBib[a][0]);
		var abItem2=Zotero.Cite.System.retrieveItem(newBib[b][0]);
		var av;
		var bv;
		if (abItem1.language in firstBibLanguages) av=2;
		else if (abItem1.language in secondBibLanguages) av=1;
		else av=0;
		if (abItem2.language in secondBibLanguages) bv=2;
		else if (abItem2.language in secondBibLanguages) bv=1;
		else bv=0;
		return av-bv;
	}
	newBib.sort(compare);
		
	//Zotero.Utilities.writeToDiagFile(newBib.toSource());
	*/
	
	if(format == "html") {
		var output = [bib[0].bibstart];
		for(var i in bib[1]) {
			//<abszh>
			var rtl=false;
			var abItem=Zotero.Cite.System.retrieveItem(bib[0].entry_ids[i]+"");
			if (Zotero.Utilities.checkLang(abItem.language,abItem.title)) {
				rtl=true;
			}

			if (rtl) {
				bib[1][i]=bib[1][i].replace('class="csl-entry"','class="csl-entry" dir="rtl"');
				bib[1][i]=bib[1][i].replace('class="csl-left-margin"','class="csl-left-margin" dir="rtl"');
				bib[1][i]=bib[1][i].replace('class="csl-right-inline"','class="csl-right-inline" dir="rtl"');
				bib[1][i]=bib[1][i].replace('class="csl-indent"','class="csl-indent" dir="rtl"');
				var insideATag=false;
				var bb=bib[1][i];
				var bb2="";
			
				function replacer(str) {
					var cc=str.charCodeAt(0);
					return String.fromCharCode(cc-48+0x6F0);
				}
				for (var j=0; j<bb.length; j++) {
					if (bb[j]=='<') {
						insideATag=true;
					} else if (bb[j]=='>') {
						insideATag=false;
					}
					var lastChar=bb[j]+"";
					if (!insideATag) {
						lastChar=lastChar.replace(",",String.fromCharCode(0x060C));
						lastChar=lastChar.replace(";",String.fromCharCode(0x061B));
						lastChar=lastChar.replace(/\d/g,replacer);
					}
					bb2=bb2+lastChar;
				}
				bib[1][i]=bb2;
			} else {
				bib[1][i]=bib[1][i].replace('class="csl-entry"','class="csl-entry" dir="ltr"');
				bib[1][i]=bib[1][i].replace('class="csl-left-margin"','class="csl-left-margin" dir="ltr"');
				bib[1][i]=bib[1][i].replace('class="csl-right-inline"','class="csl-right-inline" dir="ltr"');
				bib[1][i]=bib[1][i].replace('class="csl-indent"','class="csl-indent" dir="ltr"');
			}			
			
			//</abszh>
			output.push(bib[1][i]);
			
			//<abszh>
			var coinsSpan="";
			//</abszh>
			
			// add COinS
			for each(var itemID in bib[0].entry_ids[i]) {
				try {
					var co = Zotero.OpenURL.createContextObject(Zotero.Items.get(itemID), "1.0");
					if(!co) continue;
					//<abszh>
					/*output.push('  <span class="Z3988" title="'+
						co.replace("&", "&amp;", "g").replace("<", "&lt;", "g").replace(">", "&gt;", "g")+
						'"/>\n');*/
					coinsSpan='  <span class="Z3988" title="'+
						co.replace("&", "&amp;", "g").replace("<", "&lt;", "g").replace(">", "&gt;", "g")+
						'"/>\n';
					output.push(coinsSpan);
					//</abszh>
				} catch(e) {
					Zotero.logError(e);
				}
			}
			//<abszh>
			if (sepEnable) {
				if (abItem.language) {
					var found=false;
					for (var j in firstBibLanguages) {
						if (abItem.language == firstBibLanguages[j]) {
							bibliographyTextArray[0]=bibliographyTextArray[0]+bib[1][i]+coinsSpan;
							found=true;
							break;
						}
					}
					if (!found) {
						for (var j in secondBibLanguages) {
							if (abItem.language == secondBibLanguages[j]) {
								bibliographyTextArray[1]=bibliographyTextArray[1]+bib[1][i]+coinsSpan;
								found=true;
								break;
							}
						}
					}
					if (!found) {
						bibliographyTextArray[2]=bibliographyTextArray[2]+bib[1][i]+coinsSpan;
					}
				} else { //language not specified
					bibliographyTextArray[2]=bibliographyTextArray[2]+bib[1][i]+coinsSpan;
				}
			}
			//</abszh>
		}
		output.push(bib[0].bibend);
		var html = output.join("");
		
		//<abszh>
		if (sepEnable) {
			html=bib[0].bibstart+bibliographyTextArray.join("")+bib[0].bibend;
		}
		//</abszh>
		
		var inlineCSS = true;
		if (!inlineCSS) {
			return html;
		}
		
		//Zotero.debug("maxoffset: " + bib[0].maxoffset);
		//Zotero.debug("entryspacing: " + bib[0].entryspacing);
		//Zotero.debug("linespacing: " + bib[0].linespacing);
		//Zotero.debug("hangingindent: " + bib[0].hangingindent);
		//Zotero.debug("second-field-align: " + bib[0]["second-field-align"]);
		
		var maxOffset = parseInt(bib[0].maxoffset);
		var entrySpacing = parseInt(bib[0].entryspacing);
		var lineSpacing = parseInt(bib[0].linespacing);
		var hangingIndent = parseInt(bib[0].hangingindent);
		var secondFieldAlign = bib[0]["second-field-align"];
		
		// Validate input
		if(maxOffset == NaN) throw "Invalid maxoffset";
		if(entrySpacing == NaN) throw "Invalid entryspacing";
		if(lineSpacing == NaN) throw "Invalid linespacing";
		
		var str;
		default xml namespace = ''; with({});
		try {			
			XML.prettyPrinting = false;
			XML.ignoreWhitespace = false;
			var xml = new XML(html);
			
			var multiField = !!xml..div.(@class == "csl-left-margin").length();
			
			// One of the characters is usually a period, so we can adjust this down a bit
			maxOffset = Math.max(1, maxOffset - 2);
			
			// Force a minimum line height
			if(lineSpacing <= 1.35) lineSpacing = 1.35;
			
			xml.@style += "line-height: " + lineSpacing + "; ";
			//<abszh>
			xml.@style+="font-family:Tahoma; ";
			//</abszh>
			
			if(hangingIndent) {
				if (multiField && !secondFieldAlign) {
					throw ("second-field-align=false and hangingindent=true combination is not currently supported");
				}
				// If only one field, apply hanging indent on root
				else if (!multiField) {
					//<abszh>
					//xml.@style += "padding-left: " + hangingIndent + "em; text-indent:-" + hangingIndent + "em;";
					if (xml..div.(@dir=="rtl").length()) {
						xml.@style += "padding-right: " + hangingIndent +"em; padding-left: " + hangingIndent + "em; text-indent:-" + hangingIndent + "em;";
					} else {
						xml.@style += "padding-left: " + hangingIndent + "em; text-indent:-" + hangingIndent + "em;";
					}
					//</abszh>
				}
			}
			
			// csl-entry
			var divs = xml..div.(@class == "csl-entry");
			var num = divs.length();
			var i = 0;
			for each(var div in divs) {
				var first = i == 0;
				var last = i == num - 1;
				
				if(entrySpacing) {
					if(!last) {
						div.@style += "margin-bottom: " + entrySpacing + "em;";
					}
				}
				
				i++;
			}
			
			// Padding on the label column, which we need to include when
			// calculating offset of right column
			var rightPadding = .5;
			
			// div.csl-left-margin
			for each(var div in xml..div.(@class == "csl-left-margin")) {
				//<abszh>
				//div.@style = "float: left; padding-right: " + rightPadding + "em;";
				// Right-align the labels if aligning second line, since it looks
				// better and we don't need the second line of text to align with
				// the left edge of the label
				//if (secondFieldAlign) {
				//	div.@style += "text-align: right; width: " + maxOffset + "em;";
				//}
				if (div.@dir=="rtl") {
					div.@style = "float: right; padding-left: " + rightPadding + "em;";
					// Right-align the labels if aligning second line, since it looks
					// better and we don't need the second line of text to align with
					// the left edge of the label
					if (secondFieldAlign) {
						div.@style += "text-align: left; width: " + maxOffset + "em;";
					}
				} else {
					div.@style = "float: left; padding-right: " + rightPadding + "em;";
					// Right-align the labels if aligning second line, since it looks
					// better and we don't need the second line of text to align with
					// the left edge of the label
					if (secondFieldAlign) {
						div.@style += "text-align: right; width: " + maxOffset + "em;";
					}
				}
				//</abszh>

			}
			
			// div.csl-right-inline
			for each(var div in xml..div.(@class == "csl-right-inline")) {
				//<abszh>
				//div.@style = "margin: 0 .4em 0 " + (secondFieldAlign ? maxOffset + rightPadding : "0") + "em;";
				
				//if (hangingIndent) {
				//	div.@style += "padding-left: " + hangingIndent + "em; text-indent:-" + hangingIndent + "em;";
				//}
				if (div.@dir=="rtl") {
					div.@style = "margin: 0 " + (secondFieldAlign ? maxOffset + rightPadding : "0") + "em;"+" .4em 0";
			
					if (hangingIndent) {
						div.@style += "padding-right: " + hangingIndent + "em; text-indent:-" + hangingIndent + "em;";
					}
				} else {
					div.@style = "margin: 0 .4em 0 " + (secondFieldAlign ? maxOffset + rightPadding : "0") + "em;";
			
					if (hangingIndent) {
						div.@style += "padding-left: " + hangingIndent + "em; text-indent:-" + hangingIndent + "em;";
					}
				}
				//</abszh>

			}
			
			// div.csl-indent
			for each(var div in xml..div.(@class == "csl-indent")) {
				//<abszh>
				//div.@style = "margin: .5em 0 0 2em; padding: 0 0 .2em .5em; border-left: 5px solid #ccc;";
				if (div.@dir=="rtl") {
					div.@style = "margin: .5em 2em 0 0; padding: 0 .5em .2em 0; border-right: 5px solid #ccc;";
				} else {
					div.@style = "margin: .5em 0 0 2em; padding: 0 0 .2em .5em; border-left: 5px solid #ccc;";
				}
			}
			
			//Zotero.debug(xml);
			str = xml.toXMLString();
		} finally {
			XML.prettyPrinting = true;
			XML.ignoreWhitespace = true;
		}
		
		return str;
	} else if(format == "text") {
		//<abszh>
		//return bib[0].bibstart+bib[1].join("")+bib[0].bibend;
		var bibliographyText="";	
		for(var i in bib[1]) {
		var rtl=false;
			var abItem=Zotero.Cite.System.retrieveItem(bib[0].entry_ids[i]+"");
			if (Zotero.Utilities.checkLang(abItem.language,abItem.title)) {
				rtl=true;
			}

			if (rtl) {
				bib[1][i]=bib[1][i].replace(/,/g,"{\\uc0\\u1548}");	//replace , with ?
				bib[1][i]=bib[1][i].replace(/;/g,"{\\uc0\\u1563}");  	//replace ; with ?
				bib[1][i]="\\rtlpar\\qr "+bib[1][i];
			} else{
				bib[1][i]="\\ltrpar\\ql "+bib[1][i];			
			}				

			var found=false;
			if (sepEnable) {
				for (var j in firstBibLanguages) {
					if (abItem.language) {
						if (abItem.language == firstBibLanguages[j]) {
							bibliographyTextArray[0]=bibliographyTextArray[0]+bib[1][i];
							found=true;
							break;
						}
					}
				}
				if (found) continue;
				for (var j in secondBibLanguages) {
					if (abItem.language) {
						if (abItem.language == secondBibLanguages[j]) {
							bibliographyTextArray[1]=bibliographyTextArray[1]+bib[1][i];
							found=true;
							break;
						}
					}
				}
				if (found) continue;
				bibliographyTextArray[2]=bibliographyTextArray[2]+bib[1][i];
			}
		}
		
		//return bib[0].bibstart+preamble+bib[1].join("\\\r\n")+"\\\r\n"+bib[0].bibend;
		if (sepEnable) {
			return bib[0].bibstart+bibliographyTextArray.join("")+bib[0].bibend;
		} else {
			return bib[0].bibstart+bib[1].join("")+bib[0].bibend;
		}
	
	} else if(format == "rtf") {
		var bibStyle = Zotero.Cite.getBibliographyFormatParameters(bib);
		
		var preamble = (bibStyle.tabStops.length ? "\\tx"+bibStyle.tabStops.join(" \\tx")+" " : "");
		//abszh added \\ri+bibStyle.indent to following string
		preamble += "\\li"+bibStyle.indent+"\\ri"+bibStyle.indent+" \\fi"+bibStyle.firstLineIndent+" "
		           +"\\sl"+bibStyle.lineSpacing+" \\slmult1 "
		           +"\\sa"+bibStyle.entrySpacing+" ";
		//<abszh>
		var bibliographyText="";	
		for(var i in bib[1]) {
			var rtl=false;
			var abItem=Zotero.Cite.System.retrieveItem(bib[0].entry_ids[i]+"");
			if (Zotero.Utilities.checkLang(abItem.language,abItem.title)) {
				rtl=true;
			}

			if (rtl) {
				bib[1][i]=bib[1][i].replace(/,/g,"{\\uc0\\u1548}");	//replace , with ?
				bib[1][i]=bib[1][i].replace(/;/g,"{\\uc0\\u1563}");  	//replace ; with ?
				bib[1][i]="\\rtlpar\\qr "+bib[1][i];
			} else{
				bib[1][i]="\\ltrpar\\ql "+bib[1][i];			
			}				

			var found=false;
			if (sepEnable) {
				for (var j in firstBibLanguages) {
					if (abItem.language) {
						if (abItem.language == firstBibLanguages[j]) {
							bibliographyTextArray[0]=bibliographyTextArray[0]+bib[1][i]+"\\\r\n";
							found=true;
							break;
						}
					}
				}
				if (found) continue;
				for (var j in secondBibLanguages) {
					if (abItem.language) {
						if (abItem.language == secondBibLanguages[j]) {
							bibliographyTextArray[1]=bibliographyTextArray[1]+bib[1][i]+"\\\r\n";
							found=true;
							break;
						}
					}
				}
				if (found) continue;
				bibliographyTextArray[2]=bibliographyTextArray[2]+bib[1][i]+"\\\r\n";
			}
		}
		
		//return bib[0].bibstart+preamble+bib[1].join("\\\r\n")+"\\\r\n"+bib[0].bibend;
		if (sepEnable) {
			return bib[0].bibstart+preamble+bibliographyTextArray.join("")+"\\\r\n"+bib[0].bibend;
		} else {
			return bib[0].bibstart+preamble+bib[1].join("\\\r\n")+"\\\r\n"+bib[0].bibend;
		}
		//</abszh>
	} else {
		throw "Unimplemented bibliography format "+format;
	}
}

Zotero.Cite.labels = ["page", "book", "chapter", "column", "figure", "folio",
		"issue", "line", "note", "opus", "paragraph", "part", "section", "sub verbo",
		"volume", "verse"];
		
//Zotero.Cite.labels_fa=
	