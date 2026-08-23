// صفحة الدخول — رقم الجوال هو الأساس الدائم لأي زائر. البصمة الحقيقية (WebAuthn) تظهر كخيار إضافي
// على نفس الشاشة فقط لجهاز رَبَط بصمته من قبل (عبر علم محلي في localStorage، انظر services/auth.js)
// — المستخدم هو من يقرر أي وسيلة يستخدم، لا فرض تلقائي لأي منهما.
import { callApi } from '../services/api.js';
import { registerDeviceCredential, loginWithDiscoverableCredential, isWebAuthnSupported } from '../services/webauthn.js';
import { saveSession, rememberPhone, getRememberedPhone, markDeviceBiometricLinked, deviceHasBiometricLinked, clearDeviceBiometricLink } from '../services/auth.js';
import { buildFullPhone, extractLocalPart, renderPhoneInputGroup, bindPhoneLocalInput } from '../utils/phone.js';
import { showToast } from '../components/Toast.js';
import { withButtonLoading } from '../components/Button.js';
import { RP_ID, RP_NAME } from '../config/config.js';
import { guessDeviceName, guessBiometricKind, BIOMETRIC_META } from '../utils/deviceBiometric.js';

// دورة تجديد الـchallenge المباشر بالخلفية — أقل من صلاحية الكاش بالخادم (120 ثانية) لضمان
// عدم انتهاء صلاحيته بين تحميل الشاشة وضغطة المستخدم الفعلية (قد يترك الشاشة مفتوحة دقائق)
const DISCOVERABLE_CHALLENGE_REFRESH_MS = 90000;

export function renderLoginPage(root, { onLoginSuccess }) {
  const bioKind = guessBiometricKind();
  const bioMeta = BIOMETRIC_META[bioKind];
  // يظهر زر البصمة على الشاشة الرئيسية فقط لجهاز رَبَط بصمته فعلاً من قبل على هذا المتصفح تحديداً
  // — رقم الجوال يبقى معروضاً دائماً بجانبه (أو وحده إن لم تُربط بصمة بعد)، والمستخدم يقرر بنفسه
  const showBio = deviceHasBiometricLinked() && isWebAuthnSupported();

  root.innerHTML =
    '<div class="login-screen">' +
      '<div class="login-card">' +
        '<img class="login-mark" src="assets/logo.png" alt="سهم" />' +
        '<div class="login-title">سهم</div>' +
        '<div class="login-sub">إدارة الجمعيات المالية</div>' +
        '<div id="login-step-main">' +
          (showBio ?
            '<div id="login-bio-section">' +
              '<button id="login-primary-bio-btn" class="bio-btn" disabled><span class="bio-icon">' + bioMeta.icon + '</span><span>' + bioMeta.primary + '</span></button>' +
              '<p class="login-sub hidden" id="login-primary-bio-status" style="margin-top:12px">جاري التحقق من هويتك — أكمل العملية في نافذة النظام...</p>' +
              '<div class="login-sub" style="margin:16px 0">أو</div>' +
            '</div>'
          : '') +
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
          '<button id="login-skip-bio-btn" class="login-back" type="button" style="margin-top:14px">تسجيل الدخول مباشرة بلا ربط بصمة</button>' +
          '<button id="login-back-btn" class="login-back" type="button">تغيير رقم الجوال</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  const phoneInput = root.querySelector('#login-phone');
  bindPhoneLocalInput(phoneInput);

  const stepMain = root.querySelector('#login-step-main');
  const stepBio = root.querySelector('#login-step-bio');
  const bioText = root.querySelector('#login-bio-text');
  const bioBtn = root.querySelector('#login-bio-btn');
  const bioBtnText = root.querySelector('#login-bio-btn-text');
  const bioStatus = root.querySelector('#login-bio-status');
  const phoneError = root.querySelector('#login-phone-error');
  const primaryBioBtn = root.querySelector('#login-primary-bio-btn');
  const primaryBioStatus = root.querySelector('#login-primary-bio-status');
  const skipBioBtn = root.querySelector('#login-skip-bio-btn');

  let currentPhone = null;
  let currentMemberId = null;
  let currentMemberName = null;
  let currentChallenge = null;

  // ── الدخول المباشر بلا رقم جوال (Discoverable Credential) ──
  let discChallenge = null;
  let discSessionId = null;
  let discRefreshTimer = null;

  // يُجلَب مسبقاً (لا عند الضغط) لنفس سبب goToBioStep أدناه: طلب شبكي داخل معالج الضغط قد يُفقد
  // "إذن التفاعل الحديث" اللازم لفتح نافذة WebAuthn فيرفضها المتصفح بخطأ NotAllowedError
  // الزر يُرسَم معطَّلاً بصرياً (disabled) من البداية ويبقى كذلك حتى يصل أول رد هنا — بدل تركه يبدو
  // جاهزاً للضغط ثم رفض الضغطة المبكرة بتنبيه، فتطابق حالته البصرية حالته الفعلية دائماً
  async function refreshDiscoverableChallenge() {
    try {
      const result = await callApi('beginDiscoverableLogin', {});
      discChallenge = result.challenge;
      discSessionId = result.sessionId;
      if (primaryBioBtn) primaryBioBtn.disabled = false;
    } catch (err) {
      // فشل شبكي عابر — الزر يبقى معطَّلاً، والمؤقت الدوري يعيد المحاولة تلقائياً بعده
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

  // الشاشة الرئيسية الموحّدة (بصمة + جوال معاً إن وُجدت بصمة مرتبطة بهذا الجهاز، أو جوال وحده) —
  // تحل محل شاشتي "البصمة أولاً" و"الجوال احتياطياً" السابقتين؛ لا حاجة لتبديل بينهما بعد الآن
  function showMainStep() {
    stepBio.classList.add('hidden');
    stepMain.classList.remove('hidden');
    if (primaryBioBtn) startDiscRefreshLoop();
  }

  // رقم الجوال وحده كافٍ لتسجيل الدخول (لا وسيلة تحقق ثانية) — بناءً على طلب محمد صراحة: البصمة
  // والجوال خياران متكافئان، لا يفرض أحدهما الآخر أبداً. تُستدعى مباشرة لعضو مسجَّل مسبقاً بلا أي
  // خطوة بصمة، ومن زر "تخطّي" لعضو جديد اختار عدم ربط بصمة جهازه الآن.
  async function loginDirectlyByPhone(phone) {
    let result;
    try {
      result = await callApi('loginByPhone', { phone });
    } catch (err) {
      showPhoneError(err.message);
      return;
    }
    saveSession({ memberId: result.memberId, memberName: result.memberName, isAdmin: result.isAdmin });
    rememberPhone(phone);
    stopDiscRefreshLoop();
    onLoginSuccess();
  }

  // يجلب الـchallenge مسبقاً هنا (وليس لحظة ضغط زر البصمة) — طلب شبكي داخل معالج الضغط
  // مباشرة قد يُفقد المتصفح "إذن التفاعل الحديث" اللازم لفتح واجهة WebAuthn فيرفضها بخطأ NotAllowedError.
  //
  // ملاحظة: خطوة البصمة (stepBio) تظهر كلما لم يكن **هذا الجهاز تحديداً** يحمل العلم المحلي لربط
  // بصمة — بصرف النظر عن needsRegistration القادم من الخادم (والذي يعكس حالة العضو ككل: "هل لديه
  // أي جهاز آخر مرتبط في أي مكان؟"). هذا يفرّق عمداً بين السؤالين: عضو لديه جهاز آخر مرتبط لكنه
  // يدخل الآن من جهاز جديد (أو جهاز رَبَط بصمته قبل وجود هذا العلم المحلي) يستحق نفس فرصة الربط
  // تماماً كعضو جديد كلياً — النظام أصلاً يدعم عدة أجهزة لكل عضو (انظر gas/Devices.gs). زر "تخطّي"
  // يبقى متاحاً دائماً لمن يريد الدخول برقم جواله فقط بلا ربط.
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
    // هذا الجهاز يحمل العلم المحلي مسبقاً، أو المتصفح لا يدعم WebAuthn إطلاقاً — لا معنى لعرض خطوة
    // "ربط بصمة" هنا في الحالتين، فيُسجَّل الدخول مباشرة برقم الجوال
    if (deviceHasBiometricLinked() || !isWebAuthnSupported()) {
      await loginDirectlyByPhone(phone);
      return;
    }

    currentMemberId = result.memberId;
    currentMemberName = result.memberName;
    try {
      currentChallenge = (await callApi('beginDeviceRegistration', { phone })).challenge;
    } catch (err) {
      showPhoneError(err.message);
      return;
    }
    bioText.textContent = 'مرحباً ' + result.memberName + ' — يمكنك ربط بصمة هذا الجهاز الآن لدخول أسرع لاحقاً (اختياري)';
    bioBtnText.textContent = bioMeta.link;
    stepMain.classList.add('hidden');
    stepBio.classList.remove('hidden');
  }

  // ملاحظة: لا فحص لدعم WebAuthn هنا بعد الآن — رقم الجوال وحده كافٍ لتسجيل دخول عضو موجود مسبقاً
  // بلا أي حاجة للبصمة إطلاقاً؛ فحص الدعم يبقى ذا معنى فقط داخل خطوة "ربط بصمة الجهاز" الاختيارية
  // نفسها (goToBioStep) لعضو جديد يريد ربط جهازه فعلاً، لا كشرط عام لمجرّد الدخول برقم الجوال
  const continueBtn = root.querySelector('#login-continue-btn');
  continueBtn.addEventListener('click', withButtonLoading(continueBtn, async () => {
    const phone = buildFullPhone(phoneInput.value);
    if (!phone) { showPhoneError('رقم الجوال غير صالح — أدخل 9 أرقام تبدأ بـ5 بدون صفر أو مفتاح الدولة'); return; }
    await goToBioStep(phone);
  }));

  root.querySelector('#login-back-btn').addEventListener('click', showMainStep);

  skipBioBtn.addEventListener('click', withButtonLoading(skipBioBtn, async () => {
    await loginDirectlyByPhone(currentPhone);
  }));

  if (primaryBioBtn) primaryBioBtn.addEventListener('click', withButtonLoading(primaryBioBtn, async () => {
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
        showMainStep();
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
      // الخادم رفض هذا الجهاز صراحة (DEVICE_NOT_LINKED — مثلاً حُذف/أُلغي من قاعدة البيانات): نمسح
      // العلم المحلي فوراً ونُخفي قسم البصمة من هذه الشاشة نفسها، حتى لا يبقى المستخدم عالقاً بزر
      // بصمة لن يعمل أبداً بلا أي وسيلة لإعادة الربط — المحاولة القادمة تعرض مسار "ربط بصمة جديد"
      let deviceUnlinked = false;
      if (err.code === 'DEVICE_NOT_LINKED') {
        clearDeviceBiometricLink();
        const bioSection = root.querySelector('#login-bio-section');
        if (bioSection) { bioSection.remove(); deviceUnlinked = true; }
      }
      // مدة أطول من الافتراضي (3.2 ثانية) عمداً هنا — رسالة الخادم قد تطول (خصوصاً رسائل التشخيص
      // المؤقتة الحالية)، وتحتاج وقتاً كافياً للقراءة أو التحديد والنسخ (Long-press) على الجوال
      showToast(err.message, 'error', 20000);
      // لا فائدة من استئناف تجديد الـchallenge الدوري إن كان زر البصمة نفسه قد أُزيل للتو من الشاشة
      if (!deviceUnlinked) startDiscRefreshLoop(); // challenge جديد للمحاولة القادمة + استئناف التجديد الدوري (السابق استُهلك أو انتهت صلاحيته)
      return;
    }

    stopDiscRefreshLoop();
    saveSession({ memberId: result.memberId, memberName: result.memberName, isAdmin: result.isAdmin });
    // شبكة أمان: تأكيد العلم المحلي رغم أن الزر لم يكن ليظهر أصلاً بدونه — احتياطاً لأي حالة نادرة
    markDeviceBiometricLinked();
    if (result.cloneWarning) showToast('تنبيه: تم رصد نشاط غير معتاد لهذا الجهاز، راجع المدير إن لم يكن هذا دخولك', 'error', 6000);
    primaryBioStatus.classList.add('hidden');
    onLoginSuccess();
  }));

  // زر ربط البصمة هنا يخدم حالة واحدة فقط الآن: عضو جديد اختار ربط بصمة جهازه اختيارياً (بدل التخطّي
  // وتسجيل الدخول برقم الجوال مباشرة عبر skipBioBtn أعلاه) — تسجيل الدخول برقم جوال عضو موجود مسبقاً
  // لا يمرّ من هنا إطلاقاً بعد الآن (goToBioStep يستدعي loginDirectlyByPhone مباشرة لتلك الحالة)
  bioBtn.addEventListener('click', withButtonLoading(bioBtn, async () => {
    // زر البصمة نفسه يتحوّل لشريط تقدّم بلا نص (سلوك موحّد لكل أزرار الموقع)، لكن هذا وحده لا يوضّح
    // للمستخدم أنه يجب إكمال العملية في نافذة النظام (البصمة/التعرف على الوجه) التي قد تستغرق ثوانٍ —
    // فيظهر نص حالة صريح تحت الزر طوال هذه الفترة بدل أن يبدو الزر "فارغاً بلا استجابة"
    bioStatus.classList.remove('hidden');
    try {
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
      saveSession({ memberId: completeResult.memberId, memberName: completeResult.memberName, isAdmin: completeResult.isAdmin });
      rememberPhone(currentPhone);
      // يُسجَّل العلم المحلي الآن — المرة القادمة التي يفتح فيها هذا الجهاز صفحة الدخول سيظهر زر
      // البصمة على الشاشة الرئيسية بجانب رقم الجوال مباشرة
      markDeviceBiometricLinked();
      stopDiscRefreshLoop();
      onLoginSuccess();
    } catch (err) {
      // نفس تصنيف NotAllowedError المستخدَم بمعالج primaryBioBtn أعلاه — بدونه يظهر للمستخدم نص
      // المتصفح الخام بالإنجليزية (مثل "The operation either timed out or was not allowed...")
      // بدل رسالة عربية مفهومة؛ NotAllowedError يغطّي هنا إلغاء المستخدم للعملية أو انتهاء المهلة
      if (err && err.name === 'NotAllowedError') {
        showToast('لم تكتمل عملية البصمة — تم الإلغاء أو انتهت المهلة، حاول مرة أخرى', 'error');
      } else {
        showToast(err.message || 'تعذّر ربط بصمة الجهاز', 'error');
      }
    } finally {
      bioStatus.classList.add('hidden');
    }
  }));

  if (primaryBioBtn) startDiscRefreshLoop();
}
