// صفحة الدخول — إعادة بناء كاملة (وليس ترميماً). شاشة واحدة مسطّحة بلا خطوات وسيطة: قسم بصمة
// (Discoverable Credential) يظهر دائماً طالما المتصفح يدعم WebAuthn — بصرف النظر عن أي علم محلي —
// بجانب قسم رقم الجوال الذي يبقى بديلاً كاملاً ومستقلاً دائماً. المستخدم يقرر أي وسيلة يستخدم في كل
// مرة؛ لا فرض تلقائي لأي منهما ولا اختفاء لأي خيار بسبب فشل عابر. "ربط بصمة جهاز جديد" لم يعد جزءاً
// من هذه الصفحة إطلاقاً — ينتقل بالكامل إلى لوحة العضو بعد نجاح الدخول (انظر pages/MemberDashboard.js).
import { callApi } from '../services/api.js';
import { loginWithDiscoverableCredential, isWebAuthnSupported, describeWebAuthnError } from '../services/webauthn.js';
import { saveSession, rememberPhone, getRememberedPhone, deviceHasBiometricLinked } from '../services/auth.js';
import { buildFullPhone, extractLocalPart, renderPhoneInputGroup, bindPhoneLocalInput } from '../utils/phone.js';
import { showToast } from '../components/Toast.js';
import { withButtonLoading } from '../components/Button.js';
import { RP_ID } from '../config/config.js';
import { guessBiometricKind, BIOMETRIC_META } from '../utils/deviceBiometric.js';

// دورة تجديد الـchallenge بالخلفية — هامش أمان مريح تحت صلاحية الكاش الجديدة بالخادم (300 ثانية):
// آخر تجديد يترك دائماً ≥150 ثانية متبقية حتى لو تُركت الشاشة مفتوحة طويلاً قبل الضغط الفعلي
const DISCOVERABLE_CHALLENGE_REFRESH_MS = 120000;

export function renderLoginPage(root, { onLoginSuccess }) {
  const bioKind = guessBiometricKind();
  const bioMeta = BIOMETRIC_META[bioKind];
  const bioSupported = isWebAuthnSupported();
  // تلميح عرض تجميلي بحت: هل رَبَط هذا الجهاز بصمة من قبل؟ يقرر فقط أي قسم يظهر أولاً/أبرز على
  // الشاشة — زر البصمة يظهر دائماً طالما المتصفح يدعمها، بصرف النظر عن قيمة هذا العلم تماماً
  // (انظر services/auth.js: deviceHasBiometricLinked لم يعد شرط ظهور بعد إعادة البناء)
  const bioLikely = bioSupported && deviceHasBiometricLinked();

  const bioSectionHtml = bioSupported ?
    '<div id="login-bio-section">' +
      '<button id="login-bio-btn" class="bio-btn" disabled><span class="bio-icon">' + bioMeta.icon + '</span><span>' + bioMeta.primary + '</span></button>' +
      '<p class="login-sub hidden" id="login-bio-status" style="margin-top:12px">جاري التحقق من هويتك — أكمل العملية في نافذة النظام...</p>' +
    '</div>'
    : '';
  const dividerHtml = bioSupported ? '<div class="login-sub" style="margin:16px 0">أو</div>' : '';

  const phoneSectionHtml =
    '<div class="form-group">' +
      '<label class="form-label">رقم الجوال</label>' +
      renderPhoneInputGroup('login-phone', extractLocalPart(getRememberedPhone())) +
      '<div class="form-error hidden" id="login-phone-error"></div>' +
    '</div>' +
    '<button id="login-phone-btn" class="btn btn-gold btn-block">دخول</button>';

  // ترتيب الأقسام يعتمد على التلميح المحلي فقط (تجميلي بحت) — بصمة أولاً لجهاز اعتاد استخدامها،
  // جوال أولاً غير ذلك. كلا القسمين يظهران معاً دائماً بصرف النظر عن الترتيب
  const sectionsHtml = bioLikely
    ? bioSectionHtml + dividerHtml + phoneSectionHtml
    : phoneSectionHtml + dividerHtml + bioSectionHtml;

  root.innerHTML =
    '<div class="login-screen">' +
      '<div class="login-card">' +
        '<img class="login-mark" src="assets/logo.png" alt="سهم" />' +
        '<div class="login-title">سهم</div>' +
        '<div class="login-sub">إدارة الجمعيات المالية</div>' +
        sectionsHtml +
      '</div>' +
    '</div>';

  const phoneInput = root.querySelector('#login-phone');
  bindPhoneLocalInput(phoneInput);
  const phoneError = root.querySelector('#login-phone-error');
  const phoneBtn = root.querySelector('#login-phone-btn');
  const bioBtn = root.querySelector('#login-bio-btn');
  const bioStatus = root.querySelector('#login-bio-status');

  let discChallenge = null;
  let discSessionId = null;
  let discRefreshTimer = null;

  function showPhoneError(msg) {
    phoneError.textContent = msg;
    phoneError.classList.remove('hidden');
  }

  // يُجلَب مسبقاً (لا عند الضغط) — طلب شبكي داخل معالج الضغط مباشرة قد يُفقد "إذن التفاعل الحديث"
  // اللازم لفتح نافذة WebAuthn فيرفضها المتصفح بخطأ NotAllowedError. الزر يُرسَم معطَّلاً بصرياً من
  // البداية ويبقى كذلك حتى يصل أول رد هنا — فتطابق حالته البصرية حالته الفعلية دائماً.
  async function refreshDiscoverableChallenge() {
    try {
      const result = await callApi('beginDiscoverableLogin', {});
      discChallenge = result.challenge;
      discSessionId = result.sessionId;
      if (bioBtn) bioBtn.disabled = false;
    } catch (err) {
      // فشل شبكي عابر — الزر يبقى معطَّلاً، والمؤقت الدوري يعيد المحاولة تلقائياً بعده
    }
  }

  function startDiscRefreshLoop() {
    if (!bioBtn) return;
    refreshDiscoverableChallenge();
    if (!discRefreshTimer) discRefreshTimer = setInterval(refreshDiscoverableChallenge, DISCOVERABLE_CHALLENGE_REFRESH_MS);
  }

  function stopDiscRefreshLoop() {
    if (discRefreshTimer) { clearInterval(discRefreshTimer); discRefreshTimer = null; }
  }

  // رقم الجوال وحده كافٍ لتسجيل الدخول (لا وسيلة تحقق ثانية) — بناءً على طلب محمد صراحة: البصمة
  // والجوال خياران متكافئان، لا يفرض أحدهما الآخر أبداً ولا يتطلب استدعاء أي دالة بصمة أولاً
  phoneBtn.addEventListener('click', withButtonLoading(phoneBtn, async () => {
    phoneError.classList.add('hidden');
    const phone = buildFullPhone(phoneInput.value);
    if (!phone) { showPhoneError('رقم الجوال غير صالح — أدخل 9 أرقام تبدأ بـ5 بدون صفر أو مفتاح الدولة'); return; }

    let result;
    try {
      result = await callApi('loginByPhone', { phone });
    } catch (err) {
      showPhoneError(err.message);
      return;
    }
    saveSession({ memberId: result.memberId, memberName: result.memberName, isAdmin: result.isAdmin, identityToken: result.identityToken });
    rememberPhone(phone);
    stopDiscRefreshLoop();
    onLoginSuccess();
  }));

  if (bioBtn) {
    bioBtn.addEventListener('click', withButtonLoading(bioBtn, async () => {
      // إيقاف حلقة التجديد الدوري فوراً — وإلا قد تستبدل discChallenge/discSessionId بقيم جلسة جديدة
      // في منتصف محاولة دخول جارية فعلياً (مثلاً إن استغرق المستخدم أكثر من دقيقتين أمام نافذة النظام)
      stopDiscRefreshLoop();
      if (!discChallenge || !discSessionId) { showToast('يرجى الانتظار لحظة ثم إعادة المحاولة', 'error'); startDiscRefreshLoop(); return; }
      bioStatus.classList.remove('hidden');

      let assertion;
      try {
        assertion = await loginWithDiscoverableCredential({ challenge: discChallenge, rpId: RP_ID });
      } catch (err) {
        bioStatus.classList.add('hidden');
        // فشل بأدب دائماً — القسم يبقى ظاهراً، لا مسح لأي علم محلي ولا إخفاء لأي قسم. هذا هو الإصلاح
        // الجذري لمشكلة "يجبر الدخول بدون بصمة": فشل بصمة عابر لا يعني أبداً عدم توفرها لاحقاً
        showToast(describeWebAuthnError(err, 'login'), 'error', 4500);
        startDiscRefreshLoop();
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
        bioStatus.classList.add('hidden');
        // رسالة عامة موحَّدة من الخادم (لا تعداد بيانات أعضاء آخرين بعد الآن) — القسم يبقى ظاهراً
        // دائماً، والمستخدم حر يعيد المحاولة أو يدخل برقم جواله من نفس الشاشة بلا أي عائق
        showToast(err.message, 'error', 6000);
        startDiscRefreshLoop();
        return;
      }

      stopDiscRefreshLoop();
      saveSession({ memberId: result.memberId, memberName: result.memberName, isAdmin: result.isAdmin, identityToken: result.identityToken });
      if (result.cloneWarning) showToast('تنبيه: تم رصد نشاط غير معتاد لهذا الجهاز، راجع المدير إن لم يكن هذا دخولك', 'error', 6000);
      bioStatus.classList.add('hidden');
      onLoginSuccess();
    }));
    startDiscRefreshLoop();
  }
}
