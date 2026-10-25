/** Read-only export: authorization and completion filtering are enforced on the server. */
function exportTable_(name){
  const sh=sheet_(name),width=sh.getLastColumn();
  if(!width)throw Error('لا توجد عناوين أعمدة في ورقة '+name);
  return {name,headers:sh.getRange(1,1,1,width).getDisplayValues()[0],records:records_(name)};
}
function exportIncompleteSchools(token){
  beginRequest_();
  const civil=CacheService.getScriptCache().get(monitoringSessionKey_(token));
  if(!civil)throw Error('انتهت جلسة المتابعة؛ سجل الدخول مجدداً');
  const account=monitoringAccount_(civil),manager=account.role==='مدير النظام';
  const schools=exportTable_(SHEETS.schools),statuses=exportTable_(SHEETS.status);
  const normalized=schools.headers.map(monitoringHeader_);
  const idColumn=normalized.indexOf(monitoringHeader_('معرف السجل'));
  const civilColumns=normalized.map((header,index)=>header==='السجل المدني'?index:-1).filter(index=>index>=0);
  if(idColumn!==0)throw Error('تحقق من عمود معرف السجل في ورقة المدارس');
  if(!manager&&civilColumns.length!==1)throw Error('يلزم عمود واحد باسم السجل المدني في ورقة المدارس لتحديد مدارس المشرف');
  const statusById=new Map();
  // Duplicate tracking rows must not block export or expose an approved school.
  // Preserve all original rows below; a completed row takes precedence for filtering.
  for(const row of statuses.records){
    const id=String(row.values[0]||'');if(!id)continue;
    if(!statusById.has(id)||row.values[1]==='مكتمل')statusById.set(id,row.values);
  }
  const selected=[],unidentified=[],ids=new Set();
  for(const row of schools.records){
    if(!manager&&monitoringCivil_(row.values[civilColumns[0]])!==account.civil)continue;
    const id=String(row.values[0]||'');
    if(!id.trim()){unidentified.push(row.values);continue;}
    if(ids.has(id))throw Error('يوجد معرف مدرسة مكرر؛ راجع البيانات قبل التصدير');
    const status=statusById.get(id);
    if(status&&status[1]==='مكتمل')continue;
    ids.add(id);selected.push(row.values);
  }
  if(!selected.length&&!unidentified.length)return {count:0,sheets:[]};
  const pad=(row,width)=>Array.from({length:width},(_,i)=>String(row[i]??''));
  const result=[{name:'المدارس',headers:schools.headers.concat(['حالة الاستكمال']),rows:selected.map(row=>pad(row,schools.headers.length).concat([(statusById.get(String(row[0]))||[])[1]||'لم يبدأ']))}];
  for(const name of [SHEETS.guards,SHEETS.coverage]){
    const table=exportTable_(name);
    result.push({name,headers:table.headers,rows:table.records.filter(row=>ids.has(String(row.values[0]))).map(row=>pad(row.values,table.headers.length))});
  }
  const trackingRows=statuses.records.filter(row=>ids.has(String(row.values[0]))).map(row=>pad(row.values,statuses.headers.length));
  for(const row of selected)if(!statusById.has(String(row[0])))trackingRows.push(pad([row[0],'لم يبدأ'],statuses.headers.length));
  result.push({name:'المتابعة',headers:statuses.headers,rows:trackingRows});
  if(unidentified.length)result.push({name:'سجلات تحتاج مراجعة',headers:schools.headers.concat(['سبب المراجعة']),rows:unidentified.map(row=>pad(row,schools.headers.length).concat(['معرف السجل مفقود؛ تعذر تحديد حالة الاستكمال وربط البيانات']))});
  return {count:selected.length+unidentified.length,incompleteCount:selected.length,reviewCount:unidentified.length,sheets:result,generatedAt:Utilities.formatDate(new Date(),'Asia/Riyadh','yyyyMMdd-HHmm')};
}
