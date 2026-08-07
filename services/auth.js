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
