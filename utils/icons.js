// أيقونات SVG بسيطة موحَّدة الطابع (خطوط نحيفة، بلا تعبئة) بدل رموز الإيموجي — تحافظ على مظهر
// احترافي ثابت تماماً عبر كل الأجهزة والمتصفحات (شكل الإيموجي يختلف حسب نظام التشغيل والخط المُثبَّت).

// width/height صريحان (وليس CSS فقط) — يمنع اختفاء الأيقونات على Safari/iOS تحديداً: بعض إصدارات
// Safari لا تُطبِّق حجم SVG داخل حاويات دائرية (border-radius:50%) إلا إذا وُجد سمة width/height
// حقيقية بالعنصر نفسه؛ بدونها يظهر الإطار الدائري فارغاً بلا أيقونة رغم ظهورها طبيعياً على كروم.
// أي قاعدة CSS لاحقة (.icon-svg { width:... }) تبقى تتحكّم بالحجم الفعلي كالمعتاد (الأولوية لها دائماً).
function icon(paths) {
  return '<svg class="icon-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
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
  bell: icon('<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  target: icon('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>'),
  calendar: icon('<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>'),
  pencil: icon('<path d="M4 20l.9-4.2L16.6 4.1a1.5 1.5 0 0 1 2.1 0l1.2 1.2a1.5 1.5 0 0 1 0 2.1L8.2 19.1 4 20Z"/>'),
  donut: icon('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.8"/><path d="M12 3.5A8.5 8.5 0 0 1 20.5 12" stroke-width="3"/>'),
  device: icon('<rect x="7" y="3" width="10" height="18" rx="2.2"/><path d="M11 18h2"/>'),
  peopleCheck: icon('<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/><path d="M15.5 12.5l2 2 3.5-4"/>'),
  handoff: icon('<path d="M3 12h11M11 7l4 5-4 5"/><path d="M21 7v10"/>'),

  // ── أيقونات الدخول بالبصمة — تُختار حسب نوع الجهاز (انظر guessBiometricKind في pages/Login.js) ──
  // رسم بصمة إصبع واقعي (خطوط الحلقات المتداخلة) بدل الشكل المشوَّه السابق
  fingerprint: icon(
    '<path d="M18.9 7a8 8 0 0 1 1.1 5v1a6 6 0 0 0 .8 3"/>' +
    '<path d="M8 11a4 4 0 1 1 8 0v1a10 10 0 0 0 2 6"/>' +
    '<path d="M12 11v2a14 14 0 0 0 2.5 8"/>' +
    '<path d="M8 15a18 18 0 0 0 1.8 6"/>' +
    '<path d="M4.9 19a22 22 0 0 1 -.9 -7v-1a8 8 0 0 1 12 -6.95"/>'
  ),
  // Touch ID لأجهزة ماك/آيباد بدون Face ID — نفس رسم البصمة (لا فرق بصري معياري بين النوعين)
  touchId: icon(
    '<path d="M18.9 7a8 8 0 0 1 1.1 5v1a6 6 0 0 0 .8 3"/>' +
    '<path d="M8 11a4 4 0 1 1 8 0v1a10 10 0 0 0 2 6"/>' +
    '<path d="M12 11v2a14 14 0 0 0 2.5 8"/>' +
    '<path d="M8 15a18 18 0 0 0 1.8 6"/>' +
    '<path d="M4.9 19a22 22 0 0 1 -.9 -7v-1a8 8 0 0 1 12 -6.95"/>'
  ),
  // إطار مسح للوجه (زوايا الكاميرا) + عينان وابتسامة — نفس أسلوب أيقونة Face ID المعروفة
  faceId: icon(
    '<path d="M4 8v-2a2 2 0 0 1 2 -2h2"/>' +
    '<path d="M4 16v2a2 2 0 0 0 2 2h2"/>' +
    '<path d="M16 4h2a2 2 0 0 1 2 2v2"/>' +
    '<path d="M16 20h2a2 2 0 0 0 2 -2v-2"/>' +
    '<path d="M9 10v.01"/><path d="M15 10v.01"/>' +
    '<path d="M10 15a3.5 3.5 0 0 0 4 0"/>'
  ),
  // شبكة مربعات (شعار ويندوز) — واضحة ومباشرة لتمييز Windows Hello عن بقية الأيقونات
  windowsHello: icon(
    '<rect x="3" y="3" width="8" height="8" rx="1"/>' +
    '<rect x="13" y="3" width="8" height="8" rx="1"/>' +
    '<rect x="3" y="13" width="8" height="8" rx="1"/>' +
    '<rect x="13" y="13" width="8" height="8" rx="1"/>'
  ),
};
