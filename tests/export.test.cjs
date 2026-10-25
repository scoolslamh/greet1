const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function environment(role='مشرف'){
  const tables={schools:{headers:['معرف السجل','اسم المدرسة','المشرف','السجل المدني','جوال مدير المدرسة'],rows:[['a','School A','First','1000000001','0500000000'],['b','School B','First','1000000001','0500000001'],['c','School C','Second','1000000002','0500000002'],['d','School D','Second','1000000002','0500000003']]},status:{headers:['معرف السجل','الحالة','آخر تحديث','تاريخ الاعتماد'],rows:[['a','قيد الاستكمال','time',''],['b','مكتمل','time','date'],['c','قيد الاستكمال','time','']]},guards:{headers:['معرف السجل','اسم الحارس','جوال الحارس'],rows:[['a','Guard A','0500000000'],['b','Guard B','0500000001'],['c','Guard C','0500000002']]},coverage:{headers:['معرف السجل','العجز'],rows:[['a','2'],['b','0'],['c','1']]}};
  const ctx=vm.createContext({beginRequest_(){},SHEETS:{schools:'schools',status:'status',guards:'guards',coverage:'coverage'},CacheService:{getScriptCache:()=>({get:key=>key==='valid'?'1000000001':null})},monitoringSessionKey_:value=>value,monitoringAccount_:civil=>({civil,role}),monitoringCivil_:value=>String(value||''),monitoringHeader_:value=>String(value).trim(),Utilities:{formatDate:()=> '20261025-1030'},records_:name=>tables[name].rows.map(values=>({values})),sheet_:name=>({getLastColumn:()=>tables[name].headers.length,getRange:()=>({getDisplayValues:()=>[tables[name].headers]})})});
  vm.runInContext(fs.readFileSync(process.env.EXPORT_BACKEND_PATH||'Export.gs','utf8'),ctx);return {ctx,tables};
}
test('supervisor export excludes completed and unassigned-to-user schools from every sheet',()=>{
  const {ctx}=environment();const result=ctx.exportIncompleteSchools('valid');assert.equal(result.count,1);assert.equal(result.sheets.length,4);
  for(const sheet of result.sheets)assert.deepEqual(Array.from(sheet.rows,row=>row[0]),['a']);
  assert.ok(!JSON.stringify(result).includes('School B'));assert.ok(!JSON.stringify(result).includes('Guard C'));
});
test('manager export includes unstarted schools with synthetic status and all saved columns',()=>{
  const {ctx,tables}=environment('مدير النظام');tables.schools.headers.push('حقل إضافي');tables.schools.rows[0].push('Saved extra');const result=ctx.exportIncompleteSchools('valid');
  assert.equal(result.count,3);assert.equal(result.sheets[0].rows[0][5],'Saved extra');assert.equal(result.sheets[3].rows.find(row=>row[0]==='d')[1],'لم يبدأ');
});
test('invalid sessions cannot export, and newly completed records disappear on next export',()=>{
  const {ctx,tables}=environment();assert.throws(()=>ctx.exportIncompleteSchools('school-session'));
  tables.status.rows[0][1]='مكتمل';assert.equal(ctx.exportIncompleteSchools('valid').count,0);
});
test('missing assignment column never grants supervisor global export access',()=>{
  const {ctx,tables}=environment();tables.schools.headers[3]='Different';assert.throws(()=>ctx.exportIncompleteSchools('valid'));
});
function workbook(sheets){const context=vm.createContext({window:{},TextEncoder});const script=fs.readFileSync('ExcelExport.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];vm.runInContext(script,context);return context.window.schoolExcel.build(sheets);}

test('duplicate incomplete tracking rows are preserved without duplicating schools or changing source data',()=>{
  const {ctx,tables}=environment();tables.status.rows.push(['a','قيد الاستكمال','other time',''],['','', 'orphan','']);
  const before=JSON.stringify(tables);const result=ctx.exportIncompleteSchools('valid');
  assert.equal(result.count,1);assert.equal(result.sheets[0].rows.length,1);
  assert.equal(result.sheets[3].rows.length,2);assert.equal(JSON.stringify(tables),before);
});

test('any completed tracking row excludes the school regardless of duplicate row order',()=>{
  for(const prepend of [true,false]){
    const {ctx,tables}=environment();const row=['a','مكتمل','time','date'];
    if(prepend)tables.status.rows.unshift(row);else tables.status.rows.push(row);
    assert.equal(ctx.exportIncompleteSchools('valid').count,0);
  }
});

test('duplicates outside supervisor scope never block or leak into export',()=>{
  const {ctx,tables}=environment();tables.status.rows.push(['c','قيد الاستكمال','','']);
  const result=ctx.exportIncompleteSchools('valid');assert.equal(result.count,1);
  for(const sheet of result.sheets)assert.ok(sheet.rows.every(row=>row[0]==='a'));
});
test('Excel output is a real ZIP workbook with RTL, frozen headings and safe text cells',()=>{
  const bytes=workbook([{name:'المدارس',headers:['الرقم الوزاري','الجوال','الاسم'],rows:[['M123','0500000000','=HYPERLINK("x")']]}]);
  const data=Buffer.from(bytes);assert.equal(data.readUInt32LE(0),0x04034b50);const text=data.toString('utf8');assert.ok(text.includes('xl/workbook.xml'));assert.ok(text.includes('rightToLeft="1"'));assert.ok(text.includes('state="frozen"'));assert.ok(text.includes('0500000000'));assert.ok(!text.includes('<f>'));assert.ok(text.includes('=HYPERLINK(&quot;x&quot;)'));
});
module.exports={workbook};
