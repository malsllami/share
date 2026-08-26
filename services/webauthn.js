// أغلفة WebAuthn — تحويلات Base64URL↔ArrayBuffer + حفلا التسجيل والدخول عبر navigator.credentials
function base64UrlToBuffer(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const base64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

function bufferToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function stringToBuffer(str) {
  return new TextEncoder().encode(str).buffer;
}

export function isWebAuthnSupported() {
  return !!window.PublicKeyCredential;
}

// ينشئ بيانات اعتماد جديدة، مع تراجع تلقائي إلى residentKey:'preferred' إن رفض المتصفح/النظام
// 'required' صراحة (حالة نادرة اليوم) — يضمن نجاح تسجيل الجهاز الأول دائماً مهما كان الجهاز
async function createCredential_(publicKey) {
  try {
    return await navigator.credentials.create({ publicKey });
  } catch (err) {
    if (publicKey.authenticatorSelection.residentKey === 'required') {
      publicKey.authenticatorSelection.residentKey = 'preferred';
      return await navigator.credentials.create({ publicKey });
    }
    throw err;
  }
}

export async function registerDeviceCredential({ challenge, memberId, memberName, rpId, rpName }) {
  if (!isWebAuthnSupported()) throw new Error('هذا المتصفح أو الجهاز لا يدعم تسجيل الدخول بالبصمة');
  const publicKey = {
    challenge: base64UrlToBuffer(challenge),
    rp: { id: rpId, name: rpName },
    user: { id: stringToBuffer(memberId), name: memberName, displayName: memberName },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    // residentKey:'required' يضمن مفتاحاً قابلاً للاكتشاف (Discoverable) — ضروري لتفعيل "الدخول
    // المباشر بلا رقم جوال" لاحقاً عبر loginWithDiscoverableCredential أدناه
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'required' },
    attestation: 'none',
    timeout: 60000,
  };
  const cred = await createCredential_(publicKey);
  if (!cred) throw new Error('تم إلغاء عملية ربط البصمة');
  return {
    clientDataJSON: bufferToBase64Url(cred.response.clientDataJSON),
    attestationObject: bufferToBase64Url(cred.response.attestationObject),
  };
}

// دخول مباشر بلا رقم جوال: بلا allowCredentials إطلاقاً — هذا هو المفتاح الذي يسمح للمتصفح بعرض
// أي بيانات اعتماد قابلة للاكتشاف محفوظة مسبقاً لهذا rpId والسماح للمستخدم باختيارها مباشرة
export async function loginWithDiscoverableCredential({ challenge, rpId }) {
  if (!isWebAuthnSupported()) throw new Error('هذا المتصفح أو الجهاز لا يدعم الدخول بالبصمة');
  const publicKey = {
    challenge: base64UrlToBuffer(challenge),
    rpId,
    userVerification: 'required',
    timeout: 60000,
  };
  const assertion = await navigator.credentials.get({ publicKey });
  if (!assertion) throw new Error('تم إلغاء عملية الدخول بالبصمة');
  return {
    credentialId: bufferToBase64Url(assertion.rawId),
    clientDataJSON: bufferToBase64Url(assertion.response.clientDataJSON),
    authenticatorData: bufferToBase64Url(assertion.response.authenticatorData),
    signature: bufferToBase64Url(assertion.response.signature),
  };
}

// تصنيف موحَّد لأخطاء البصمة — يحل محل نسخ مكرَّرة من نفس المنطق كانت متفرقة بين صفحتي الدخول
// ولوحة العضو. context: 'register' (ربط جهاز جديد) أو 'login' (دخول بجهاز موجود)
export function describeWebAuthnError(err, context) {
  if (err && err.name === 'NotAllowedError') {
    return context === 'login'
      ? 'لم يتم العثور على بصمة مسجَّلة لهذا الجهاز على سهم، أو تم إلغاء العملية'
      : 'لم تكتمل عملية البصمة — تم الإلغاء أو انتهت المهلة، حاول مرة أخرى';
  }
  return (err && err.message) || 'تعذّر إتمام عملية البصمة';
}
