// توحيد إدخال الجوال: +966 ثابت دائماً في الواجهة، والمستخدم يُدخل 9 أرقام فقط تبدأ بـ5 (بلا صفر وبلا مفتاح الدولة)
import { normalizeDigits } from './numbers.js';

// يبني رقم الجوال الكامل (+966XXXXXXXXX) من الجزء المحلي فقط — يجب أن يبدأ بـ5 ويتكوّن من 9 أرقام بالضبط
export function buildFullPhone(localPart) {
  if (!localPart) return null;
  const digits = normalizeDigits(localPart).replace(/[^\d]/g, '');
  if (!/^5\d{8}$/.test(digits)) return null;
  return '+966' + digits;
}

// يستخرج الجزء المحلي (9 أرقام) من رقم كامل +966XXXXXXXXX — لتعبئة حقل التعديل مثلاً
export function extractLocalPart(fullPhone) {
  if (!fullPhone || !fullPhone.startsWith('+966')) return '';
  return fullPhone.slice(4);
}

// String(...) دفاعي: بعض بيانات الأعضاء القديمة قد تصل كرقم (Number) لا نص رغم الإصلاح الرجعي
// (fixMemberPhoneFormats) — بدونه ينكسر .startsWith فوراً على أي قيمة غير نصية
export function formatPhoneDisplay(e164) {
  const s = String(e164 || '');
  if (!s.startsWith('+966')) return s;
  const d = s.slice(4);
  return '+966 ' + d.slice(0, 2) + ' ' + d.slice(2, 5) + ' ' + d.slice(5);
}

// يقيّد حقل إدخال أثناء الكتابة: أرقام إنجليزية فقط (يحوّل العربية تلقائياً)، حتى 9 خانات كحد أقصى
export function bindPhoneLocalInput(inputEl) {
  inputEl.addEventListener('input', () => {
    let digits = normalizeDigits(inputEl.value).replace(/[^\d]/g, '');
    if (digits.length > 9) digits = digits.slice(0, 9);
    inputEl.value = digits;
  });
}

// يبني HTML لمجموعة إدخال الجوال: بادئة +966 ثابتة غير قابلة للتعديل + حقل الجزء المحلي فقط
export function renderPhoneInputGroup(inputId, prefillLocal) {
  return (
    '<div class="phone-input-group">' +
      '<span class="phone-prefix">+966</span>' +
      '<input id="' + inputId + '" class="phone-local-input" type="text" inputmode="numeric" maxlength="9" placeholder="5xxxxxxxx" value="' + (prefillLocal || '') + '" />' +
    '</div>'
  );
}
