/* Public endpoint only. Never put credentials or spreadsheet IDs in this file. */
(function () {
  'use strict';
  const endpoint = 'https://script.google.com/macros/s/AKfycby1bK4Asg4nfcMjDMMWKU8mPkg26KLACdNwf5C-yKTg2YvvPMDXSNNn4yNhYTAdiId_AA/exec';
  window.schoolBackend = {
    endpoint,
    async call(action, args) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          // A simple CORS request: Apps Script does not handle OPTIONS preflights.
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ action, args }),
          credentials: 'omit',
          redirect: 'follow',
          referrerPolicy: 'no-referrer',
          signal: controller.signal
        });
        if (!response.ok) throw new Error('تعذر الاتصال بالنظام؛ حاول مجدداً.');
        const text = await response.text();
        let payload;
        try { payload = JSON.parse(text); }
        catch (_) { throw new Error('تعذر قراءة استجابة النظام؛ تحقق من إعدادات نشر Google Apps Script.'); }
        if (!payload || typeof payload.ok !== 'boolean') throw new Error('استجابة النظام غير صالحة.');
        if (!payload.ok) throw new Error(payload.error || 'تعذر تنفيذ الطلب');
        return payload.result;
      } catch (error) {
        if (error.name === 'AbortError') {
          throw new Error('انتهت مهلة الاتصال. قد تكون العملية نُفذت؛ افتح السجل مجدداً للتحقق قبل إعادة الحفظ.');
        }
        if (error instanceof TypeError) throw new Error('تعذر الاتصال بخادم Google؛ تحقق من اتصال الإنترنت ثم افتح السجل مجدداً للتحقق من آخر حفظ.');
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}());
