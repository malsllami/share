// إدارة جلسة الدخول الحالية — تُحفظ في sessionStorage (تنتهي بإغلاق التبويب، تحمي من بقاء الجلسة على جهاز مشترك)
const SESSION_KEY = 'sahm_session';

export function saveSession({ memberId, memberName, isAdmin }) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ memberId, memberName, isAdmin: !!isAdmin }));
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

// علم محلي: هل رَبَط هذا الجهاز (المتصفح) بصمة WebAuthn من قبل؟ يُستخدم فقط لاختيار شاشة الدخول
// المناسبة محلياً (بصمة+جوال معاً، أو جوال فقط) — لا علاقة له بأي قرار أمني؛ الخادم يبقى مصدر
// الحقيقة الفعلي دائماً عبر التحقق التشفيري الحقيقي لحظة الدخول.
// Local-only flag: has this device ever linked a WebAuthn credential? Used purely to decide which
// login screen to render — the server remains the real source of truth via actual crypto verification.
export function markDeviceBiometricLinked() {
  localStorage.setItem('sahm_device_biometric', '1');
}
export function deviceHasBiometricLinked() {
  return localStorage.getItem('sahm_device_biometric') === '1';
}
// يمسح العلم — يُستدعى فقط عندما يرفض الخادم صراحة الجهاز بأنه "غير مرتبط" (مثلاً بعد أن حذف
// المدير جهازاً، أو حُذف صف الجهاز من قاعدة البيانات) — وليس عند مجرد NotAllowedError (قد يكون
// مجرد إلغاء المستخدم للعملية، لا يعني غياب البصمة فعلاً). هذا "يشفي" الجهاز تلقائياً من حالة
// عالقة (الزر يظهر لكنه لن يعمل أبداً) بإعادته لمسار "ربط بصمة جديد" في المحاولة التالية.
export function clearDeviceBiometricLink() {
  localStorage.removeItem('sahm_device_biometric');
}
