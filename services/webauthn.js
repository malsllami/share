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

export async function registerDeviceCredential({ challenge, memberId, memberName, rpId, rpName }) {
  if (!isWebAuthnSupported()) throw new Error('هذا المتصفح أو الجهاز لا يدعم تسجيل الدخول بالبصمة');
  const publicKey = {
    challenge: base64UrlToBuffer(challenge),
    rp: { id: rpId, name: rpName },
    user: { id: stringToBuffer(memberId), name: memberName, displayName: memberName },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
    attestation: 'none',
    timeout: 60000,
  };
  const cred = await navigator.credentials.create({ publicKey });
  if (!cred) throw new Error('تم إلغاء عملية ربط البصمة');
  return {
    clientDataJSON: bufferToBase64Url(cred.response.clientDataJSON),
    attestationObject: bufferToBase64Url(cred.response.attestationObject),
  };
}

export async function loginWithDeviceCredential({ challenge, credentialIds, rpId }) {
  if (!isWebAuthnSupported()) throw new Error('هذا المتصفح أو الجهاز لا يدعم الدخول بالبصمة');
  const publicKey = {
    challenge: base64UrlToBuffer(challenge),
    rpId,
    allowCredentials: credentialIds.map(id => ({ type: 'public-key', id: base64UrlToBuffer(id) })),
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
