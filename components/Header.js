// رأس التطبيق المشترك — العلامة، جرس تنبيهات اختياري (عدده = عدد تنبيهات حقيقية محسوبة، وليس
// جدول إشعارات جديد — انظر buildAdminAlerts_/buildMemberAlerts_)، اسم المستخدم، شارة المدير، زر الخروج
import { ICONS } from '../utils/icons.js';

export function renderAppHeader({ memberName, isAdmin, bellCount }) {
  const showBell = typeof bellCount === 'number';
  return (
    '<header class="app-header"><div class="app-header-inner">' +
      '<div class="app-brand"><img class="mark" src="assets/logo.png" alt="سهم" /> سهم</div>' +
      '<div class="app-user">' +
        (showBell ? (
          '<button class="icon-btn bell-btn" id="header-bell-btn" title="التنبيهات">' + ICONS.bell +
            (bellCount > 0 ? '<span class="bell-badge">' + (bellCount > 9 ? '9+' : bellCount) + '</span>' : '') +
          '</button>'
        ) : '') +
        '<span class="name">' + memberName + (isAdmin ? ' <span class="badge badge-gold">مدير</span>' : '') + '</span>' +
        '<button class="icon-btn" id="logout-btn" title="تسجيل الخروج">⏻</button>' +
      '</div>' +
    '</div></header>'
  );
}

export function wireHeaderEvents(root, onLogout, onBellClick) {
  const btn = root.querySelector('#logout-btn');
  if (btn) btn.addEventListener('click', onLogout);
  const bellBtn = root.querySelector('#header-bell-btn');
  if (bellBtn && onBellClick) bellBtn.addEventListener('click', onBellClick);
}
