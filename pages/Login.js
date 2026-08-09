// صفحة الدخول — رقم الجوال ثم بصمة حقيقية للجهاز (WebAuthn). أول دخول لعضو مضاف من المدير يربط بصمة جهازه تلقائياً.
import { callApi } from '../services/api.js';
import { registerDeviceCredential, loginWithDeviceCredential, isWebAuthnSupported } from '../services/webauthn.js';
import { saveSession, rememberPhone, getRememberedPhone } from '../services/auth.js';
import { buildFullPhone, extractLocalPart, renderPhoneInputGroup, bindPhoneLocalInput } from '../utils/phone.js';
import { showToast } from '../components/Toast.js';
import { withButtonLoading } from '../components/Button.js';
import { RP_ID, RP_NAME } from '../config/config.js';

function guessDeviceName() {
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

export function renderLoginPage(root, { onLoginSuccess }) {
  root.innerHTML =
    '<div class="login-screen">' +
      '<div class="login-card">' +
        '<img class="login-mark" src="assets/logo.png" alt="سهم" />' +
        '<div class="login-title">سهم</div>' +
        '<div class="login-sub">إدارة الجمعيات المالية</div>' +
        '<div id="login-step-phone">' +
          '<div class="form-group">' +
            '<label class="form-label">رقم الجوال</label>' +
            renderPhoneInputGroup('login-phone', extractLocalPart(getRememberedPhone())) +
            '<div class="form-error hidden" id="login-phone-error"></div>' +
          '</div>' +
          '<button id="login-continue-btn" class="btn btn-gold btn-block">متابعة</button>' +
        '</div>' +
        '<div id="login-step-bio" class="hidden">' +
          '<div class="login-sub" id="login-bio-text" style="margin-bottom:18px"></div>' +
          '<button id="login-bio-btn" class="bio-btn"><span class="bio-ring"></span><span id="login-bio-btn-text">الدخول ببصمة الجهاز</span></button>' +
          '<p class="login-sub hidden" id="login-bio-status" style="margin-top:12px;display:flex;align-items:center;justify-content:center;gap:8px">' +
            '<span class="spinner" style="width:15px;height:15px;border-width:2px;margin:0"></span><span>جاري التحقق من هويتك — أكمل العملية في نافذة النظام...</span>' +
          '</p>' +
          '<button id="login-back-btn" class="login-back" type="button">تغيير رقم الجوال</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  const phoneInput = root.querySelector('#login-phone');
  bindPhoneLocalInput(phoneInput);

  const stepPhone = root.querySelector('#login-step-phone');
  const stepBio = root.querySelector('#login-step-bio');
  const bioText = root.querySelector('#login-bio-text');
  const bioBtn = root.querySelector('#login-bio-btn');
  const bioBtnText = root.querySelector('#login-bio-btn-text');
  const bioStatus = root.querySelector('#login-bio-status');
  const phoneError = root.querySelector('#login-phone-error');

  let currentPhone = null;
  let currentMode = 'login'; // 'login' | 'register'
  let currentMemberId = null;
  let currentMemberName = null;
  let currentChallenge = null;
  let currentCredentialIds = null;

  function showPhoneError(msg) {
    phoneError.textContent = msg;
    phoneError.classList.remove('hidden');
  }

  // يجلب الـchallenge مسبقاً هنا (وليس لحظة ضغط زر البصمة) — طلب شبكي داخل معالج الضغط
  // مباشرة قد يُفقد المتصفح "إذن التفاعل الحديث" اللازم لفتح واجهة WebAuthn فيرفضها بخطأ NotAllowedError.
  async function goToBioStep(phone) {
    phoneError.classList.add('hidden');
    let result;
    try {
      result = await callApi('beginDeviceLogin', { phone });
    } catch (err) {
      showPhoneError(err.message);
      return;
    }

    currentPhone = phone;
    if (result.needsRegistration) {
      currentMode = 'register';
      currentMemberId = result.memberId;
      currentMemberName = result.memberName;
      try {
        currentChallenge = (await callApi('beginDeviceRegistration', { phone })).challenge;
      } catch (err) {
        showPhoneError(err.message);
        return;
      }
      bioText.textContent = 'مرحباً ' + result.memberName + '، هذا أول دخول لك — اضغط للربط ببصمة هذا الجهاز';
      bioBtnText.textContent = 'ربط بصمة هذا الجهاز';
    } else {
      currentMode = 'login';
      currentMemberId = result.memberId;
      currentChallenge = result.challenge;
      currentCredentialIds = result.credentialIds;
      bioText.textContent = 'تحقق من هويتك للمتابعة';
      bioBtnText.textContent = 'الدخول ببصمة الجهاز';
    }
    stepPhone.classList.add('hidden');
    stepBio.classList.remove('hidden');
  }

  const continueBtn = root.querySelector('#login-continue-btn');
  continueBtn.addEventListener('click', withButtonLoading(continueBtn, async () => {
    const phone = buildFullPhone(phoneInput.value);
    if (!phone) { showPhoneError('رقم الجوال غير صالح — أدخل 9 أرقام تبدأ بـ5 بدون صفر أو مفتاح الدولة'); return; }
    if (!isWebAuthnSupported()) { showPhoneError('هذا المتصفح لا يدعم تسجيل الدخول بالبصمة'); return; }
    await goToBioStep(phone);
  }));

  root.querySelector('#login-back-btn').addEventListener('click', () => {
    stepBio.classList.add('hidden');
    stepPhone.classList.remove('hidden');
  });

  bioBtn.addEventListener('click', withButtonLoading(bioBtn, async () => {
    // زر البصمة نفسه يتحوّل لشريط تقدّم بلا نص (سلوك موحّد لكل أزرار الموقع)، لكن هذا وحده لا يوضّح
    // للمستخدم أنه يجب إكمال العملية في نافذة النظام (البصمة/التعرف على الوجه) التي قد تستغرق ثوانٍ —
    // فيظهر نص حالة صريح تحت الزر طوال هذه الفترة بدل أن يبدو الزر "فارغاً بلا استجابة"
    bioStatus.classList.remove('hidden');
    try {
      if (currentMode === 'register') {
        const reg = await registerDeviceCredential({
          challenge: currentChallenge,
          memberId: currentMemberId,
          memberName: currentMemberName,
          rpId: RP_ID, rpName: RP_NAME,
        });
        await callApi('completeDeviceRegistration', {
          memberId: currentMemberId,
          deviceName: guessDeviceName(),
          clientDataJSON: reg.clientDataJSON,
          attestationObject: reg.attestationObject,
        });
        showToast('تم ربط بصمة جهازك بنجاح', 'success');
        // إعادة تشغيل تدفق الدخول الآن بعد نجاح الربط
        await goToBioStep(currentPhone);
        return;
      }

      const assertion = await loginWithDeviceCredential({
        challenge: currentChallenge, credentialIds: currentCredentialIds, rpId: RP_ID,
      });
      const result = await callApi('completeDeviceLogin', {
        memberId: currentMemberId,
        credentialId: assertion.credentialId,
        clientDataJSON: assertion.clientDataJSON,
        authenticatorData: assertion.authenticatorData,
        signature: assertion.signature,
      });

      saveSession({ memberId: result.memberId, memberName: result.memberName, isAdmin: result.isAdmin });
      rememberPhone(currentPhone);
      if (result.cloneWarning) showToast('تنبيه: تم رصد نشاط غير معتاد لهذا الجهاز، راجع المدير إن لم يكن هذا دخولك', 'error', 6000);
      onLoginSuccess();
    } catch (err) {
      showToast(err.message || 'فشل الدخول بالبصمة', 'error');
    } finally {
      bioStatus.classList.add('hidden');
    }
  }));
}
