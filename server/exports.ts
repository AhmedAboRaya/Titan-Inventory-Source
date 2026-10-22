import ExcelJS from 'exceljs';
import { Inventory } from './service';
import { Actor, Decimal, cairoDate, permit, fail } from './common';

const titles:Record<string,string>={balances:'أرصدة المخزون',ledger:'سجل حركة المخزون',custody:'العهد'};
const internalKeys=new Set(['position_key','id','document_id','line_id','item_id','warehouse_id','location_id','holder_id','transit_id','lot_id','serial_id','department_id','machine_id']);
const quantityKeys=new Set(['quantity','reserved','available','returned','received','expected','counted','recounted']);
const moneyKeys=new Set(['value','unit_cost','posted_unit_cost','average_cost','last_price','unit_price','cost','total_cost','exchange_rate','posted_value']);
const numericKeys=new Set([...quantityKeys,...moneyKeys]);
const dateTime=new Intl.DateTimeFormat('ar-EG',{timeZone:'Africa/Cairo',dateStyle:'full',timeStyle:'short'});

function safeCell(value:any,key:string):ExcelJS.CellValue {
 if(value==null||value==='')return null;
 // Excel supports 15 significant decimal digits. Preserve more precise values
 // as exact text instead of silently rounding PostgreSQL NUMERIC values.
 if(numericKeys.has(key)&&/^-?\d+(\.\d+)?$/.test(String(value))){
  const decimal=new Decimal(value),number=decimal.toNumber();
  if(decimal.sd()<=15&&Number.isFinite(number)&&new Decimal(String(number)).eq(decimal))return number;
  return String(value);
 }
 if(value instanceof Date)return dateTime.format(value);
 if(typeof value==='object')return JSON.stringify(value);
 return typeof value==='string'&&/^[=+@-]/.test(value)?"'"+value:value;
}

export async function exportReport(service:Inventory,a:Actor,kind:string,q:Record<string,string>){
 permit(a,'reports');if(!titles[kind])fail('REPORT','التقرير غير موجود',404);
 const rows=await service.db.transaction(async tx=>{
  const actor=await service.auth.actor(tx,a.id),all:any[]=[];
  for(let offset=0;offset<=50000;offset+=1000){
   const page=await service.report(tx,actor,kind,{...q,limit:'1000',offset:String(offset)});
   all.push(...page);
   if(all.length>50000)fail('EXPORT_SIZE','التقرير كبير؛ ضيق الفلاتر قبل التصدير',413);
   if(page.length<1000)return all;
  }
  return all;
 });
 const now=new Date(),workbook=new ExcelJS.Workbook();
 workbook.creator='TITAN INVENTORY';workbook.created=now;
 const sheet=workbook.addWorksheet('TITAN INVENTORY',{views:[{rightToLeft:true,state:'frozen',ySplit:5}]});
 const columns=rows.length?Object.keys(rows[0]).filter(k=>!internalKeys.has(k)):['الحالة'];
 const width=Math.max(4,columns.length);
 sheet.columns=Array.from({length:width},(_,i)=>{
  const key=columns[i]||'';
  return{key,width:/(name|reason|description)/.test(key)?30:/(_at|_on|date)/.test(key)?25:numericKeys.has(key)?23:20};
 });
 const filters=Object.entries(q).filter(([key])=>!['limit','offset'].includes(key)).map(([key,value])=>`${key}: ${value}`).join('  |  ')||'جميع البيانات ضمن نطاق صلاحيات المستخدم';
 const metadata=[
  `TITAN INVENTORY — ${titles[kind]}`,
  `تاريخ التقرير: ${dateTime.format(now)} — توقيت القاهرة`,
  `الفلاتر: ${filters}`,
  'العملة: EGP — الكميات حسب وحدة الصنف. يدعم Excel حتى 15 رقمًا معنويًا؛ القيم الأدق تحفظ كنص دون تقريب.',
 ];
 for(let index=0;index<metadata.length;index++){
  const row=sheet.addRow([metadata[index]]);
  sheet.mergeCells(index+1,1,index+1,width);
  const totalWidth=sheet.columns.reduce((sum,column)=>sum+(column.width||20),0);
  row.height=Math.max(index===0?36:index===3?40:32,Math.min(409,Math.ceil((metadata[index]?.length||0)/(totalWidth*0.7))*17+12));
  row.alignment={vertical:'middle',horizontal:'right',wrapText:true,readingOrder:'rtl',indent:1};
  row.font={name:'Arial',size:index===0?17:11,bold:index===0,color:{argb:'FF143449'}};
 }
 const headings=sheet.addRow(columns);headings.height=30;
 headings.eachCell(cell=>{
  cell.font={name:'Arial',bold:true,size:11,color:{argb:'FFFFFFFF'}};
  cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF143449'}};
  cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};
 });
 if(!rows.length){sheet.addRow(['لا توجد بيانات']);sheet.mergeCells(6,1,6,width);sheet.getRow(6).height=30;}
 else for(const data of rows){
  const row=sheet.addRow(columns.map(key=>safeCell(data[key],key)));
  row.font={name:'Arial',size:11};row.height=32;
  row.eachCell({includeEmpty:true},(cell,index)=>{
   const key=columns[index-1]||'',numeric=numericKeys.has(key);
   cell.alignment={vertical:'middle',horizontal:numeric?'right':'center',wrapText:!numeric,readingOrder:key==='name_ar'?'rtl':'ltr'};
   if(numeric&&typeof cell.value==='number'){
    const places=Math.max(moneyKeys.has(key)?2:0,new Decimal(cell.value).decimalPlaces());
    const format='#,##0'+(places?'.'+'0'.repeat(places):'');
    cell.numFmt=`${format};[Red](${format});${moneyKeys.has(key)?'0.00':'0'}`;
   }
   if(numeric&&typeof cell.value==='string'){
    cell.numFmt='@';cell.note='قيمة دقيقة محفوظة كنص لأن Excel لا يدعم أكثر من 15 رقمًا معنويًا.';
    sheet.getColumn(index).width=Math.min(42,Math.max(sheet.getColumn(index).width||23,String(cell.value).length+3));
   }
   if(row.number%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F6F8'}};
   cell.border={bottom:{style:'hair',color:{argb:'FFD8E2E8'}}};
   const length=String(cell.value??'').length,available=(sheet.getColumn(index).width||20)-2;
   if(!numeric)row.height=Math.max(row.height||32,Math.min(409,Math.ceil(length/available)*16+12));
  });
 }
 sheet.autoFilter={from:{row:5,column:1},to:{row:5,column:columns.length}};
 sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:5',printArea:`A1:${sheet.getColumn(width).letter}${sheet.rowCount}`,margins:{left:0.25,right:0.25,top:0.35,bottom:0.35,header:0.15,footer:0.15}};
 sheet.headerFooter.oddFooter='&CTITAN INVENTORY — &P / &N';
 const buffer=Buffer.from(await workbook.xlsx.writeBuffer());
 return{filename:`TITAN-INVENTORY-${kind}-${cairoDate(now)}.xlsx`,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',data:buffer.toString('base64')};
}
