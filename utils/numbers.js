// تحويل وتنسيق الأرقام — كل إدخال رقمي يُحوَّل تلقائياً من عربي/فارسي إلى إنجليزي
const DIGIT_MAP = {
  '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
  '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9',
};

export function normalizeDigits(input) {
  if (input === null || input === undefined) return input;
  return String(input).replace(/[٠-٩۰-۹]/g, d => DIGIT_MAP[d]);
}

export function formatCurrency(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ريال';
}

export function formatNumber(n) {
  return (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// يربط حقل إدخال بتحويل تلقائي فوري للأرقام العربية أثناء الكتابة
export function bindDigitNormalization(inputEl) {
  inputEl.addEventListener('input', () => {
    const normalized = normalizeDigits(inputEl.value);
    if (normalized !== inputEl.value) {
      const pos = inputEl.selectionStart;
      inputEl.value = normalized;
      inputEl.setSelectionRange(pos, pos);
    }
  });
}
