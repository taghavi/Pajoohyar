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


Zotero.Timeline = new function () {
	this.generateXMLDetails = generateXMLDetails;
	this.generateXMLList = generateXMLList;

	function generateXMLDetails(items, dateType) {
		var escapeXML = Zotero.Utilities.htmlSpecialChars;
		//<abszh>
		//var activeCalendar=Zotero.Prefs.get('crcis.calendar');
		//</abszh>
		
		var content = '<data>\n';
		for each(var item in items) {
			var date = item.getField(dateType, true);
			if (date) {
				var sqlDate = (dateType == 'date') ? Zotero.Date.multipartToSQL(date) : date;
				sqlDate = sqlDate.replace("00-00", "01-01");
				//<abszh>
				//content += '<event start="' + Zotero.Date.sqlToDate(sqlDate) + '" ';
				//if ((activeCalendar=='persian') && (dateType!='date')) {				
				//	content += '<event start="' + Zotero.Utilities.convertToPersianDate(Zotero.Date.sqlToDate(sqlDate)) + '" ';
				//} else {
				//	content += '<event start="' + Zotero.Date.sqlToDate(sqlDate) + '" ';
				//}
				//</abszh>
				
				content += '<event start="' + Zotero.Date.sqlToDate(sqlDate) + '" ';
				var title = item.getField('title');
				content += 'title=" ' + (title ? escapeXML(title) : '') + '" ';
				content += 'icon="' + item.getImageSrc() + '" ';			
				content += 'color="black">';
				content += item.id;
				content += '</event>\n';
			}
		}
		content += '</data>';
		return content;
	}
	
	function generateXMLList(items) {
	}
}