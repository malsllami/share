// تنقّل سفلي ثابت — جوال فقط (يظهر/يختفي عبر CSS)، لطابع "تطبيق جوال" حقيقي بلوحة المدير.
// 4 عناصر ثابتة: 3 أهم تبويبات مباشرة + "المزيد" يفتح نافذة منبثقة بباقي التبويبات (الأعضاء/الإعدادات/الأرشيف).
import { openModal, closeModal } from './Modal.js';
import { ICONS } from '../utils/icons.js';

const PRIMARY_ITEMS = [
  { id: 'overview', icon: ICONS.chart, label: 'نظرة عامة' },
  { id: 'my-associations', icon: ICONS.home, label: 'جمعياتي' },
  { id: 'associations', icon: ICONS.building, label: 'الجمعيات' },
];
const MORE_ITEMS = [
  { id: 'members', icon: ICONS.people, label: 'الأعضاء' },
  { id: 'settings', icon: ICONS.gear, label: 'الإعدادات' },
  { id: 'archive', icon: ICONS.archive, label: 'الأرشيف' },
];

export function renderBottomNavHtml() {
  return (
    '<nav class="bottom-nav" id="bottom-nav">' +
      PRIMARY_ITEMS.map(it =>
        '<button class="bottom-nav-item" data-tab="' + it.id + '"><span class="bn-icon">' + it.icon + '</span><span class="bn-label">' + it.label + '</span></button>'
      ).join('') +
      '<button class="bottom-nav-item" data-tab="more"><span class="bn-icon">' + ICONS.more + '</span><span class="bn-label">المزيد</span></button>' +
    '</nav>'
  );
}

// activate: نفس دالة تبديل التبويب الموجودة أصلاً بلوحة المدير — نستدعيها بنفسها فتُحدَّث كل الحالات
// (الشريط العلوي، المحتوى) تلقائياً بلا ازدواج منطق
export function wireBottomNav(root, activate) {
  const nav = root.querySelector('#bottom-nav');
  if (!nav) return;
  nav.querySelectorAll('.bottom-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      if (tabId === 'more') openMoreSheet(activate);
      else activate(tabId);
    });
  });
}

// يُستدعى من داخل activate() نفسها لتحديث تظليل العنصر النشط بالشريط السفلي مع كل تبديل تبويب
export function updateBottomNavActive(root, activeTabId) {
  const nav = root.querySelector('#bottom-nav');
  if (!nav) return;
  const isPrimary = PRIMARY_ITEMS.some(it => it.id === activeTabId);
  nav.querySelectorAll('.bottom-nav-item').forEach(btn => {
    const tabId = btn.dataset.tab;
    btn.classList.toggle('active', tabId === activeTabId || (tabId === 'more' && !isPrimary));
  });
}

function openMoreSheet(activate) {
  openModal({
    title: 'المزيد',
    bodyHtml: '<div class="more-sheet">' +
      MORE_ITEMS.map(it => '<button class="more-sheet-item" data-tab="' + it.id + '"><span class="bn-icon">' + it.icon + '</span>' + it.label + '</button>').join('') +
    '</div>',
    onMount: (modal) => {
      modal.querySelectorAll('.more-sheet-item').forEach(btn => {
        btn.addEventListener('click', () => {
          closeModal();
          activate(btn.dataset.tab);
        });
      });
    },
  });
}
