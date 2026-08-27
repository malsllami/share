// رأس التطبيق المشترك — العلامة، اسم المستخدم، شارة المدير، زر الخروج
// (جرس تنبيهات بالرأس أُزيل — كان يكرّر نفس عدد "تنبيهات هامة" الظاهرة أصلاً بنظرة عامة بلا أي
// فائدة إضافية فعلية، وسبَّب أيضاً عرض الأيقونة بحجم عملاق في بعض السياقات — قرار محمد الصريح)
export function renderAppHeader({ memberName, isAdmin }) {
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
