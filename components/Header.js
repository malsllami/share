// رأس التطبيق المشترك — العلامة، اسم المستخدم، شارة المدير، زر الخروج
export function renderAppHeader({ memberName, isAdmin, onLogout }) {
  return (
    '<header class="app-header"><div class="app-header-inner">' +
      '<div class="app-brand"><img class="mark" src="assets/logo.png" alt="سهم" /> سهم</div>' +
      '<div class="app-user">' +
        '<span class="name">' + memberName + (isAdmin ? ' <span class="badge badge-gold">مدير</span>' : '') + '</span>' +
        '<button class="icon-btn" id="logout-btn" title="تسجيل الخروج">⏻</button>' +
      '</div>' +
    '</div></header>'
  );
}

export function wireHeaderEvents(root, onLogout) {
  const btn = root.querySelector('#logout-btn');
  if (btn) btn.addEventListener('click', onLogout);
}
