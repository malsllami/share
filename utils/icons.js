// أيقونات SVG بسيطة موحَّدة الطابع (خطوط نحيفة، بلا تعبئة) بدل رموز الإيموجي — تحافظ على مظهر
// احترافي ثابت تماماً عبر كل الأجهزة والمتصفحات (شكل الإيموجي يختلف حسب نظام التشغيل والخط المُثبَّت).

function icon(paths) {
  return '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
}

export const ICONS = {
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  member: icon('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>'),
  building: icon('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01"/>'),
  people: icon('<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/><circle cx="17.3" cy="9" r="2.6"/><path d="M15.3 13.3c2.9.5 5 3 5 6.2"/>'),
  chart: icon('<path d="M4 19V10M10 19V5M16 19v-7M3 19h18"/>'),
  home: icon('<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 001 1h10a1 1 0 001-1v-9"/>'),
  more: icon('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
  gear: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 000-3l2-1.5-2-3.4-2.3.9a7.5 7.5 0 00-2.6-1.5L14 2h-4l-.5 2.5A7.5 7.5 0 006.9 6l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 000 3l-2 1.5 2 3.4L6.9 18a7.5 7.5 0 002.6 1.5L10 22h4l.5-2.5A7.5 7.5 0 0017.1 18l2.3.9 2-3.4z"/>'),
  archive: icon('<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M10 12h4"/>'),
  wallet: icon('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M15.5 14h2.5"/>'),
};
