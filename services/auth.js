// إدارة جلسة الدخول الحالية — تُحفظ في sessionStorage (تنتهي بإغلاق التبويب، تحمي من بقاء الجلسة على جهاز مشترك)
const SESSION_KEY = 'sahm_session';

export function saveSession({ memberId, memberName, isAdmin, identityToken }) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ memberId, memberName, isAdmin: !!isAdmin, identityToken }));
}

// تذكرة الهوية الموقّعة من الخادم — تُرسَل مع أي إجراء إداري (انظر gas/Identity.gs) بدل الاعتماد
// على isAdmin وحده (الذي لا يعدو كونه تزييناً للواجهة، لا يثبت شيئاً للخادم بمفرده)
export function getIdentityToken() {
  const s = getSession();
  return s ? s.identityToken : null;
}

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function isLoggedIn() {
  return !!getSession();
}

export function isAdmin() {
  const s = getSession();
  return !!(s && s.isAdmin);
}

// يتذكر رقم جوال آخر عضو دخل من هذا الجهاز لتسهيل الدخول اللاحق (localStorage يبقى بعد إغلاق المتصفح)
export function rememberPhone(phone) {
  localStorage.setItem('sahm_last_phone', phone);
}
export function getRememberedPhone() {
  return localStorage.getItem('sahm_last_phone') || '';
}

// علم محلي: هل رَبَط هذا الجهاز (المتصفح) بصمة WebAuthn من قبل؟ بعد إعادة البناء أصبح **تلميح
// عرض تجميلي بحت** (أيّ قسم يظهر أعلى/أبرز في شاشة الدخول: البصمة أو الجوال) — لا يمنع ظهور أي
// خيار بعد الآن. القرار الفعلي الوحيد يبقى دائماً عند الخادم عبر التحقق التشفيري الحقيقي لحظة
// الدخول (زر البصمة يظهر دائماً طالما المتصفح يدعمها، بصرف النظر عن قيمة هذا العلم).
// Local-only display hint: has this device ever linked a WebAuthn credential? After the rebuild
// this is purely cosmetic (which section renders first/larger) — it never gates which option
// appears. The server remains the sole source of truth via real crypto verification at login time.
export function markDeviceBiometricLinked() {
  localStorage.setItem('sahm_device_biometric', '1');
}
export function deviceHasBiometricLinked() {
  return localStorage.getItem('sahm_device_biometric') === '1';
}
// يمسح العلم — لم يعد يُستدعى تلقائياً من أي مكان في الواجهة بعد إعادة البناء (فشل بصمة، معروف
// أو غير معروف، لم يعد يُخفي أي قسم أو يجبر مساراً آخر). تبقى الدالة مصدَّرة لاستخدام يدوي مستقبلي
// فقط إن احتاج الأمر (مثلاً زر "نسيت الجهاز" صريح من الواجهة لاحقاً).
export function clearDeviceBiometricLink() {
  localStorage.removeItem('sahm_device_biometric');
}
