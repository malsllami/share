// تحقّقات إدخال مشتركة
export function isRequired(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

// عدد الأسهم: 0.5 على الأقل وبمضاعفات نصف سهم فقط
export function isValidSharesCount(value) {
  const n = Number(value);
  if (!n || n < 0.5) return false;
  return Math.round(n * 2) === n * 2;
}

export function isValidPositiveNumber(value) {
  const n = Number(value);
  return !isNaN(n) && n > 0;
}
