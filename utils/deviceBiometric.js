// تخمين نوع الجهاز/المصادقة الحيوية — مشتركة بين صفحة الدخول (pages/Login.js) ولوحة العضو
// (pages/MemberDashboard.js، بطاقة "ربط بصمة الجهاز") حتى تتطابق الأيقونة/التسمية أينما ظهر خيار
// البصمة في الموقع، بلا ازدواجية كود.
// Device/biometric-kind guessing — shared between the login page and the member dashboard's
// "link device biometric" card so the icon/label match wherever a biometric option appears.
import { ICONS } from './icons.js';

export function guessDeviceName() {
  const ua = navigator.userAgent;
  let os = 'جهاز';
  if (/iphone/i.test(ua)) os = 'آيفون';
  else if (/ipad/i.test(ua)) os = 'آيباد';
  else if (/android/i.test(ua)) os = 'أندرويد';
  else if (/mac/i.test(ua)) os = 'ماك';
  else if (/windows/i.test(ua)) os = 'ويندوز';
  let browser = '';
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/chrome/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua)) browser = 'Safari';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  return browser ? os + ' · ' + browser : os;
}

// تخمين نوع المصادقة الحيوية الأرجح لهذا الجهاز — WebAuthn لا يكشف نوع المصادقة الفعلي (وجه/بصمة)
// قبل إتمامها لأسباب خصوصية، فهذا تخمين منطقي حسب نظام التشغيل فقط (نفس القيد المعياري في كل التطبيقات
// المشابهة)؛ يُستخدَم فقط لاختيار أيقونة/نص الزر الأقرب لواقع الجهاز، لا لأي قرار أمني فعلي
export function guessBiometricKind() {
  const ua = navigator.userAgent;
  // آيباد بواجهة سطح مكتب (iPadOS 13+) يُعرِّف نفسه كـ Macintosh — يُميَّز عبر دعم اللمس
  const isIPadOS13Plus = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  if (/iphone|ipod|ipad/i.test(ua) || isIPadOS13Plus) return 'faceid';
  if (/macintosh/i.test(ua)) return 'touchid';
  if (/android/i.test(ua)) return 'fingerprint';
  if (/windows/i.test(ua)) return 'windowsHello';
  return 'fingerprint';
}

export const BIOMETRIC_META = {
  faceid:       { icon: ICONS.faceId,       primary: 'الدخول بالوجه',            login: 'الدخول بالوجه',            link: 'ربط الوجه بهذا الجهاز' },
  touchid:      { icon: ICONS.touchId,      primary: 'الدخول بالبصمة',           login: 'الدخول ببصمة الجهاز',      link: 'ربط بصمة هذا الجهاز' },
  fingerprint:  { icon: ICONS.fingerprint,  primary: 'الدخول بالبصمة',           login: 'الدخول ببصمة الجهاز',      link: 'ربط بصمة هذا الجهاز' },
  windowsHello: { icon: ICONS.windowsHello, primary: 'الدخول عبر Windows Hello', login: 'الدخول عبر Windows Hello', link: 'ربط الجهاز عبر Windows Hello' },
};
