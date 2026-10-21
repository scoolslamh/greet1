/** Supervisor monitoring. Civil IDs stay on the server and are never returned to the browser. */
const MONITOR_SHEET = 'المشرفين';
const MONITOR_HEADERS = ['الاسم','السجل المدني','الصلاحية'];

// Run once from the Apps Script editor. Existing cells and column positions are preserved.
function setupMonitoring_() {
  beginRequest_();
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const ss=db_();
    const supervisors=ss.getSheetByName(MONITOR_SHEET)||ss.insertSheet(MONITOR_SHEET);
    ensureMonitoringHeaders_(supervisors,MONITOR_HEADERS);
    ensureMonitoringHeaders_(sheet_(SHEETS.schools),['المشرف','السجل المدني']);
    for(const sh of [supervisors,sheet_(SHEETS.schools)]){
      const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(monitoringHeader_);
      const civil=headers.indexOf('السجل المدني');
      if(civil>=0)sh.getRange(2,civil+1,Math.max(1,sh.getMaxRows()-1),1).setNumberFormat('@');
      sh.setRightToLeft(true);sh.setFrozenRows(1);
    }
    return 'تم تجهيز ورقة المشرفين وعمودي المشرف والسجل المدني في المدارس دون تغيير البيانات الحالية';
  }finally{lock.releaseLock();}
}
function ensureMonitoringHeaders_(sh,required){
  const existing=sh.getLastColumn()?sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0]:[];
  for(const header of required){
    if(existing.filter(value=>monitoringHeader_(value)===monitoringHeader_(header)).length>1)throw Error('عمود مكرر: '+header);
    if(!existing.some(value=>monitoringHeader_(value)===monitoringHeader_(header))){
      existing.push(header);
      if(sh.getMaxColumns()<existing.length)sh.insertColumnsAfter(sh.getMaxColumns(),existing.length-sh.getMaxColumns());
      sh.getRange(1,existing.length).setValue(header).setBackground('#087b69').setFontColor('#ffffff').setFontWeight('bold');
    }
  }
}
function monitoringText_(value){return String(value||'').replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'').replace(/\s+/g,' ').trim();}
// Normalize headings only. Never normalize names, civil IDs or roles using these substitutions.
function monitoringHeader_(value){return monitoringText_(value).replace(/[\u0640\u064b-\u065f\u0670]/g,'').replace(/ى/g,'ي').replace(/[أإآ]/g,'ا');}
function monitoringCivil_(value){return normalizeCode_(monitoringText_(value));}
function monitoringRows_(name,required){
  const sh=sheet_(name),width=sh.getLastColumn();
  if(!width)throw Error('يجب تجهيز أعمدة المتابعة أولاً');
  const headers=sh.getRange(1,1,1,width).getDisplayValues()[0].map(monitoringHeader_);
  const columns={};
  for(const header of required){
    const normalized=monitoringHeader_(header);
    if(headers.filter(value=>value===normalized).length!==1)throw Error('تحقق من عمود '+header+' في ورقة '+name);
    columns[header]=headers.indexOf(normalized);
  }
  const raw=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,width).getDisplayValues():[];
  const rows=[],rowNumbers=[];
  raw.forEach((row,i)=>{if(row.some(value=>monitoringText_(value))){rows.push(row);rowNumbers.push(i+2);}});
  return {rows,columns,rowNumbers,headers};
}
/** Editor-only diagnostic: logs header metadata, never school data or civil ID values. */
function diagnoseMonitoringHeaders_(){
  beginRequest_();
  const sh=sheet_(SHEETS.schools),width=sh.getLastColumn();
  const headers=width?sh.getRange(1,1,1,width).getDisplayValues()[0]:[];
  const result={sheet:sh.getName(),columns:headers.map((value,index)=>({column:index+1,title:String(value),normalized:monitoringHeader_(value),codePoints:Array.from(String(value)).map(char=>'U+'+char.codePointAt(0).toString(16).toUpperCase())}))};
  console.log(JSON.stringify(result));return result;
}
function monitoringAccounts_(){
  const table=monitoringRows_(MONITOR_SHEET,MONITOR_HEADERS),c=table.columns;
  const accounts=table.rows.map((row,i)=>({key:'supervisor_'+table.rowNumbers[i],row:table.rowNumbers[i],name:monitoringText_(row[c['الاسم']]),civil:monitoringCivil_(row[c['السجل المدني']]),role:monitoringText_(row[c['الصلاحية']])}));
  const frequencies=new Map();
  for(const account of accounts)frequencies.set(account.civil,(frequencies.get(account.civil)||0)+1);
  for(const account of accounts){
    const errors=[];
    if(!account.name)errors.push('الاسم مطلوب');
    if(!/^\d{10}$/.test(account.civil))errors.push('السجل المدني يجب أن يتكون من 10 أرقام');
    if(!['مشرف','مدير النظام'].includes(account.role))errors.push('الصلاحية يجب أن تكون مشرف أو مدير النظام');
    if(account.civil&&frequencies.get(account.civil)>1)errors.push('السجل المدني مكرر');
    account.error=errors.length?'ورقة المشرفين، الصف '+account.row+': '+errors.join('؛ '):'';
  }
  return accounts;
}
function monitoringAccount_(civil,accounts){
  const matches=(accounts||monitoringAccounts_()).filter(item=>item.civil===civil);
  if(!matches.length)throw Error('لا يوجد حساب متابعة مسجل بهذه البيانات');
  if(matches.length>1)throw Error('السجل المدني مكرر في ورقة المشرفين؛ راجع الصفوف '+matches.map(item=>item.row).join('، '));
  if(matches[0].error)throw Error(matches[0].error);
  return matches[0];
}
function monitoringSessionKey_(token){return 'monitor_'+hash_(String(token||''));}
function loginSupervisor(civil){
  beginRequest_();
  civil=monitoringCivil_(civil);
  if(!/^\d{10}$/.test(civil))throw Error('أدخل سجلاً مدنياً صحيحاً من 10 أرقام');
  const accounts=monitoringAccounts_(),account=monitoringAccount_(civil,accounts);
  const token=Utilities.getUuid()+Utilities.getUuid();
  const result=monitoringData_(account,accounts);
  CacheService.getScriptCache().put(monitoringSessionKey_(token),civil,21600);
  return {token,data:result};
}
function getMonitoring(token){
  beginRequest_();
  const civil=CacheService.getScriptCache().get(monitoringSessionKey_(token));
  if(!civil)throw Error('انتهت جلسة المتابعة؛ سجل الدخول مجدداً');
  const accounts=monitoringAccounts_(),account=monitoringAccount_(civil,accounts);
  return monitoringData_(account,accounts);
}
function logoutSupervisor(token){CacheService.getScriptCache().remove(monitoringSessionKey_(token));return true;}
function reopenSchool(token,payload){
  beginRequest_();
  const id=payload&&typeof payload.id==='string'?payload.id.trim():'';
  if(!id||id.length>150)throw Error('معرف المدرسة غير صالح');
  const requireManager=()=>{
    const civil=CacheService.getScriptCache().get(monitoringSessionKey_(token));
    if(!civil)throw Error('انتهت جلسة المتابعة؛ سجل الدخول مجدداً');
    const account=monitoringAccount_(civil);
    if(account.role!=='مدير النظام')throw Error('إعادة فتح التعديل متاحة لمدير النظام فقط');
  };
  requireManager();
  withWriteLock_(function(){
    requireManager();
    const matches=records_(SHEETS.schools).filter(row=>row.values[0]===id);
    if(matches.length!==1)throw Error(matches.length?'معرف المدرسة مكرر؛ راجع سجل المدارس':'المدرسة غير موجودة');
    const status=find_(SHEETS.status,id);
    if(status&&status.values[1]==='مكتمل')touch_(id,false);
  });
  return getMonitoring(token);
}
function monitoringData_(account,accountSnapshot){
  const isManager=account.role==='مدير النظام';
  const table=monitoringRows_(SHEETS.schools,['معرف السجل','اسم المدرسة','اسم مدير المدرسة','المحافظة','جوال مدير المدرسة']),c=table.columns;
  const civilColumn=table.headers.filter(header=>header==='السجل المدني').length===1?table.headers.indexOf('السجل المدني'):-1;
  const supervisorColumn=table.headers.filter(header=>header==='المشرف').length===1?table.headers.indexOf('المشرف'):-1;
  // A manager can always see all schools. Supervisors must have a valid assignment column.
  if(!isManager&&civilColumn<0){
    const matches=table.headers.filter(header=>header==='السجل المدني').length;
    if(matches>1)throw Error('عنوان السجل المدني مكرر في الصف الأول من ورقة المدارس؛ يجب وجود عمود واحد فقط بهذا الاسم');
    throw Error('لم يُعثر على عنوان السجل المدني في الصف الأول من ورقة المدارس؛ تحقق من اسم العمود وملف البيانات المرتبط بالنظام');
  }
  const allAccounts=accountSnapshot||monitoringAccounts_(),accounts=allAccounts.filter(item=>!item.error),byCivil=new Map(accounts.map(item=>[item.civil,item]));
  const statuses=new Map(records_(SHEETS.status).map(item=>[item.values[0],item.values[1]]));
  const schools=[];
  for(const row of table.rows){
    const civil=civilColumn>=0?monitoringCivil_(row[civilColumn]):'';
    if(!isManager&&civil!==account.civil)continue;
    const owner=byCivil.get(civil);
    schools.push({id:row[c['معرف السجل']],name:row[c['اسم المدرسة']],principal:row[c['اسم مدير المدرسة']],governorate:row[c['المحافظة']],mobile:row[c['جوال مدير المدرسة']],supervisor:owner?owner.name:String(supervisorColumn>=0?row[supervisorColumn]||'':''),supervisorKey:owner?owner.key:'unassigned',status:statuses.get(row[c['معرف السجل']])||'لم يبدأ'});
  }
  const summarize=list=>{const complete=list.filter(item=>item.status==='مكتمل').length;return {total:list.length,complete,remaining:list.length-complete,percent:list.length?Math.round(complete/list.length*100):0};};
  const result={user:{name:account.name,role:account.role},stats:summarize(schools),schools};
  if(isManager){
    result.assignmentReady=civilColumn>=0;
    result.accountIssues=allAccounts.filter(item=>item.error).map(item=>item.error);
    const totals=new Map(accounts.map(owner=>[owner.key,{total:0,complete:0}]));
    for(const school of schools){const counter=totals.get(school.supervisorKey);if(counter){counter.total++;if(school.status==='مكتمل')counter.complete++;}}
    result.supervisors=accounts.map(owner=>{const counter=totals.get(owner.key);return {key:owner.key,name:owner.name,role:owner.role,...counter,remaining:counter.total-counter.complete,percent:counter.total?Math.round(counter.complete/counter.total*100):0};});
    result.unassigned=summarize(schools.filter(item=>item.supervisorKey==='unassigned'));
  }
  return result;
}
