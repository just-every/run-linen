import type { ReportCell, ReportRow } from './report-data';
const enc=new TextEncoder();
// Spreadsheet-safe CSV: untrusted text can never become an executable formula.
const csvCell=(value:ReportCell)=>{let s=value===null?'':String(value);if(typeof value==='string'&&/^[\s]*[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
export function reportCsv(columns:string[],rows:ReportRow[]) {return [columns.map(csvCell).join(','),...rows.map(row=>columns.map(k=>csvCell(row[k]??null)).join(','))].join('\r\n')+'\r\n';}
const xml=(s:string)=>s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function crc(bytes:Uint8Array) {let n=0xffffffff;for(const b of bytes){n^=b;for(let k=0;k<8;k++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;}
/** Standards-based stored ZIP; inline strings avoid formulas and shared-string index limits. */
export function reportXlsx(columns:string[],rows:ReportRow[]) {
  const cell=(v:ReportCell)=>typeof v==='number'?`<c><v>${v}</v></c>`:`<c t="inlineStr"><is><t xml:space="preserve">${xml(v===null?'':String(v))}</t></is></c>`;
  const files:Record<string,string>={
    '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml':`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${[columns,...rows.map(r=>columns.map(k=>r[k]??null))].map(values=>'<row>'+values.map(cell).join('')+'</row>').join('')}</sheetData></worksheet>`,
  };
  const chunks:Uint8Array[]=[],directory:Uint8Array[]=[];let offset=0;
  for(const [name,value] of Object.entries(files)) {
    const path=enc.encode(name),data=enc.encode(value),checksum=crc(data),local=new Uint8Array(30+path.length),v=new DataView(local.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,checksum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,path.length,true);local.set(path,30);
    const central=new Uint8Array(46+path.length),c=new DataView(central.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint32(16,checksum,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,path.length,true);c.setUint32(42,offset,true);central.set(path,46);
    chunks.push(local,data);directory.push(central);offset+=local.length+data.length;
  }
  const size=directory.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,directory.length,true);v.setUint16(10,directory.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);
  const output=new Uint8Array(offset+size+end.length);let at=0;for(const bytes of [...chunks,...directory,end]){output.set(bytes,at);at+=bytes.length;}return output;
}
