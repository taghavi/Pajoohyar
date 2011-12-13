//this comment added just for test

var abszhTest= new function() {
	this.onLoad=function onLoad() {
		moveToAlertPosition(); 
		sizeToContent(); 
		document.getElementById('version').value += Zotero.version;
		//this.updateNoorLibrary();
	}
	
	var _timer;
	var nnn=0;
	
	this.timerThread=function timerThread() {
		Zotero.sleep(1);
		nnn=nnn+1;
		Zotero.Utilities.writeToDiagFile("timer value is: "+nnn+"\r\n");
		_timer=window.setTimeout("abszhTest.timerThread()",10);
		
	}
	
	this.updateNoorLibrary= function updateNoorLibrary() {
		Zotero.showZoteroPaneProgressMeter("در حال نصب کتابخانه نور. لطفا چند لحظه صبر کنید.");
		//_timer=window.setTimeout("abszhTest.timerThread()",10);
		Zotero.sleep(100);
		// for (var i=0; i<1000000; i++) {
			// for (var j=0; j<100; j++) {
				// var m=i*j;
			// }
		// }
		
		// clearTimeout(_timer);
		// Zotero.hideZoteroPaneOverlay();
		
	
		var noorVersion=Zotero.Schema.getDBVersion('noorlibrary');
		if (!noorVersion) {
			Zotero.Utilities.writeToDiagFile("Noor library does not exist in database yet.\r\n");
		}

		var file = Zotero.getInstallDirectory();
		file.append("noorlibrary.csv");
		
		// Open an input stream from file
		var fistream = Components.classes["@mozilla.org/network/file-input-stream;1"]
			.createInstance(Components.interfaces.nsIFileInputStream);
		fistream.init(file, 0x01, 0444, 0);

		// reading UTF-8 string form file needs more effort
		var charset = "UTF-8";  
		var istream = Components.classes["@mozilla.org/intl/converter-input-stream;1"]  
                   .createInstance(Components.interfaces.nsIConverterInputStream);  
		istream.init(fistream, charset, 1024, 0xFFFD);  
		istream.QueryInterface(Components.interfaces.nsIUnicharLineInputStream);
		
		if (!(istream instanceof Components.interfaces.nsIUnicharLineInputStream)) {
			Zotero.Utilities.writeToDiagFile("Problem in oppening csv file of noor library.\r\n");
			return;
		}
		
		var line = {};
		
		istream.readLine(line);
		var noorFileVersion = line.value.match(/-- ([0-9]+)/)[1];
		Zotero.Utilities.writeToDiagFile("Noor file version is "+noorFileVersion+".\r\n");
		
		//if uptodate return
		if (noorVersion) {
			if (noorVersion>=noorFileVersion) {
				Zotero.Utilities.writeToDiagFile("Noor library is uptodate.\r\n");
				return;
			}
		}
		
		var noorGroup=new Zotero.Group();
		noorGroup.id=1001;
		noorGroup.libraryID=1001;
		noorGroup.name="کتابخانه نور";
		noorGroup.description="فراداده‌های مرکز تحقیقات کامپیوتری علوم اسلامی";
		noorGroup.editable=true;
		noorGroup.filesEditable=false;
		if (noorGroup.exists()) {
			Zotero.Utilities.writeToDiagFile("noorGroup exists. going to erase\r\n");
			noorGroup.erase();
		} 
		var noorGroup=new Zotero.Group();
		noorGroup.id=1001;
		noorGroup.libraryID=1001;
		noorGroup.name="کتابخانه نور";
		noorGroup.description="فراداده‌های مرکز تحقیقات کامپیوتری علوم اسلامی";
		noorGroup.editable=true;
		noorGroup.filesEditable=false;
		noorGroup.save();
		
		Zotero.sleep(100);

		Zotero.DB.beginTransaction();
	
	
		var n=0;
		try {
		
		
			var contents="";
		
			
			do {
				//break;
				var creators=new Array();
				n++;
				var item=new Object();
				hasmore = istream.readLine(line);
				if (n>=10000) hasmore=false;
				var parts=line.value.split(String.fromCharCode(9));

				var sqlColumns = [];
				var sqlValues = [];
				var itemID = Zotero.ID.get('items');				
				if (itemID) {
					sqlColumns.push('itemID');
					sqlValues.push({ int: itemID });
				}
				var key = Zotero.ID.getKey();
				sqlColumns.push(
					'itemTypeID',
					'dateAdded',
					'dateModified',
					'clientDateModified',
					'libraryID',
					'key'
				);
				sqlValues.push(
					2,
					Zotero.DB.transactionDateTime,
					Zotero.DB.transactionDateTime,
					Zotero.DB.transactionDateTime,
					1001,
					key
				);
				var sql = "INSERT INTO items (" + sqlColumns.join(', ') + ') VALUES (';
				// Insert placeholders for bind parameters
				for (var i=0; i<sqlValues.length; i++) {
					sql += '?, ';
				}
				sql = sql.substring(0, sql.length-2) + ")";
				try {
					// Needed to work around startup crash in Fx3.5
					var l = this.libraryID;
					var k = this.key;
					
					var insertID = Zotero.DB.query(sql, sqlValues);
					Zotero.sleep(1);
				}
				catch (e) {
					if (l &&
						((e.indexOf && e.indexOf('fki_items_libraryID_libraries_libraryID') != -1)
							|| (!Zotero.Libraries.exists(l)))) {
						var msg = "Library " + l + " for item " + k + " not found";;
						var e = new Zotero.Error(msg, "MISSING_OBJECT");
					}
					throw (e);
				}
				if (!itemID) {
					itemID = insertID;
				}

				item.title=parts[1];
				item.shortTitle=parts[2];
				
				sql = "SELECT valueID FROM itemDataValues WHERE value=?";
				var valueStatement = Zotero.DB.getStatement(sql);
				
				sql = "INSERT INTO itemDataValues VALUES (?,?)";
				var insertValueStatement = Zotero.DB.getStatement(sql);
				
				sql = "INSERT INTO itemData VALUES (?,?,?)";
				var insertStatement = Zotero.DB.getStatement(sql);

				for (fieldName in item) {
					var value=item[fieldName];
					var fieldID=Zotero.ItemFields.getID(fieldName);
					//Zotero.Utilities.writeToDiagFile("fieldName is: "+fieldName+" fieldID is: "+fieldID+" itemID is: "+itemID+"\r\n");
					if ((!value) || (!fieldID)) {
						continue;
					}
					var dataType = Zotero.DB.getSQLDataType(value);
					
					switch (dataType) {
						case 32:
							valueStatement.bindInt32Parameter(0, value);
							break;
							
						case 64:
							valueStatement.bindInt64Parameter(0, value);
							break;
						
						default:
							valueStatement.bindUTF8StringParameter(0, value);
					}
					if (valueStatement.executeStep()) {
						var valueID = valueStatement.getInt32(0);
					}
					else {
						var valueID = null;
					}

					valueStatement.reset();
					//Zotero.Utilities.writeToDiagFile("valueID is: "+valueID+" value is: "+value+"\r\n");
					
					if (!valueID) {
						valueID = Zotero.ID.get('itemDataValues');
						insertValueStatement.bindInt32Parameter(0, valueID);
						//Zotero.Utilities.writeToDiagFile("again valueID is: "+valueID+" value is: "+value+"\r\n");
						
						switch (dataType) {
							case 32:
								insertValueStatement.
									bindInt32Parameter(1, value);
								break;
							
							case 64:
								insertValueStatement.
									bindInt64Parameter(1, value);
								break;
							
							default:
								insertValueStatement.
									bindUTF8StringParameter(1, value);
						}
						
						try {
							insertValueStatement.execute();
						}
						catch (e) {
							throw (e + ' [ERROR: ' + Zotero.DB.getLastErrorString() + ']');
						}
					}
					insertStatement.bindInt32Parameter(0, itemID);
					insertStatement.bindInt32Parameter(1, fieldID);
					insertStatement.bindInt32Parameter(2, valueID);

					//Zotero.Utilities.writeToDiagFile("here fieldID is: "+fieldID+" itemID is: "+itemID+" value ID is: "+valueID+ "sql is: "+insertStatement+"\r\n");
					
					try {
						insertStatement.execute();
					}
					catch(e) {
						throw (e + ' [ERROR: ' + Zotero.DB.getLastErrorString() + ']');
					}
				}
					
					
				
				

				
				

				
				

				//contents += "noor entry: "+line.value + "\r\n";
				//for (var p in parts) {
				//	contents+=parts[p]+"\r\n";
				//}
				// newItem.libraryID=1001;
				// newItem.setField('title',parts[1]);
				// newItem.setField('shortTitle',parts[2]);
				// newItem.setField('language',parts[4]);
				// newItem.setField('numberOfVolumes',parts[8]); //or numberOfVolumes?
				// newItem.setField('publisher',parts[9]); 
				// newItem.setField('place',parts[10]); 
				// newItem.setField('date',parts[12]); 
				
	//			newItem.shortTitle=parts[2];
				//Zotero.Utilities.writeToDiagFile(newItem.toSource());
				//newItem.
				if (parts[5].length>0) {
					var authorText=parts[5].replace(/\u060C/g,',');
					//Zotero.Utilities.writeToDiagFile(newItem.toSource());
					creators.push(Zotero.Utilities.cleanAuthor(authorText, "author",true));

				}
				if (parts[15].length>0) {
					var authorText=parts[15].replace(/\u060C/g,',');
					creators.push(Zotero.Utilities.cleanAuthor(authorText, "contributer",true));
					
				}
//				newItem.save();
				contents+=parts[3]+"\r\n";

			} while(hasmore);
			Zotero.DB.commitTransaction();
		
		} catch (e) {
			Zotero.DB.rollbackTransaction();
			Zotero.debug(e);
			throw(e);
		}
		istream.close();
		//Zotero.Utilities.writeToDiagFile(contents);
		
		noorGroup.editable=false;
		noorGroup.save();
		
		
		var sql="";
		//sql = "SELECT * FROM itemNotes";
		//sql = "SELECT * FROM libraries";
		//sql="DELETE FROM groups WHERE libraryID=1001";
		//Zotero.DB.query(sql);
		//sql="DELETE FROM libraries WHERE libraryID=1001";
		//Zotero.DB.query(sql);
		//sql="INSERT INTO libraries VALUES ('1001','group')";
		
		
		
		
		
		sql = "SELECT * FROM itemDataValues";
		//this.runQuery(sql);
		
//		clearTimeout(this._timer);
		Zotero.hideZoteroPaneOverlay();
		Zotero.Utilities.writeToDiagFile("n is: "+n+"\r\n");

	}
	
	
	this.runQuery=function runQuery(sql) {
		var result=Zotero.DB.query(sql);
		var n=0;
		var str="";
		for (var i in result) {
			str+=("row: "+n+"\r\n");
			n++;
			for (var j in result[i]) {
				str+=(j+": "+result[i][j]+"\r\n");
			}
		}
		//Zotero.Utilities.writeToDiagFile(str);
	}	
	//</abszh>
	
}