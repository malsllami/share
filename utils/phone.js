// توحيد صيغة الجوال إلى +966XXXXXXXXX — يقبل 05xxxxxxxx / 5xxxxxxxx / 9665xxxxxxxx / +9665xxxxxxxx
import { normalizeDigits } from './numbers.js';

export function normalizePhone(input) {
  if (!input) return null;
  let digits = normalizeDigits(input).replace(/[^\d]/g, '');
  if (digits.startsWith('00966')) digits = digits.slice(5);
  else if (digits.startsWith('966')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^5\d{8}$/.test(digits)) return null;
  return '+966' + digits;
}

export function formatPhoneDisplay(e164) {
  if (!e164 || !e164.startsWith('+966')) return e164 || '';
  const d = e164.slice(4);
  return '+966 ' + d.slice(0, 2) + ' ' + d.slice(2, 5) + ' ' + d.slice(5);
}
