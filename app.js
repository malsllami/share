// نقطة انطلاق الواجهة — يقرر عرض شاشة الدخول أو لوحة العضو/المدير بحسب الجلسة الحالية
import { getSession, clearSession } from './services/auth.js';
import { renderLoginPage } from './pages/Login.js';
import { renderMemberDashboard } from './pages/MemberDashboard.js';
import { renderAdminDashboard } from './pages/AdminDashboard.js';

const root = document.getElementById('app');

function boot() {
  const session = getSession();
  if (!session) {
    renderLoginPage(root, { onLoginSuccess: boot });
    return;
  }
  const onLogout = () => { clearSession(); boot(); };
  if (session.isAdmin) renderAdminDashboard(root, { session, onLogout });
  else renderMemberDashboard(root, { session, onLogout });
}

boot();

// تسجيل عامل الخدمة (PWA) — يخزّن هيكل التطبيق للتحميل الفوري لاحقاً؛ لا يؤثر على البيانات الحيّة
// (انظر sw.js) ولا يُوقِف عمل الموقع أبداً حتى لو فشل التسجيل (متصفحات قديمة، أو أول تحميل بلا اتصال)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
