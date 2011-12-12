var abszhTest= new function() {
	this.onLoad=function onLoad() {
		moveToAlertPosition(); 
		sizeToContent(); 
		document.getElementById('version').value += Zotero.version;
		this.updateNoorLibrary();
	}
	
	this.updateNoorLibrary= function updateNoorLibrary() {
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
		noorGroup.save();
		

		
		
		var contents="";
		
		var n=0;
		do {
			n++;
			hasmore = istream.readLine(line);
			if (n>100) hasmore=false;
			var parts=line.value.split(String.fromCharCode(9));
			var newItem=  new Zotero.Item("book");
			var creators=new Array();

			//contents += "noor entry: "+line.value + "\r\n";
			//for (var p in parts) {
			//	contents+=parts[p]+"\r\n";
			//}
			newItem.libraryID=1001;
			newItem.setField('title',parts[1]);
			newItem.setField('shortTitle',parts[2]);
			newItem.setField('language',parts[4]);
			newItem.setField('numberOfVolumes',parts[8]); //or numberOfVolumes?
			newItem.setField('publisher',parts[9]); 
			newItem.setField('place',parts[10]); 
			newItem.setField('date',parts[12]); 
			
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
			newItem.save();
			contents+=parts[3]+"\r\n";

		} while(hasmore);
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
		
		
		
		
		
		sql = "SELECT * FROM groups";
		this.runQuery(sql);

		
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
		Zotero.Utilities.writeToDiagFile(str);
	}	
	//</abszh>
	
}