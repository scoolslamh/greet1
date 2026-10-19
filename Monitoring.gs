/** Supervisor monitoring. Civil IDs stay on the server and are never returned to the browser. */
const MONITOR_SHEET = 'المشرفين';
const MONITOR_HEADERS = ['الاسم','السجل المدني','الصلاحية'];

// Run once from the Apps Script editor. Existing cells and column positions are preserved.
function setupMonitoring_() {
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const ss=db_();
    const supervisors=ss.getSheetByName(MONITOR_SHEET)||ss.insertSheet(MONITOR_SHEET);
    ensureMonitoringHeaders_(supervisors,MONITOR_HEADERS);
    ensureMonitoringHeaders_(sheet_(SHEETS.schools),['المشرف','السجل المدني']);
    for(const sh of [supervisors,sheet_(SHEETS.schools)]){
      const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
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
    if(existing.filter(value=>String(value).trim()===header).length>1)throw Error('عمود مكرر: '+header);
    if(!existing.some(value=>String(value).trim()===header)){
      existing.push(header);
      if(sh.getMaxColumns()<existing.length)sh.insertColumnsAfter(sh.getMaxColumns(),existing.length-sh.getMaxColumns());
      sh.getRange(1,existing.length).setValue(header).setBackground('#087b69').setFontColor('#ffffff').setFontWeight('bold');
    }
  }
}
function monitoringText_(value){return String(value||'').replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'').replace(/\s+/g,' ').trim();}
function monitoringCivil_(value){return normalizeCode_(monitoringText_(value));}
function monitoringRows_(name,required){
  const sh=sheet_(name),width=sh.getLastColumn();
  if(!width)throw Error('يجب تجهيز أعمدة المتابعة أولاً');
  const headers=sh.getRange(1,1,1,width).getDisplayValues()[0].map(value=>String(value).trim());
  const columns={};
  for(const header of required){
    if(headers.filter(value=>value===header).length!==1)throw Error('تحقق من عمود '+header+' في ورقة '+name);
    columns[header]=headers.indexOf(header);
  }
  const raw=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,width).getDisplayValues():[];
  const rows=[],rowNumbers=[];
  raw.forEach((row,i)=>{if(row.some(value=>monitoringText_(value))){rows.push(row);rowNumbers.push(i+2);}});
  return {rows,columns,rowNumbers,headers};
}
function monitoringAccounts_(){
  const table=monitoringRows_(MONITOR_SHEET,MONITOR_HEADERS),c=table.columns;
  const accounts=table.rows.map((row,i)=>({key:'supervisor_'+table.rowNumbers[i],row:table.rowNumbers[i],name:monitoringText_(row[c['الاسم']]),civil:monitoringCivil_(row[c['السجل المدني']]),role:monitoringText_(row[c['الصلاحية']])}));
  for(const account of accounts){
    const errors=[];
    if(!account.name)errors.push('الاسم مطلوب');
    if(!/^\d{10}$/.test(account.civil))errors.push('السجل المدني يجب أن يتكون من 10 أرقام');
    if(!['مشرف','مدير النظام'].includes(account.role))errors.push('الصلاحية يجب أن تكون مشرف أو مدير النظام');
    if(account.civil&&accounts.filter(item=>item.civil===account.civil).length>1)errors.push('السجل المدني مكرر');
    account.error=errors.length?'ورقة المشرفين، الصف '+account.row+': '+errors.join('؛ '):'';
  }
  return accounts;
}
function monitoringAccount_(civil){
  const matches=monitoringAccounts_().filter(item=>item.civil===civil);
  if(!matches.length)throw Error('لا يوجد حساب متابعة مسجل بهذه البيانات');
  if(matches.length>1)throw Error('السجل المدني مكرر في ورقة المشرفين؛ راجع الصفوف '+matches.map(item=>item.row).join('، '));
  if(matches[0].error)throw Error(matches[0].error);
  return matches[0];
}
function monitoringSessionKey_(token){return 'monitor_'+hash_(String(token||''));}
function loginSupervisor(civil){
  civil=monitoringCivil_(civil);
  if(!/^\d{10}$/.test(civil))throw Error('أدخل سجلاً مدنياً صحيحاً من 10 أرقام');
  const account=monitoringAccount_(civil);
  const token=Utilities.getUuid()+Utilities.getUuid();
  const result=monitoringData_(account);
  CacheService.getScriptCache().put(monitoringSessionKey_(token),civil,21600);
  return {token,data:result};
}
function getMonitoring(token){
  const civil=CacheService.getScriptCache().get(monitoringSessionKey_(token));
  if(!civil)throw Error('انتهت جلسة المتابعة؛ سجل الدخول مجدداً');
  const account=monitoringAccount_(civil);
  return monitoringData_(account);
}
function logoutSupervisor(token){CacheService.getScriptCache().remove(monitoringSessionKey_(token));return true;}
function monitoringData_(account){
  const isManager=account.role==='مدير النظام';
  const table=monitoringRows_(SHEETS.schools,['معرف السجل','اسم المدرسة','اسم مدير المدرسة','المحافظة','جوال مدير المدرسة']),c=table.columns;
  const civilColumn=table.headers.filter(header=>header==='السجل المدني').length===1?table.headers.indexOf('السجل المدني'):-1;
  const supervisorColumn=table.headers.filter(header=>header==='المشرف').length===1?table.headers.indexOf('المشرف'):-1;
  // A manager can always see all schools. Supervisors must have a valid assignment column.
  if(!isManager&&civilColumn<0)throw Error('يلزم وجود عمود واحد باسم السجل المدني في ورقة المدارس لتحديد المدارس المسندة للمشرف');
  const allAccounts=monitoringAccounts_(),accounts=allAccounts.filter(item=>!item.error),byCivil=new Map(accounts.map(item=>[item.civil,item]));
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
    result.supervisors=accounts.map(owner=>({key:owner.key,name:owner.name,role:owner.role,...summarize(schools.filter(item=>item.supervisorKey===owner.key))}));
    result.unassigned=summarize(schools.filter(item=>item.supervisorKey==='unassigned'));
  }
  return result;
}
