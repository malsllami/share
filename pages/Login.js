// صفحة الدخول — بصمة الجهاز الحقيقية (WebAuthn) هي المسار الافتراضي: زر واحد على الشاشة الرئيسية
// يفتح نافذة النظام مباشرة بلا أي إدخال، لأي جهاز سبق أن رُبطت بصمته بعضو. رقم الجوال يبقى مساراً
// احتياطياً (جهاز جديد لم يُربط بعد، أو أول دخول لعضو أضافه المدير حديثاً).
import { callApi } from '../services/api.js';
import { registerDeviceCredential, loginWithDeviceCredential, loginWithDiscoverableCredential, isWebAuthnSupported } from '../services/webauthn.js';
import { saveSession, rememberPhone, getRememberedPhone } from '../services/auth.js';
import { buildFullPhone, extractLocalPart, renderPhoneInputGroup, bindPhoneLocalInput } from '../utils/phone.js';
import { showToast } from '../components/Toast.js';
import { withButtonLoading } from '../components/Button.js';
import { RP_ID, RP_NAME } from '../config/config.js';
import { ICONS } from '../utils/icons.js';

// دورة تجديد الـchallenge المباشر بالخلفية — أقل من صلاحية الكاش بالخادم (120 ثانية) لضمان
// عدم انتهاء صلاحيته بين تحميل الشاشة وضغطة المستخدم الفعلية (قد يترك الشاشة مفتوحة دقائق)
const DISCOVERABLE_CHALLENGE_REFRESH_MS = 90000;

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

// تخمين نوع المصادقة الحيوية الأرجح لهذا الجهاز — WebAuthn لا يكشف نوع المصادقة الفعلي (وجه/بصمة)
// قبل إتمامها لأسباب خصوصية، فهذا تخمين منطقي حسب نظام التشغيل فقط (نفس القيد المعياري في كل التطبيقات
// المشابهة)؛ يُستخدَم فقط لاختيار أيقونة/نص الزر الأقرب لواقع الجهاز، لا لأي قرار أمني فعلي
function guessBiometricKind() {
  const ua = navigator.userAgent;
  // آيباد بواجهة سطح مكتب (iPadOS 13+) يُعرِّف نفسه كـ Macintosh — يُميَّز عبر دعم اللمس
  const isIPadOS13Plus = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  if (/iphone|ipod|ipad/i.test(ua) || isIPadOS13Plus) return 'faceid';
  if (/macintosh/i.test(ua)) return 'touchid';
  if (/android/i.test(ua)) return 'fingerprint';
  if (/windows/i.test(ua)) return 'windowsHello';
  return 'fingerprint';
}

const BIOMETRIC_META = {
  faceid:       { icon: ICONS.faceId,       primary: 'الدخول بالوجه',            login: 'الدخول بالوجه',            link: 'ربط الوجه بهذا الجهاز' },
  touchid:      { icon: ICONS.touchId,      primary: 'الدخول بالبصمة',           login: 'الدخول ببصمة الجهاز',      link: 'ربط بصمة هذا الجهاز' },
  fingerprint:  { icon: ICONS.fingerprint,  primary: 'الدخول بالبصمة',           login: 'الدخول ببصمة الجهاز',      link: 'ربط بصمة هذا الجهاز' },
  windowsHello: { icon: ICONS.windowsHello, primary: 'الدخول عبر Windows Hello', login: 'الدخول عبر Windows Hello', link: 'ربط الجهاز عبر Windows Hello' },
};

export function renderLoginPage(root, { onLoginSuccess }) {
  const bioKind = guessBiometricKind();
  const bioMeta = BIOMETRIC_META[bioKind];

  root.innerHTML =
    '<div class="login-screen">' +
      '<div class="login-card">' +
        '<img class="login-mark" src="assets/logo.png" alt="سهم" />' +
        '<div class="login-title">سهم</div>' +
        '<div class="login-sub">إدارة الجمعيات المالية</div>' +
        '<div id="login-step-primary">' +
          '<div class="login-sub" style="margin-bottom:18px">اضغط للدخول ببصمة هذا الجهاز مباشرة</div>' +
          '<button id="login-primary-bio-btn" class="bio-btn"><span class="bio-icon">' + bioMeta.icon + '</span><span>' + bioMeta.primary + '</span></button>' +
          '<p class="login-sub hidden" id="login-primary-bio-status" style="margin-top:12px">جاري التحقق من هويتك — أكمل العملية في نافذة النظام...</p>' +
          '<button id="login-show-phone-btn" class="login-back" type="button">أو أدخل برقم الجوال</button>' +
        '</div>' +
        '<div id="login-step-phone" class="hidden">' +
          '<button id="login-to-primary-btn" class="login-back" type="button" style="margin-bottom:14px">رجوع للدخول بالبصمة</button>' +
          '<div class="form-group">' +
            '<label class="form-label">رقم الجوال</label>' +
            renderPhoneInputGroup('login-phone', extractLocalPart(getRememberedPhone())) +
            '<div class="form-error hidden" id="login-phone-error"></div>' +
          '</div>' +
          '<button id="login-continue-btn" class="btn btn-gold btn-block">متابعة</button>' +
        '</div>' +
        '<div id="login-step-bio" class="hidden">' +
          '<div class="login-sub" id="login-bio-text" style="margin-bottom:18px"></div>' +
          '<button id="login-bio-btn" class="bio-btn"><span class="bio-icon">' + bioMeta.icon + '</span><span id="login-bio-btn-text">' + bioMeta.login + '</span></button>' +
          '<p class="login-sub hidden" id="login-bio-status" style="margin-top:12px">جاري التحقق من هويتك — أكمل العملية في نافذة النظام...</p>' +
          '<button id="login-back-btn" class="login-back" type="button">تغيير رقم الجوال</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  const phoneInput = root.querySelector('#login-phone');
  bindPhoneLocalInput(phoneInput);

  const stepPrimary = root.querySelector('#login-step-primary');
  const stepPhone = root.querySelector('#login-step-phone');
  const stepBio = root.querySelector('#login-step-bio');
  const bioText = root.querySelector('#login-bio-text');
  const bioBtn = root.querySelector('#login-bio-btn');
  const bioBtnText = root.querySelector('#login-bio-btn-text');
  const bioStatus = root.querySelector('#login-bio-status');
  const phoneError = root.querySelector('#login-phone-error');
  const primaryBioBtn = root.querySelector('#login-primary-bio-btn');
  const primaryBioStatus = root.querySelector('#login-primary-bio-status');

  let currentPhone = null;
  let currentMode = 'login'; // 'login' | 'register'
  let currentMemberId = null;
  let currentMemberName = null;
  let currentChallenge = null;
  let currentCredentialIds = null;

  // ── الدخول المباشر بلا رقم جوال (Discoverable Credential) ──
  let discChallenge = null;
  let discSessionId = null;
  let discRefreshTimer = null;

  // يُجلَب مسبقاً (لا عند الضغط) لنفس سبب goToBioStep أدناه: طلب شبكي داخل معالج الضغط قد يُفقد
  // "إذن التفاعل الحديث" اللازم لفتح نافذة WebAuthn فيرفضها المتصفح بخطأ NotAllowedError
  // ملاحظة: الزر نفسه يبقى قابلاً للضغط فوراً عند فتح الصفحة (لا نعطّله بانتظار هذا الطلب) — إن ضُغط
  // قبل اكتمال الجلب فعلياً، معالج الضغط أدناه يعرض تنبيهاً بسيطاً "يرجى الانتظار لحظة" بدل تعطيل الزر بصرياً
  async function refreshDiscoverableChallenge() {
    try {
      const result = await callApi('beginDiscoverableLogin', {});
      discChallenge = result.challenge;
      discSessionId = result.sessionId;
    } catch (err) {
      // فشل شبكي عابر — الزر يبقى كما هو، والمؤقت الدوري يعيد المحاولة تلقائياً بعده
    }
  }

  function startDiscRefreshLoop() {
    refreshDiscoverableChallenge();
    if (!discRefreshTimer) discRefreshTimer = setInterval(refreshDiscoverableChallenge, DISCOVERABLE_CHALLENGE_REFRESH_MS);
  }

  function stopDiscRefreshLoop() {
    if (discRefreshTimer) { clearInterval(discRefreshTimer); discRefreshTimer = null; }
  }

  function showPhoneError(msg) {
    phoneError.textContent = msg;
    phoneError.classList.remove('hidden');
  }

  function showPrimaryStep() {
    stepPhone.classList.add('hidden');
    stepBio.classList.add('hidden');
    stepPrimary.classList.remove('hidden');
    startDiscRefreshLoop();
  }

  function showPhoneStep() {
    stopDiscRefreshLoop();
    stepPrimary.classList.add('hidden');
    stepBio.classList.add('hidden');
    stepPhone.classList.remove('hidden');
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
      bioText.textContent = 'مرحباً ' + result.memberName + '، هذا أول دخول لك — اضغط لـ' + bioMeta.link;
      bioBtnText.textContent = bioMeta.link;
    } else {
      currentMode = 'login';
      currentMemberId = result.memberId;
      currentChallenge = result.challenge;
      currentCredentialIds = result.credentialIds;
      bioText.textContent = 'تحقق من هويتك للمتابعة';
      bioBtnText.textContent = bioMeta.login;
    }
    stepPhone.classList.add('hidden');
    stepBio.classList.remove('hidden');
  }

  root.querySelector('#login-show-phone-btn').addEventListener('click', showPhoneStep);
  root.querySelector('#login-to-primary-btn').addEventListener('click', showPrimaryStep);

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

  primaryBioBtn.addEventListener('click', withButtonLoading(primaryBioBtn, async () => {
    // إيقاف حلقة التجديد الدوري فوراً — وإلا قد تستبدل discChallenge/discSessionId بقيم جلسة جديدة
    // في منتصف محاولة دخول جارية فعلياً (مثلاً إن استغرق المستخدم أكثر من 90 ثانية أمام نافذة النظام)،
    // فيفشل completeDiscoverableLogin لاحقاً بـ"انتهت صلاحية المحاولة" رغم نجاح البصمة فعلياً
    stopDiscRefreshLoop();
    if (!discChallenge || !discSessionId) { showToast('يرجى الانتظار لحظة ثم إعادة المحاولة', 'error'); return; }
    primaryBioStatus.classList.remove('hidden');

    let assertion;
    try {
      assertion = await loginWithDiscoverableCredential({ challenge: discChallenge, rpId: RP_ID });
    } catch (err) {
      primaryBioStatus.classList.add('hidden');
      // NotAllowedError تُغطّي عمداً (حسب مواصفة WebAuthn، لحماية الخصوصية) حالتي "لا بصمة مسجَّلة
      // لهذا الموقع" و"المستخدم ألغى العملية" معاً — لا طريقة برمجية للتفريق بينهما
      if (err && err.name === 'NotAllowedError') {
        showToast('لم يتم العثور على بصمة مسجَّلة لهذا الجهاز على سهم، أو تم إلغاء العملية', 'error', 4500);
        showPhoneStep();
      } else {
        showToast(err.message || 'تعذّر فتح نافذة البصمة — جرّب الدخول برقم الجوال', 'error');
        startDiscRefreshLoop(); // المستخدم يبقى بالخطوة الأساسية — إعادة تشغيل التجديد الدوري لا مجرد تحديث لمرة واحدة
      }
      return;
    }

    let result;
    try {
      result = await callApi('completeDiscoverableLogin', {
        sessionId: discSessionId,
        credentialId: assertion.credentialId,
        clientDataJSON: assertion.clientDataJSON,
        authenticatorData: assertion.authenticatorData,
        signature: assertion.signature,
      });
    } catch (err) {
      primaryBioStatus.classList.add('hidden');
      showToast(err.message, 'error');
      startDiscRefreshLoop(); // challenge جديد للمحاولة القادمة + استئناف التجديد الدوري (السابق استُهلك أو انتهت صلاحيته)
      return;
    }

    stopDiscRefreshLoop();
    saveSession({ memberId: result.memberId, memberName: result.memberName, isAdmin: result.isAdmin });
    if (result.cloneWarning) showToast('تنبيه: تم رصد نشاط غير معتاد لهذا الجهاز، راجع المدير إن لم يكن هذا دخولك', 'error', 6000);
    primaryBioStatus.classList.add('hidden');
    onLoginSuccess();
  }));

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
        const completeResult = await callApi('completeDeviceRegistration', {
          memberId: currentMemberId,
          deviceName: guessDeviceName(),
          clientDataJSON: reg.clientDataJSON,
          attestationObject: reg.attestationObject,
        });
        showToast('تم ربط بصمة جهازك بنجاح', 'success');
        // بصمة النظام (userVerification:'required') تحقّقت للتو أثناء التسجيل نفسه — إثبات هوية كافٍ
        // وحديث بما يكفي لتسجيل الدخول فوراً، بلا حاجة لإجبار المستخدم على بصمة نظام ثانية منفصلة
        // (goToBioStep سابقاً كانت تُعيد كامل تدفق الدخول من الصفر، فتفرض navigator.credentials.get
        // إضافية — بصمتان بدل واحدة لعملية يُفترض أنها "دخول واحد")
        saveSession({ memberId: completeResult.memberId, memberName: completeResult.memberName, isAdmin: completeResult.isAdmin });
        rememberPhone(currentPhone);
        stopDiscRefreshLoop();
        onLoginSuccess();
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

  startDiscRefreshLoop();
}
