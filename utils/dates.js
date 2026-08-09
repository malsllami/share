// تحويل ميلادي↔هجري لطبقة العرض فقط — خوارزمية الكويتي التقويمية الجدولية القياسية (Tabular Islamic Calendar)
// لا تُخزَّن أي قيمة هجرية في قاعدة البيانات؛ كل تاريخ في الجداول ميلادي، ويُحوَّل هنا فقط عند العرض.
// ملاحظة: تقويم جدولي حسابي (وليس رصد هلال أم القرى الرسمي) — قد يختلف يوماً واحداً عن الإعلان الرسمي.

const HIJRI_MONTHS = ['محرم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
const GREGORIAN_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function gregorianToJulian(y, m, d) {
  return (
    Math.floor((1461 * (y + 4800 + Math.floor((m - 14) / 12))) / 4) +
    Math.floor((367 * (m - 2 - 12 * Math.floor((m - 14) / 12))) / 12) -
    Math.floor((3 * Math.floor((y + 4900 + Math.floor((m - 14) / 12)) / 100)) / 4) +
    d - 32075
  );
}

function julianToHijri(jd) {
  let l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
            Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
          Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * l) / 709);
  const day = l - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { year, month, day };
}

export function toHijri(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d)) return null;
  const jd = gregorianToJulian(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return julianToHijri(jd);
}

// يُعيد كائناً بالنصين المنفصلين والنص المدمج — للاستخدام في أي مكان يُعرض فيه تاريخ بالواجهة
export function formatDualDate(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d)) return { gregorian: '', hijri: '', combined: '' };
  const h = toHijri(d);
  const gregorian = d.getDate() + ' ' + GREGORIAN_MONTHS[d.getMonth()] + ' ' + d.getFullYear() + 'م';
  const hijri = h.day + ' ' + HIJRI_MONTHS[h.month - 1] + ' ' + h.year + 'هـ';
  return { gregorian, hijri, combined: gregorian + ' — ' + hijri };
}

export function renderDualDateHtml(dateInput) {
  const { gregorian, hijri } = formatDualDate(dateInput);
  if (!gregorian) return '';
  return '<span class="dual-date"><span class="g">' + gregorian + '</span> · <span class="h">' + hijri + '</span></span>';
}

// نسبة انقضاء مدة الجمعية زمنياً (بالأيام والأشهر) بين تاريخ البداية والنهاية — للعرض فقط، لا تُخزَّن
// ولا علاقة لها بحالة الجمعية الفعلية (جديدة/نشطة/منتهية) المبنية على التحصيل والتسليم الحقيقيين
export function computeDurationProgress(startDate, endDate, durationMonths) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dur = Number(durationMonths) || 0;
  if (isNaN(start) || isNaN(end)) {
    return { percent: 0, elapsedDays: 0, remainingDays: 0, totalDays: 0, elapsedMonths: 0, remainingMonths: dur, durationMonths: dur };
  }

  const totalDays = Math.max(1, Math.round((end - start) / 86400000));
  const elapsedDays = Math.min(totalDays, Math.max(0, Math.round((new Date() - start) / 86400000)));
  const remainingDays = Math.max(0, totalDays - elapsedDays);
  const percent = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));

  const now = new Date();
  let elapsedMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) elapsedMonths -= 1;
  elapsedMonths = Math.min(dur, Math.max(0, elapsedMonths));
  const remainingMonths = Math.max(0, dur - elapsedMonths);

  return { percent, elapsedDays, remainingDays, totalDays, elapsedMonths, remainingMonths, durationMonths: dur };
}

// حالة/نسبة تقدّم شهر واحد بعينه بالتقويم — ماضٍ (100٪) / جارٍ حالياً (نسبة أيامه المنقضية) / قادم (0٪)
// يُستخدَم فقط لعرض موقع الشهر زمنياً في بطاقته، ولا علاقة له بحالة إغلاقه الفعلية (تحصيل/تسليم)
export function computeMonthProgress(monthDate) {
  const start = new Date(monthDate);
  if (isNaN(start)) return { percent: 0, state: 'future' };
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  const now = new Date();
  if (now < start) return { percent: 0, state: 'future' };
  if (now >= end) return { percent: 100, state: 'past' };
  const totalDays = Math.max(1, Math.round((end - start) / 86400000));
  const elapsedDays = Math.max(0, Math.round((now - start) / 86400000));
  return { percent: Math.min(100, Math.round((elapsedDays / totalDays) * 100)), state: 'current' };
}

// شريط تقدّم HTML عام قابل لإعادة الاستخدام في أي بطاقة — colorClass: success|warning|danger|'' (افتراضي تدرّج ذهبي)
export function renderProgressBarHtml(percent, colorClass) {
  const p = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));
  return '<div class="progress-bar"><div class="progress-bar-fill' + (colorClass ? ' ' + colorClass : '') + '" style="width:' + p + '%"></div></div>';
}

// عدد الأيام من الآن إلى تاريخ مُعطى (سالب إن كان التاريخ ماضياً) — للعدّ التنازلي لشهر الاستلام
export function daysUntil(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d)) return null;
  return Math.ceil((d - new Date()) / 86400000);
}
