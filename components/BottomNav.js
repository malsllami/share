// تنقّل سفلي ثابت — يظهر لكل الشاشات (جوال وشاشة عريضة)، لطابع "تطبيق جوال" حقيقي بلوحتي المدير والعضو.
// عام/قابل لإعادة الاستخدام: يستقبل قائمتي عناصر (مباشرة + "المزيد") بدل تثبيتهما هنا، حتى تملك كل
// لوحة (مدير/عضو) شريطها الخاص بلا ازدواج منطق — البنية والتفاعل نفسه، فقط البيانات تختلف.
import { openModal, closeModal } from './Modal.js';
import { ICONS } from '../utils/icons.js';

// لوحة المدير — 4 أزرار مباشرة (الرئيسية/الجمعيات/المعاملات/التقارير) + "المزيد" لباقي التبويبات
// (تحديد محمد الصريح — كانت "التقارير" داخل "المزيد" سابقاً)
export const ADMIN_PRIMARY_ITEMS = [
  { id: 'overview', icon: ICONS.chart, label: 'الرئيسية' },
  { id: 'associations', icon: ICONS.building, label: 'الجمعيات' },
  { id: 'transactions', icon: ICONS.handoff, label: 'المعاملات' },
  { id: 'reports', icon: ICONS.donut, label: 'التقارير' },
];
export const ADMIN_MORE_ITEMS = [
  { id: 'my-associations', icon: ICONS.home, label: 'جمعياتي' },
  { id: 'members', icon: ICONS.people, label: 'الأعضاء' },
  { id: 'settings', icon: ICONS.gear, label: 'الإعدادات' },
  { id: 'archive', icon: ICONS.archive, label: 'الأرشيف' },
];

// لوحة العضو — لا شريط سفلي إطلاقاً قبل هذا التعديل؛ 3 أزرار مباشرة (الرئيسية/الفئات/الملف) +
// "المزيد" (الرؤى — نفس محتوى الرئيسية بمسمى منفصل، بقرار محمد الصريح)
export const MEMBER_PRIMARY_ITEMS = [
  { id: 'home', icon: ICONS.chart, label: 'الرئيسية' },
  { id: 'categories', icon: ICONS.building, label: 'الفئات' },
  { id: 'profile', icon: ICONS.people, label: 'الملف' },
];
export const MEMBER_MORE_ITEMS = [
  { id: 'insights', icon: ICONS.donut, label: 'الرؤى' },
];

export function renderBottomNavHtml(primaryItems, moreItems) {
  return (
    '<nav class="bottom-nav" id="bottom-nav">' +
      primaryItems.map(it =>
        '<button class="bottom-nav-item" data-tab="' + it.id + '"><span class="bn-icon">' + it.icon + '</span><span class="bn-label">' + it.label + '</span></button>'
      ).join('') +
      (moreItems.length ? '<button class="bottom-nav-item" data-tab="more"><span class="bn-icon">' + ICONS.more + '</span><span class="bn-label">المزيد</span></button>' : '') +
    '</nav>'
  );
}

// activate: دالة تبديل التبويب الموجودة أصلاً بكل لوحة — نستدعيها بنفسها فتُحدَّث كل الحالات
// (الشريط العلوي، المحتوى) تلقائياً بلا ازدواج منطق
export function wireBottomNav(root, activate, moreItems) {
  const nav = root.querySelector('#bottom-nav');
  if (!nav) return;
  nav.querySelectorAll('.bottom-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      if (tabId === 'more') openMoreSheet(activate, moreItems);
      else activate(tabId);
    });
  });
}

// يُستدعى من داخل activate() نفسها لتحديث تظليل العنصر النشط بالشريط السفلي مع كل تبديل تبويب
export function updateBottomNavActive(root, activeTabId, primaryItems) {
  const nav = root.querySelector('#bottom-nav');
  if (!nav) return;
  const isPrimary = primaryItems.some(it => it.id === activeTabId);
  nav.querySelectorAll('.bottom-nav-item').forEach(btn => {
    const tabId = btn.dataset.tab;
    btn.classList.toggle('active', tabId === activeTabId || (tabId === 'more' && !isPrimary));
  });
}

function openMoreSheet(activate, moreItems) {
  openModal({
    title: 'المزيد',
    bodyHtml: '<div class="more-sheet">' +
      moreItems.map(it => '<button class="more-sheet-item" data-tab="' + it.id + '"><span class="bn-icon">' + it.icon + '</span>' + it.label + '</button>').join('') +
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
