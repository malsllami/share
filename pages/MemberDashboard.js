// لوحة العضو — بطاقة ملفي، جمعياتي (كمركز/Hub مختصر)، وشاشات متخصصة منبثقة لكل تفصيل
// (توزيع الرغبات / أشهر الاستلام المحدَّدة / حالة التحصيل) بدل صفحة طويلة واحدة يجب التمرير فيها بالكامل —
// أقرب لتجربة تطبيق جوال حقيقي: الرئيسية = ملخص سريع + أزرار، والتفاصيل = شاشات مخصصة عند الحاجة فقط.
import { callApi } from '../services/api.js';
import { renderAppHeader, wireHeaderEvents } from '../components/Header.js';
import { openModal, closeModal } from '../components/Modal.js';
import { showToast } from '../components/Toast.js';
import { formatCurrency, formatNumber, bindDigitNormalization, normalizeDigits } from '../utils/numbers.js';
import { computeDurationProgress, renderProgressBarHtml, daysUntil, computeMonthDueDate } from '../utils/dates.js';
import { formatPhoneDisplay } from '../utils/phone.js';
import { isValidSharesCount } from '../utils/validators.js';
import { withButtonLoading, withCardLoading } from '../components/Button.js';
import { renderWishMonthPicker } from '../components/WishMonthPicker.js';
import { registerDeviceCredential, isWebAuthnSupported, describeWebAuthnError } from '../services/webauthn.js';
import { markDeviceBiometricLinked, deviceHasBiometricLinked, clearDeviceBiometricLink } from '../services/auth.js';
import { escapeHtml } from '../utils/sanitize.js';
import { guessDeviceName, guessBiometricKind, BIOMETRIC_META } from '../utils/deviceBiometric.js';
import { RP_ID, RP_NAME } from '../config/config.js';
import { renderDonutHtml, percentBarClass_, renderStatRingHtml } from '../components/Charts.js';
import { ICONS } from '../utils/icons.js';
import { renderBottomNavHtml, wireBottomNav, updateBottomNavActive, MEMBER_PRIMARY_ITEMS, MEMBER_MORE_ITEMS } from '../components/BottomNav.js';

const STATUS_LABEL = { 'جديدة': 'جديدة', 'نشطة': 'نشطة', 'منتهية': 'منتهية' };

// شريط تنقّل سفلي للوحة العضو لأول مرة (لم يكن موجوداً إطلاقاً سابقاً) — نفس مكوّن BottomNav.js
// المستخدَم بلوحة المدير، بعناصر عضو مختلفة: الرئيسية/الفئات/الملف + "المزيد" (الرؤى — نفس محتوى
// الرئيسية بمسمى منفصل، بقرار محمد الصريح). "الرؤى" و"الرئيسية" يعرضان نفس renderMemberAssociationsView
// بالضبط عمداً؛ الفارق مسمى التبويب النشط فقط في الشريط السفلي.
export async function renderMemberDashboard(root, { session, onLogout }) {
  root.innerHTML = renderAppHeader({ memberName: session.memberName, isAdmin: false, bellCount: 0 }) +
    '<div class="container" style="padding-top:22px"><div id="member-content"></div></div>' +
    renderBottomNavHtml(MEMBER_PRIMARY_ITEMS, MEMBER_MORE_ITEMS);
  wireHeaderEvents(root, onLogout);

  const content = root.querySelector('#member-content');

  function updateBellBadge(count) {
    const btn = root.querySelector('#header-bell-btn');
    if (!btn) return;
    const old = btn.querySelector('.bell-badge');
    if (old) old.remove();
    if (count > 0) {
      const span = document.createElement('span');
      span.className = 'bell-badge';
      span.textContent = count > 9 ? '9+' : String(count);
      btn.appendChild(span);
    }
  }

  function activate(tabId) {
    updateBottomNavActive(root, tabId, MEMBER_PRIMARY_ITEMS);
    if (tabId === 'home' || tabId === 'insights') renderMemberAssociationsView(content, session, null, updateBellBadge);
    else if (tabId === 'categories') renderMemberCategoriesView(content, session);
    else if (tabId === 'profile') renderMemberProfileView(content, session, onLogout);
  }

  wireBottomNav(root, activate, MEMBER_MORE_ITEMS);
  activate('home');
}

// بطاقة "رغباتي واستحقاقي" — طُلبت صراحةً من محمد: كل شهر استلام اخترته + عدد الأيام المتبقية على
// الاستحقاق، بتلوين محدَّد: أخضر = تم الاستلام فعلاً، أزرق = أقل من 30 يوماً متبقياً،
// برتقالي = 30 يوماً فأكثر متبقياً — نظام ألوان مختلف عمداً عن بطاقة "أشهر استلامي المحدَّدة"
// الأقدم (أحمر/ذهبي/محايد) المستخدَمة داخل تفصيل الجمعية؛ الاثنتان تتعايشان لغرضين مختلفين
function buildMyEntitlementCardHtml(activeAssoc, deliveryRows, monthDateByNum) {
  if (!deliveryRows || deliveryRows.length === 0) {
    return (
      '<div class="card mt-16"><div class="card-title">' + ICONS.target + ' رغباتي واستحقاقي</div>' +
      '<p class="table-empty">لم تحدّد شهر استلام بعد في ' + activeAssoc.name + '</p></div>'
    );
  }
  const rows = deliveryRows.slice().sort((a, b) => a.monthNum - b.monthNum).map(r => {
    let state, countdownClass, countdownText;
    if (r.delivered) {
      state = 'state-done'; countdownClass = 'done';
      countdownText = 'تم الاستلام' + (r.confirmDate ? ' — ' + new Date(r.confirmDate).toLocaleDateString('en-GB') : '');
    } else {
      const d = daysUntil(computeMonthDueDate(monthDateByNum.get(Number(r.monthNum))));
      if (d === null || d < 30) {
        state = 'state-soon-blue'; countdownClass = 'soon-blue';
        countdownText = (d === null || d <= 0) ? 'مستحق الآن' : 'خلال ' + formatNumber(d) + ' يوم';
      } else {
        state = 'state-far-orange'; countdownClass = 'far-orange';
        countdownText = 'خلال ' + formatNumber(d) + ' يوم';
      }
    }
    return (
      '<div class="mpc-delivery-row ' + state + '">' +
        '<div class="mpc-delivery-month">' + formatNumber(r.monthNum) + '</div>' +
        '<div class="mpc-delivery-info">' +
          '<div class="mpc-delivery-shares">' + formatNumber(r.sharesCount) + ' سهم</div>' +
          '<div class="mpc-delivery-value">' + formatCurrency(r.deliveryValue) + '</div>' +
        '</div>' +
        '<div class="mpc-delivery-countdown ' + countdownClass + '">' + countdownText + '</div>' +
      '</div>'
    );
  }).join('');
  return (
    '<div class="card mt-16"><div class="card-title">' + ICONS.target + ' رغباتي واستحقاقي — ' + activeAssoc.name + '</div>' +
      '<div class="mpc-delivery-list">' + rows + '</div>' +
    '</div>'
  );
}

// بطاقة تنقّل قابلة للنقر (Hub → Detail) — عنوان + محتوى مختصر اختياري + سهم يشير لوجود المزيد
// accentClass: شريط لوني جانبي مميِّز (accent-gold/accent-success/accent-indigo) حتى لا تتشابه
// البطاقات الثلاث بصرياً رغم اختلاف وظيفتها
function navCardHtml(id, icon, title, bodyHtml, accentClass) {
  return (
    '<div class="card nav-card mt-16' + (accentClass ? ' ' + accentClass : '') + '" id="' + id + '">' +
      '<div class="flex-between">' +
        '<div class="nav-card-title">' + icon + ' ' + title + '</div>' +
        '<span class="nav-card-chevron">‹</span>' +
      '</div>' +
      (bodyHtml ? '<div class="mt-16">' + bodyHtml + '</div>' : '') +
    '</div>'
  );
}

// عرض "جمعياتي" (بطاقة ملف + قائمة) بلا رأس صفحة مستقل — قابل لإعادة الاستخدام داخل لوحة
// المدير أيضاً (المدير عضو بنفس الوقت في هذا النظام، وله جمعياته ورغباته الخاصة كأي عضو آخر).
// isStale: دالة اختيارية من حارس تنقّل التبويبات بلوحة المدير (انظر AdminDashboard.js) — تُستدعى
// بعد كل انتظار شبكي؛ إن أعادت true فهذا يعني أن المدير انتقل لتبويب آخر أثناء الانتظار، فتُتجاهَل
// نتيجة هذا الاستدعاء بصمت بدل كتابتها فوق محتوى التبويب الجديد الصحيح. عند الاستدعاء المباشر للوحة
// العضو نفسها (بلا تبويبات متعددة تتنافس على نفس content) يبقى isStale بلا قيمة فلا يُفعَّل أي تجاهل
export async function renderMemberAssociationsView(content, session, isStale, onBellUpdate) {
  content.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  let subs, associations, myWishes, members;
  try {
    [subs, associations, myWishes, members] = await Promise.all([
      callApi('getSubscriptions', { memberId: session.memberId }),
      callApi('getAssociations'),
      callApi('getWishes', { memberId: session.memberId }),
      callApi('getMembers'),
    ]);
  } catch (err) {
    if (isStale && isStale()) return;
    content.innerHTML = '<p class="table-empty">' + err.message + '</p>';
    return;
  }
  if (isStale && isStale()) return;

  const me = members.find(m => m.id === session.memberId);
  const mine = associations
    .filter(a => subs.some(s => s.assocId === a.id))
    .map(a => ({ ...a, sub: subs.find(s => s.assocId === a.id) }));
  // جمعيات "جديدة" (لم تبدأ بعد) لم يشترك فيها العضو بعد — متاحة للاشتراك الذاتي (subscribeSelf
  // بالخادم يفرض نفس القيد: حالة "جديدة" فقط، تفادياً لكسر عدالة حساب السعة الشهرية التراكمية)
  const available = associations.filter(a => a.status === 'جديدة' && !subs.some(s => s.assocId === a.id));

  // ── بطاقة ملف العضو: صورة رمزية بأول حرف من الاسم + رقمه + 3 إحصائيات إجمالية ──
  // الإجماليات (أسهمي/استحقاقي) تُحسب فقط من الجمعيات "نشطة" — جمعية "جديدة" لم تبدأ فعلياً بعد
  // (لم يُغلق شهرها الأول)، فخلط أرقامها مع جمعية نشطة فعلاً في رقم واحد مُجمَّع كان يُنتج مبلغاً
  // مضلِّلاً لا يعكس ما هو مستحق فعلياً الآن. الجمعية الجديدة نفسها تبقى ظاهرة ببطاقتها المستقلة
  // أدناه (بأسهمها الخاصة) — فقط لا تُحتسب ضمن هذا الملخص المُجمَّع.
  const activeOnly = mine.filter(a => a.status === 'نشطة');
  const totalShares = activeOnly.reduce((s, a) => s + Number(a.sub.sharesCount), 0);
  const totalEntitlement = activeOnly.reduce((s, a) => s + Number(a.sub.sharesCount) * a.shareValue * a.duration, 0);
  // جمعية نشطة واحدة كحد أقصى عملياً (نفس افتراض لوحة المدير — انظر تسلسل الحالات في gas/MonthClosing.gs)
  const activeAssoc = activeOnly[0] || null;

  // بيانات إضافية خفيفة خاصة بجمعيتي النشطة فقط (إن وُجدت) — نفس نمط 4 نداءات متزامنة الناجح أصلاً
  // في showAssociationDetail أدناه (وليس إضافة عشوائية فوق نداء ثقيل كما حدث سابقاً بلوحة المدير)
  let activeMonths = [], activeCollectionRows = [], activeDeliveryRows = [];
  if (activeAssoc) {
    try {
      [activeMonths, activeCollectionRows, activeDeliveryRows] = await Promise.all([
        callApi('getMonths', { assocId: activeAssoc.id }),
        callApi('getMemberCollectionRows', { assocId: activeAssoc.id, memberId: session.memberId }),
        callApi('getMemberDeliveryRows', { assocId: activeAssoc.id, memberId: session.memberId }),
      ]);
    } catch (err) { /* بيانات تكميلية — فشلها لا يمنع عرض بقية اللوحة */ }
    if (isStale && isStale()) return;
  }
  const activeMonthDateByNum = new Map(activeMonths.map(m => [Number(m.monthNum), m.date]));
  const activeProg = activeAssoc ? computeDurationProgress(activeAssoc.startDate, activeAssoc.endDate, activeAssoc.duration) : null;
  const activeEntitlement = activeAssoc ? Number(activeAssoc.sub.sharesCount) * activeAssoc.shareValue * activeAssoc.duration : 0;
  const paidSoFar = activeCollectionRows.filter(r => r.collected).reduce((s, r) => s + Number(r.sharesValue), 0);
  const remainingToPay = Math.max(0, activeEntitlement - paidSoFar);

  const profileHtml =
    '<div class="mpc-block">' +
      '<div class="mpc-header">' +
        '<div class="mpc-avatar">' + (session.memberName ? session.memberName.trim().charAt(0) : '؟') + '</div>' +
        '<div class="mpc-name">' + session.memberName + '</div>' +
        (me ? '<div class="mpc-phone">📱 ' + formatPhoneDisplay(me.phone) + '</div>' : '') +
      '</div>' +
      '<div class="mpc-body">' +
        '<div class="mpc-stats">' +
          '<div class="mpc-stat"><div class="mpc-stat-val">' + formatNumber(mine.length) + '</div><div class="mpc-stat-label">جمعياتي</div></div>' +
          '<div class="mpc-stat"><div class="mpc-stat-val">' + formatNumber(totalShares) + '</div><div class="mpc-stat-label">إجمالي أسهمي</div></div>' +
          '<div class="mpc-stat"><div class="mpc-stat-val">' + formatCurrency(totalEntitlement) + '</div><div class="mpc-stat-label">إجمالي استحقاقي</div></div>' +
        '</div>' +
        // ملاحظة المدير — نص تذكيري يدوي بحت (مثال: "المتبقي من تحصيل شهر 5 يُستلم يدوياً لاحقاً")؛
        // لا تدخل في أي حساب بالصفحة، وتظهر فقط إن كتبها المدير فعلاً من لوحته (انظر Members.gs)
        (me && me.notes ? '<div class="member-note-banner">ملاحظة من المدير: ' + me.notes + '</div>' : '') +
      '</div>' +
    '</div>';

  // ── إجماليات حسابك — 4 حلقات نسبة بلون ديناميكي حسب الفئة (حسب التصميم المرجعي الجديد)، كلها من
  // بيانات جمعيتي النشطة الحقيقية فقط، لا أي بيانات عن أعضاء آخرين ──
  const paidPercent = activeEntitlement > 0 ? Math.min(100, Math.round((paidSoFar / activeEntitlement) * 100)) : 0;
  const receivedSharesCount = activeDeliveryRows.filter(r => r.delivered).reduce((s, r) => s + Number(r.sharesCount), 0);
  const receivedSharesPercent = activeAssoc && activeAssoc.sub.sharesCount > 0 ? Math.min(100, Math.round((receivedSharesCount / activeAssoc.sub.sharesCount) * 100)) : 0;
  const kpiSectionHtml = !activeAssoc ? '' : (
    '<div class="section-title">إجماليات حسابك — ' + activeAssoc.name + '</div>' +
    '<div class="kpi-ring-grid" style="margin-bottom:18px">' +
      renderStatRingHtml(paidPercent, formatCurrency(paidSoFar), 'إجمالي المدفوع') +
      renderStatRingHtml(activeProg.percent, formatNumber(activeAssoc.duration) + ' شهر', 'مدة الجمعية — متبقٍ ' + formatNumber(activeProg.remainingMonths)) +
      renderStatRingHtml(paidPercent, paidPercent + '٪', 'المدفوع من الأسهم') +
      renderStatRingHtml(receivedSharesPercent, formatNumber(activeAssoc.sub.sharesCount) + ' سهم', 'أسهمي — مستلم ' + formatNumber(receivedSharesCount)) +
    '</div>' +
    (remainingToPay > 0 ? '<p class="form-hint" style="margin:-10px 0 18px">المتبقي عليك للسداد: ' + formatCurrency(remainingToPay) + '</p>' : '')
  );

  // ── توزيع استحقاقي على الأشهر — حلقة توزيع من رغباتي الفعلية في الجمعية النشطة فقط ──
  const donutSectionHtml = !activeAssoc || activeDeliveryRows.length === 0 ? '' : (function () {
    const colors = ['var(--kpi-blue-1)', 'var(--kpi-green-1)', 'var(--kpi-purple-1)', 'var(--kpi-orange-1)', 'var(--kpi-gold-1)', 'var(--indigo-l)'];
    // مرتَّبة برقم الشهر دائماً — getMemberDeliveryRows تُعيد الصفوف بترتيب إدراجها بالجدول (ترتيب
    // اختيار العضو لأشهره الفعلي)، وليس بالضرورة بترتيب رقم الشهر تصاعدياً
    const segments = activeDeliveryRows.slice().sort((a, b) => a.monthNum - b.monthNum).map((r, i) =>
      ({ label: 'الشهر ' + formatNumber(r.monthNum), value: Number(r.deliveryValue) || 0, color: colors[i % colors.length] })
    );
    return (
      '<div class="card mt-16"><div class="card-title">' + ICONS.donut + ' توزيع استحقاقي على الأشهر</div>' +
        renderDonutHtml(segments, formatNumber(activeDeliveryRows.length), 'أشهر محدَّدة للاستلام') +
      '</div>'
    );
  })();

  // ── بطاقة "رغباتي واستحقاقي" — طُلبت صراحةً: كل شهر اخترته + عدد الأيام المتبقية على الاستحقاق،
  // ملوَّنة: أخضر = تم الاستلام فعلاً، أزرق = أقل من 30 يوماً متبقياً، برتقالي = 30 يوماً فأكثر ──
  const entitlementCardHtml = !activeAssoc ? '' : buildMyEntitlementCardHtml(activeAssoc, activeDeliveryRows, activeMonthDateByNum);

  const availableSectionHtml = available.length
    ? '<div class="section-title">جمعيات متاحة للاشتراك</div><div class="grid grid-2" id="available-assoc-list"></div>'
    : '';

  // ── بطاقة "أجهزتي" — مدخل موحَّد واحد لكل ما يخص بصمة الأجهزة: ربط بصمة هذا الجهاز (إن لم تكن
  // مرتبطة بعد) + سرد كل الأجهزة المرتبطة بالحساب (من أي جهاز رُبطت) وإلغاء أي جهاز لم يعد يُستخدَم.
  // كانتا بطاقتين منفصلتين سابقاً (ربط الجهاز / أجهزتي) تخدمان نفس الغرض عملياً فدُمجتا في واحدة
  // (قرار محمد الصريح) — التفاصيل كلها الآن داخل نافذة "أجهزتي" المنبثقة بدل الصفحة الرئيسية
  const devicesCardHtml = navCardHtml('nav-devices', '📱', 'أجهزتي',
    '<p class="form-hint" style="margin:0">ربط بصمة جهاز جديد، وإدارة الأجهزة المرتبطة بحسابك</p>', 'accent-indigo');

  // ── تنبيهاتي — من بيانات حقيقية محسوبة فقط (بلا جدول إشعارات جديد): شهر حالي غير مسدَّد بعد،
  // أو جمعية جديدة متاحة للاشتراك — يُغذّي عداد الجرس بالرأس إن وُجد استدعاء له
  if (onBellUpdate) {
    let myAlertCount = 0;
    if (activeAssoc) {
      const currentMonth = activeMonths.find(m => {
        const start = new Date(m.date);
        if (isNaN(start)) return false;
        const end = new Date(start); end.setMonth(end.getMonth() + 1);
        const now = new Date();
        return now >= start && now < end;
      });
      if (currentMonth) {
        const unpaidNow = activeCollectionRows.some(r => Number(r.monthNum) === Number(currentMonth.monthNum) && !r.collected);
        if (unpaidNow) myAlertCount++;
      }
    }
    if (available.length > 0) myAlertCount++;
    onBellUpdate(myAlertCount);
  }

  if (mine.length === 0) {
    content.innerHTML = profileHtml + devicesCardHtml +
      '<div class="card text-center"><p style="color:var(--text-3)">لست مشتركاً في أي جمعية بعد.' +
      (available.length ? '' : ' تواصل مع المدير للاشتراك.') + '</p></div>' +
      availableSectionHtml;
    wireDevicesCard(content, session, me, isStale);
    renderAvailableAssociations(content, session, available);
    return;
  }

  // ── آخر العمليات — تحصيل/تسليم مؤكَّد لهذا العضو عبر كل جمعياته (وليس الجمعية النشطة فقط) —
  // بيانات حقيقية من getMemberTransactions (gas/Activity.gs)، بلا أي رحلة شبكة إضافية داخل نفس
  // هذا التحميل (نداء واحد مستقل بعد اكتمال المحتوى الرئيسي، فشله لا يمنع عرض بقية اللوحة)
  let myTransactions = [];
  try { myTransactions = await callApi('getMemberTransactions', { memberId: session.memberId }); } catch (err) { /* غير حرج */ }
  if (isStale && isStale()) return;
  const transactionsSectionHtml =
    '<div class="section-title">آخر العمليات</div>' +
    '<div class="card" style="margin-bottom:18px"><div class="tx-list">' + renderMemberTransactionsListHtml(myTransactions) + '</div></div>';

  content.innerHTML = profileHtml + kpiSectionHtml + donutSectionHtml + entitlementCardHtml + devicesCardHtml +
    '<div class="section-title">جمعياتي</div>' +
    '<div class="grid grid-2" id="assoc-list"></div>' +
    availableSectionHtml + transactionsSectionHtml;
  wireDevicesCard(content, session, me, isStale);

  const list = content.querySelector('#assoc-list');
  mine.forEach(a => list.appendChild(buildMemberAssocCardEl(a, myWishes, content, session)));

  renderAvailableAssociations(content, session, available);
}

// بطاقة جمعية واحدة لقائمتي "جمعياتي" (الرئيسية) و"الفئات" معاً — نفس العنصر بالضبط، دالة واحدة
// بدل تكراره في مكانين. تلوين شريط التقدّم الزمني ديناميكي حسب فئة النسبة (تحديد محمد الصريح).
function buildMemberAssocCardEl(a, myWishes, content, session) {
  const prog = computeDurationProgress(a.startDate, a.endDate, a.duration);
  const wishedTotal = myWishes.filter(w => w.assocId === a.id).reduce((s, w) => s + Number(w.sharesCount), 0);
  const wishedPercent = a.sub.sharesCount > 0 ? Math.min(100, Math.round((wishedTotal / a.sub.sharesCount) * 100)) : 0;
  const daysToStart = daysUntil(a.startDate);
  const notStartedYet = daysToStart !== null && daysToStart > 0;

  const el = document.createElement('div');
  el.className = 'assoc-card status-' + a.status;
  el.innerHTML =
    '<div class="flex-between"><div class="assoc-name">🏠 ' + a.name + '</div>' +
    '<span class="badge badge-' + (a.status === 'نشطة' ? 'success' : a.status === 'منتهية' ? 'gray' : 'gold') + '">' + STATUS_LABEL[a.status] + '</span></div>' +
    '<div class="assoc-meta">' +
      '<div class="assoc-meta-item"><div class="assoc-meta-label">أسهمي في الجمعية</div><div class="assoc-meta-val">' + formatNumber(a.sub.sharesCount) + ' سهم</div></div>' +
      '<div class="assoc-meta-item"><div class="assoc-meta-label">قيمة السهم</div><div class="assoc-meta-val">' + formatCurrency(a.shareValue) + '</div></div>' +
    '</div>' +
    '<div class="progress-wrap primary">' + renderProgressBarHtml(prog.percent, percentBarClass_(prog.percent)) +
      '<div class="progress-label">' + (notStartedYet
        ? '<span>لم تبدأ بعد</span><span>تبدأ خلال ' + formatNumber(daysToStart) + ' يوم</span>'
        : '<span>تقدّم الجمعية الزمني — ' + prog.percent + '٪</span><span>' + formatNumber(prog.remainingDays) + ' يوم متبقٍ</span>') + '</div></div>' +
    '<div class="progress-wrap secondary">' + renderProgressBarHtml(wishedPercent, percentBarClass_(wishedPercent)) +
      '<div class="progress-label"><span>رغبات الاستلام المحدَّدة</span><span>' + formatNumber(wishedTotal) + ' / ' + formatNumber(a.sub.sharesCount) + ' سهم</span></div></div>';
  el.addEventListener('click', withCardLoading(el, () => showAssociationDetail(content, session, a)));
  return el;
}

function renderMemberTransactionsListHtml(txs) {
  if (!txs || txs.length === 0) return '<p class="table-empty">لا توجد عمليات مؤكَّدة بعد</p>';
  return txs.map(t => {
    const isIn = t.type === 'استلام';
    return (
      '<div class="tx-row">' +
        '<div class="tx-row-icon ' + (isIn ? 'in' : 'out') + '">' + (isIn ? ICONS.handoff : ICONS.wallet) + '</div>' +
        '<div class="tx-row-body">' +
          '<div class="tx-row-title">' + t.type + ' — ' + escapeHtml(t.assocName) + '</div>' +
          '<div class="tx-row-meta">شهر ' + formatNumber(t.monthNum) + ' — ' + formatDualDateShort_(t.date) + '</div>' +
        '</div>' +
        '<div class="tx-row-amount ' + (isIn ? 'in' : 'out') + '">' + formatCurrency(t.amount) + '</div>' +
      '</div>'
    );
  }).join('');
}

// تاريخ ميلادي مختصر (يوم/شهر/سنة) — بلا حاجة لاستيراد formatDualDate الكامل هنا لعرض بسيط بقائمة العمليات
function formatDualDateShort_(dateInput) {
  const d = new Date(dateInput);
  return isNaN(d) ? '' : d.toLocaleDateString('en-GB');
}

// تبويب "الفئات" (شريط سفلي جديد بلوحة العضو) — نفس بيانات "جمعياتي" الحقيقية، لكن مع فلاتر حالة
// (الكل/نشطة/جديدة/منتهية) بدل عرضها كلها دفعة واحدة — تحديد محمد الصريح
async function renderMemberCategoriesView(content, session) {
  content.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  let subs, associations, myWishes;
  try {
    [subs, associations, myWishes] = await Promise.all([
      callApi('getSubscriptions', { memberId: session.memberId }),
      callApi('getAssociations'),
      callApi('getWishes', { memberId: session.memberId }),
    ]);
  } catch (err) {
    content.innerHTML = '<p class="table-empty">' + err.message + '</p>';
    return;
  }
  const mine = associations
    .filter(a => subs.some(s => s.assocId === a.id))
    .map(a => ({ ...a, sub: subs.find(s => s.assocId === a.id) }));

  const FILTERS = [
    { id: 'all', label: 'الكل' },
    { id: 'نشطة', label: 'نشطة' },
    { id: 'جديدة', label: 'جديدة' },
    { id: 'منتهية', label: 'منتهية' },
  ];
  content.innerHTML =
    '<div class="section-title mt-16">الفئات — جمعياتي حسب الحالة</div>' +
    '<div class="tabs" id="cat-filter-tabs">' + FILTERS.map(f => '<button class="tab-btn" data-f="' + f.id + '">' + f.label + '</button>').join('') + '</div>' +
    '<div class="grid grid-2 mt-16" id="cat-assoc-list"></div>';

  const tabsEl = content.querySelector('#cat-filter-tabs');
  const listEl = content.querySelector('#cat-assoc-list');
  function renderFiltered(filterId) {
    tabsEl.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.f === filterId));
    const filtered = filterId === 'all' ? mine : mine.filter(a => a.status === filterId);
    listEl.innerHTML = '';
    if (filtered.length === 0) { listEl.innerHTML = '<p class="table-empty">لا توجد جمعيات في هذه الفئة</p>'; return; }
    filtered.forEach(a => listEl.appendChild(buildMemberAssocCardEl(a, myWishes, content, session)));
  }
  tabsEl.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => renderFiltered(b.dataset.f)));
  renderFiltered('all');
}

// تبويب "الملف الشخصي" (شريط سفلي جديد بلوحة العضو) — يجمع بيانات الملف + إدارة الأجهزة + تسجيل
// الخروج في مكان واحد، بدل تفرّقها بالصفحة الرئيسية — بلا أي بيانات جديدة، إعادة تنظيم بصري فقط
async function renderMemberProfileView(content, session, onLogout) {
  content.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  let members;
  try { members = await callApi('getMembers'); } catch (err) {
    content.innerHTML = '<p class="table-empty">' + err.message + '</p>';
    return;
  }
  const me = members.find(m => m.id === session.memberId);

  content.innerHTML =
    '<div class="mpc-block mt-16">' +
      '<div class="mpc-header">' +
        '<div class="mpc-avatar">' + (session.memberName ? session.memberName.trim().charAt(0) : '؟') + '</div>' +
        '<div class="mpc-name">' + session.memberName + '</div>' +
        (me ? '<div class="mpc-phone">📱 ' + formatPhoneDisplay(me.phone) + '</div>' : '') +
      '</div>' +
      (me && me.notes ? '<div class="mpc-body"><div class="member-note-banner">ملاحظة من المدير: ' + escapeHtml(me.notes) + '</div></div>' : '') +
    '</div>' +
    navCardHtml('nav-devices', '📱', 'أجهزتي',
      '<p class="form-hint" style="margin:0">ربط بصمة جهاز جديد، وإدارة الأجهزة المرتبطة بحسابك</p>', 'accent-indigo') +
    '<button class="btn btn-outline btn-block mt-16" id="profile-logout-btn">تسجيل الخروج</button>';

  wireDevicesCard(content, session, me, null);
  content.querySelector('#profile-logout-btn').addEventListener('click', onLogout);
}

// يربط ضغطة بطاقة "أجهزتي" — يجلب أجهزة العضو الحالي (محمي بتذكرة الهوية على الخادم، انظر
// gas/Devices.gs: getMemberDevices) ويعرضها في نافذة منبثقة موحَّدة تضم أيضاً ربط بصمة هذا الجهاز
function wireDevicesCard(content, session, me, isStale) {
  const card = content.querySelector('#nav-devices');
  if (!card) return;
  card.addEventListener('click', withCardLoading(card, async () => {
    let devices;
    try {
      devices = await callApi('getMemberDevices', { memberId: session.memberId });
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }
    openDevicesModal(content, session, me, devices, isStale);
  }));
}

function openDevicesModal(content, session, me, devices, isStale) {
  openModal({
    title: '📱 أجهزتي',
    bodyHtml: '<div id="link-device-section"></div><div id="devices-list"></div>',
    onMount: () => {
      renderLinkDeviceSection(document.getElementById('link-device-section'), content, session, me, isStale, devices);
      renderDevicesList(document.getElementById('devices-list'), session, devices, content, me, isStale);
    },
  });
}

// قسم "ربط بصمة هذا الجهاز" أعلى نافذة "أجهزتي" مباشرة — بديل بطاقة منفصلة كانت بالصفحة الرئيسية
// تخدم نفس الغرض عملياً (كلتاهما بصمة الجهاز)، فدُمجتا هنا في مدخل واحد. لا يظهر إطلاقاً إن كان
// هذا المتصفح لا يدعم WebAuthn أصلاً — لا معنى لعرض خيار سيفشل حتماً. إن كانت مرتبطة أصلاً يُكتفى
// بسطر تأكيد بلا زر (لا إعادة تسجيل غير ضرورية تُنشئ صفّ جهاز مكرَّراً في قاعدة البيانات بلا داعٍ)
// devices (اختياري): قائمة أجهزة العضو الحقيقية من الخادم إن كانت متوفرة عند الاستدعاء — تُستخدَم
// لتصحيح العلم المحلي ذاتياً إن بقي عالقاً على "مرتبطة" من جلسة سابقة رغم إلغاء آخر جهاز نشط فعلياً
// (مثلاً قبل إضافة هذا التصحيح) بدل تصديقه أعمى وإخفاء زر الربط للأبد رغم عدم وجود أي بصمة فعلية
function renderLinkDeviceSection(el, content, session, me, isStale, devices) {
  if (!isWebAuthnSupported()) { el.innerHTML = ''; return; }
  const bioMeta = BIOMETRIC_META[guessBiometricKind()];

  if (Array.isArray(devices) && !devices.some(d => d.status === 'نشط')) {
    clearDeviceBiometricLink();
  }

  if (deviceHasBiometricLinked()) {
    el.innerHTML =
      '<div class="flex-between" style="margin-bottom:16px;padding:12px 16px;background:var(--success-soft);border-radius:var(--radius-sm)">' +
        '<span style="font-size:12.5px;font-weight:700;color:var(--success)">بصمة هذا الجهاز مرتبطة</span>' +
        '<span class="badge badge-success">✓</span>' +
      '</div>';
    return;
  }

  el.innerHTML =
    '<button class="btn btn-gold btn-block" id="link-device-btn">' + bioMeta.link + '</button>' +
    '<p class="form-hint" style="margin:8px 0 16px">دخول أسرع من المرة القادمة بلا حاجة لإدخال رقم الجوال</p>';

  const btn = el.querySelector('#link-device-btn');
  btn.addEventListener('click', withButtonLoading(btn, async () => {
    if (!me) { showToast('تعذّر تحديد رقم جوالك، أعد تحميل الصفحة وحاول مرة أخرى', 'error'); return; }

    let begin;
    try {
      begin = await callApi('beginDeviceRegistration', {});
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }

    let reg;
    try {
      reg = await registerDeviceCredential({
        challenge: begin.challenge, memberId: begin.memberId, memberName: begin.memberName,
        rpId: RP_ID, rpName: RP_NAME,
      });
    } catch (err) {
      // نفس التصنيف الموحَّد المستخدَم بصفحة الدخول (services/webauthn.js) — رسالة عربية مفهومة
      // بدل نص المتصفح الخام، ومطابقة حرفياً بين كل موضع يظهر فيه خيار البصمة بالموقع
      showToast(describeWebAuthnError(err, 'register'), 'error');
      return;
    }

    try {
      await callApi('completeDeviceRegistration', {
        memberId: begin.memberId, deviceName: guessDeviceName(),
        clientDataJSON: reg.clientDataJSON, attestationObject: reg.attestationObject,
      });
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }

    markDeviceBiometricLinked();
    showToast('تم ربط بصمة جهازك بنجاح', 'success');
    // تحديث النافذة المفتوحة نفسها فوراً (يتحوّل هذا القسم لحالة "مرتبطة ✓" وتظهر قائمة الأجهزة
    // الجهاز الجديد) بدل إغلاقها أو إعادة تحميل الصفحة كاملة خلفها
    renderLinkDeviceSection(el, content, session, me, isStale);
    const listEl = document.getElementById('devices-list');
    if (listEl) {
      try {
        const refreshed = await callApi('getMemberDevices', { memberId: session.memberId });
        renderDevicesList(listEl, session, refreshed, content, me, isStale);
      } catch (err) { /* القائمة تبقى بحالتها القديمة إن فشل التحديث — الربط نفسه نجح فعلاً */ }
    }
  }));
}

// كل جهاز ببطاقة مستقلة: اسمه، تاريخ ربطه وآخر استخدام، وزر إلغاء لأي جهاز لا يزال نشطاً فقط
// (جهاز مُلغى مسبقاً يظهر للتوثيق بلا زر — لا حذف فعلي للصف أبداً، سلامة بيانات)
// المعاملات الأخيرة (content, me, isStale) اختيارية — تُمرَّر فقط عند الاستدعاء من داخل نافذة
// "أجهزتي" (حيث قسم "ربط جهاز" ظاهر بجانب القائمة) لإعادة رسمه فوراً إذا صار العضو بلا أي جهاز
// نشط بعد الإلغاء؛ بدونها كانت العلم المحلي "مرتبطة بالفعل" يبقى عالقاً للأبد بعد إلغاء آخر جهاز،
// فيختفي زر "ربط جهاز جديد" نهائياً رغم عدم وجود أي بصمة فعلية مرتبطة بعد الآن.
function renderDevicesList(container, session, devices, content, me, isStale) {
  if (!devices.length) {
    container.innerHTML = '<p class="table-empty">لا توجد أجهزة مرتبطة بعد</p>';
    return;
  }
  container.innerHTML = '';
  devices.slice().sort((a, b) => new Date(b.linkedDate) - new Date(a.linkedDate)).forEach(d => {
    const active = d.status === 'نشط';
    const row = document.createElement('div');
    row.className = 'card mt-16';
    row.innerHTML =
      '<div class="flex-between">' +
        '<div class="nav-card-title">' + escapeHtml(d.deviceName) + '</div>' +
        '<span class="badge badge-' + (active ? 'success' : 'gray') + '">' + d.status + '</span>' +
      '</div>' +
      '<div class="assoc-meta mt-16">' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">تاريخ الربط</div><div class="assoc-meta-val">' + (d.linkedDate ? new Date(d.linkedDate).toLocaleDateString('en-GB') : '—') + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">آخر استخدام</div><div class="assoc-meta-val">' + (d.lastUsed ? new Date(d.lastUsed).toLocaleDateString('en-GB') : '—') + '</div></div>' +
      '</div>' +
      (active ? '<button class="btn btn-outline btn-block mt-16 revoke-device-btn">إلغاء هذا الجهاز</button>' : '');

    if (active) {
      const revokeBtn = row.querySelector('.revoke-device-btn');
      revokeBtn.addEventListener('click', withButtonLoading(revokeBtn, async () => {
        try {
          await callApi('revokeDevice', { deviceId: d.id });
        } catch (err) {
          showToast(err.message, 'error');
          return;
        }
        showToast('تم إلغاء الجهاز', 'success');
        let refreshed;
        try {
          refreshed = await callApi('getMemberDevices', { memberId: session.memberId });
        } catch (err) {
          return; // النافذة تبقى بحالتها القديمة إن فشل التحديث — لا خطأ فادح، الإلغاء نفسه نجح فعلاً
        }
        // لم يعد للعضو أي جهاز نشط — نمسح العلم المحلي "مرتبطة بالفعل" فوراً ونعيد رسم قسم الربط
        // بجانب القائمة، حتى يظهر زر "ربط جهاز جديد" مباشرة بلا حاجة لإغلاق النافذة أو إعادة تحميل الصفحة
        if (!refreshed.some(x => x.status === 'نشط')) {
          clearDeviceBiometricLink();
          const linkSection = document.getElementById('link-device-section');
          if (linkSection && content) renderLinkDeviceSection(linkSection, content, session, me, isStale);
        }
        renderDevicesList(container, session, refreshed, content, me, isStale);
      }));
    }
    container.appendChild(row);
  });
}

// بطاقات الجمعيات "الجديدة" المتاحة للاشتراك الذاتي — كل بطاقة بها زر يفتح نافذة إدخال عدد الأسهم
function renderAvailableAssociations(content, session, available) {
  const container = content.querySelector('#available-assoc-list');
  if (!container) return;
  available.forEach(a => {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML =
      '<div class="assoc-name">' + a.name + '</div>' +
      '<div class="assoc-meta">' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">قيمة السهم</div><div class="assoc-meta-val">' + formatCurrency(a.shareValue) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">المدة</div><div class="assoc-meta-val">' + formatNumber(a.duration) + ' شهر</div></div>' +
      '</div>' +
      '<button class="btn btn-gold btn-block mt-16 subscribe-self-btn">اشترك الآن</button>';
    el.querySelector('.subscribe-self-btn').addEventListener('click', () => openSubscribeSelfModal(content, session, a));
    container.appendChild(el);
  });
}

// نافذة الاشتراك الذاتي — نفس نمط نافذة "إضافة اشتراك" بلوحة المدير (AdminDashboard.js) حرفياً
function openSubscribeSelfModal(content, session, assoc) {
  openModal({
    title: 'الاشتراك في ' + assoc.name,
    bodyHtml:
      '<div class="form-group"><label class="form-label">عدد الأسهم</label>' +
      '<input id="self-sub-shares" class="form-control" inputmode="decimal" placeholder="مثال: 2" /></div>' +
      '<div class="form-error hidden" id="self-sub-error"></div>' +
      '<button class="btn btn-gold btn-block" id="self-sub-save">اشترك</button>',
    onMount: (modal) => {
      bindDigitNormalization(modal.querySelector('#self-sub-shares'));
      const saveBtn = modal.querySelector('#self-sub-save');
      saveBtn.addEventListener('click', withButtonLoading(saveBtn, async () => {
        const errEl = modal.querySelector('#self-sub-error');
        errEl.classList.add('hidden');
        const shares = normalizeDigits(modal.querySelector('#self-sub-shares').value);
        if (!isValidSharesCount(shares)) {
          errEl.textContent = 'عدد الأسهم يجب أن يكون 0.5 على الأقل وبمضاعفات نصف سهم';
          errEl.classList.remove('hidden');
          return;
        }
        try {
          await callApi('subscribeSelf', { assocId: assoc.id, memberId: session.memberId, sharesCount: shares });
          closeModal();
          showToast('تم الاشتراك بنجاح — اختر الآن شهر استلامك', 'success');
          // انتقال مباشر لتفصيل الجمعية (بدل العودة لقائمة "جمعياتي" فقط) — حتى يصل العضو لبطاقة
          // "وزّع أسهمك على شهر الاستلام" فوراً، بدل أن يبحث بنفسه عن الجمعية الجديدة بين بطاقاته
          // ويدخلها يدوياً ليكتشف أن اختيار الرغبات موجود أصلاً (كان الالتباس هنا اكتشافياً لا برمجياً)
          showAssociationDetail(content, session, { ...assoc, sub: { sharesCount: Number(shares) } });
        } catch (err) {
          errEl.textContent = err.message;
          errEl.classList.remove('hidden');
        }
      }));
    },
  });
}

// شاشة تفصيل الجمعية — أصبحت "مركزاً" (Hub) مختصراً: بطاقة معلومات أساسية + تقدّم زمني بارز فقط،
// تليها 3 بطاقات تنقّل (وليس محتوى كامل مباشرة) تفتح كل منها شاشة متخصصة (نافذة منبثقة) عند الحاجة —
// بدل عرض كل الجداول والتفاصيل دفعة واحدة في صفحة طويلة يجب التمرير فيها بالكامل.
async function showAssociationDetail(content, session, assoc) {
  content.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  let months, wishes, collectionRows, deliveryRows;
  try {
    [months, wishes, collectionRows, deliveryRows] = await Promise.all([
      callApi('getMonthsWithTotals', { assocId: assoc.id }),
      callApi('getWishes', { assocId: assoc.id, memberId: session.memberId }),
      callApi('getMemberCollectionRows', { assocId: assoc.id, memberId: session.memberId }),
      callApi('getMemberDeliveryRows', { assocId: assoc.id, memberId: session.memberId }),
    ]);
  } catch (err) {
    content.innerHTML = '<p class="table-empty">' + err.message + '</p>';
    return;
  }

  const mySharesTotal = assoc.sub.sharesCount;
  const myWishedTotal = wishes.reduce((s, w) => s + Number(w.sharesCount), 0);
  const mySharesLeft = Math.max(0, mySharesTotal - myWishedTotal);
  const wishedPercent = mySharesTotal > 0 ? Math.min(100, Math.round((myWishedTotal / mySharesTotal) * 100)) : 0;
  const prog = computeDurationProgress(assoc.startDate, assoc.endDate, assoc.duration);
  const daysToStart = daysUntil(assoc.startDate);
  const notStartedYet = daysToStart !== null && daysToStart > 0;
  const currentMonthNum = Math.min(assoc.duration, prog.elapsedMonths + 1);
  const monthDateByNum = new Map(months.map(m => [Number(m.monthNum), m.date]));

  const collectedCount = collectionRows.filter(r => r.collected).length;
  const collectionTotalCount = collectionRows.length;
  const collectionPendingCount = collectionTotalCount - collectedCount;

  // شارة إلحاح لمعاينة بطاقة "أشهر استلامي المحدَّدة" — تُظهر فوراً هل يوجد شهر مستحق الآن أو قريب
  // (خلال 30 يوماً) دون فتح البطاقة، لجعل المعلومة الأهم واضحة على البطاقة نفسها كما طُلب
  let deliveryUrgencyBadge = '';
  if (deliveryRows.length) {
    const pendingDaysList = deliveryRows.filter(r => !r.delivered).map(r => daysUntil(monthDateByNum.get(Number(r.monthNum))));
    if (pendingDaysList.some(d => d === null || d <= 0)) deliveryUrgencyBadge = '<span class="badge badge-danger">⏰ يوجد شهر مستحق الآن</span>';
    else if (pendingDaysList.some(d => d !== null && d <= 30)) deliveryUrgencyBadge = '<span class="badge badge-gold">⏰ خلال 30 يوماً</span>';
  }

  content.innerHTML =
    '<button class="btn btn-outline btn-sm" id="back-to-list">→ رجوع للجمعيات</button>' +

    // ١) البطاقة الأساسية — معلومات ثابتة + مؤشر تقدّم الجمعية الزمني فقط (العنصر الأهم بصرياً هنا)
    '<div class="card mt-16">' +
      '<div class="flex-between">' +
        '<div class="assoc-name">🏠 ' + assoc.name + '</div>' +
        '<span class="badge badge-' + (assoc.status === 'نشطة' ? 'success' : assoc.status === 'منتهية' ? 'gray' : 'gold') + '">' + STATUS_LABEL[assoc.status] + '</span>' +
      '</div>' +
      '<div class="assoc-meta mt-16">' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">أسهمي في الجمعية</div><div class="assoc-meta-val">' + formatNumber(mySharesTotal) + ' سهم</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">قيمة السهم</div><div class="assoc-meta-val">' + formatCurrency(assoc.shareValue) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">الشهر الحالي</div><div class="assoc-meta-val">' + (notStartedYet ? '—' : formatNumber(currentMonthNum) + ' / ' + formatNumber(assoc.duration)) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">إجمالي استحقاقي</div><div class="assoc-meta-val">' + formatCurrency(mySharesTotal * assoc.shareValue * assoc.duration) + '</div></div>' +
      '</div>' +
      '<div class="progress-wrap primary mt-16">' + renderProgressBarHtml(prog.percent) +
        '<div class="progress-label">' + (notStartedYet
          ? '<span>لم تبدأ بعد</span><span>تبدأ خلال ' + formatNumber(daysToStart) + ' يوم</span>'
          : '<span>تقدّم الجمعية الزمني — ' + prog.percent + '٪</span><span>' + formatNumber(prog.remainingDays) + ' يوم متبقٍ</span>') + '</div></div>' +
    '</div>' +

    // ٢) بطاقة تنقّل: أشهر استلامي المحدَّدة — أقرب بطاقة عملياً (شارة إلحاح + عدد الأشهر واضحان
    // مباشرة على البطاقة دون الحاجة لفتحها) — شريط أخضر مميِّز
    (deliveryRows.length ? navCardHtml('nav-delivery', '🗓', 'أشهر استلامي المحدَّدة',
      '<div class="flex-between" style="margin-bottom:8px">' +
        '<span style="font-size:13px;font-weight:700">📅 ' + formatNumber(deliveryRows.length) + (deliveryRows.length === 1 ? ' شهر محدَّد للاستلام' : ' أشهر محدَّدة للاستلام') + '</span>' +
        deliveryUrgencyBadge +
      '</div>' +
      '<div class="progress-wrap secondary" style="margin-top:0">' + renderProgressBarHtml(wishedPercent, 'success') +
        '<div class="progress-label"><span>رغبات الاستلام المحدَّدة</span><span>' + formatNumber(myWishedTotal) + ' / ' + formatNumber(mySharesTotal) + ' سهم</span></div></div>',
      'accent-success'
    ) : '') +

    // ٣) بطاقة تنقّل: حالة التحصيل الشهري — ملخص مضغوط (عدد/ألوان) بدل الجدول كاملاً — شريط نيلي مميِّز
    (collectionTotalCount ? navCardHtml('nav-collection', '💰', 'حالة التحصيل الشهري',
      '<div style="font-size:13px;font-weight:700;margin-bottom:8px">' + formatNumber(collectedCount) + ' / ' + formatNumber(collectionTotalCount) + ' أشهر تم تحصيلها</div>' +
      '<span class="badge badge-success">🟢 ' + formatNumber(collectedCount) + ' تم التحصيل</span> ' +
      '<span class="badge badge-warning">🟡 ' + formatNumber(collectionPendingCount) + ' بانتظار التحصيل</span>',
      'accent-indigo'
    ) : '') +

    // ٤) بطاقة تنقّل: منتقي أشهر الرغبات (إجراء اختياري وليس حالة يومية، فآخر بطاقة) — شريط ذهبي مميِّز
    navCardHtml('nav-wishes', '🎯', 'وزّع أسهمك على شهر الاستلام',
      '<p class="form-hint" style="margin:0">اختر شهراً لتحديد كم سهماً تريد استلام قيمته فيه</p>', 'accent-gold');

  content.querySelector('#back-to-list').addEventListener('click', () => renderMemberAssociationsView(content, session));

  const existingWishByMonth = new Map(wishes.map(w => [Number(w.monthNum), w]));
  content.querySelector('#nav-wishes').addEventListener('click', () => {
    openModal({
      title: 'وزّع أسهمك على شهر الاستلام',
      bodyHtml: '<div id="wish-picker"></div>',
      onMount: () => {
        renderWishMonthPicker(document.getElementById('wish-picker'), {
          assoc, months, memberSharesLeft: mySharesLeft, existingWishByMonth,
          onSelect: (month, existingWish) => openWishModal(content, session, assoc, month, existingWish, mySharesLeft),
        });
      },
    });
  });

  const navDelivery = content.querySelector('#nav-delivery');
  if (navDelivery) navDelivery.addEventListener('click', () => openDeliveryListModal(assoc, deliveryRows, monthDateByNum));

  const navCollection = content.querySelector('#nav-collection');
  if (navCollection) navCollection.addEventListener('click', () => openCollectionTableModal(collectionRows));
}

// شاشة "أشهر استلامي المحدَّدة" الكاملة — دائرة رقم ملوّنة حسب الإلحاح (منجَز أخضر / هذا الشهر أو
// متأخر أحمر / قريب خلال 30 يوماً ذهبي / بعيد محايد) + شارة عدّ تنازلي بالأيام
function openDeliveryListModal(assoc, deliveryRows, monthDateByNum) {
  openModal({
    title: '🗓 أشهر استلامي المحدَّدة — ' + assoc.name,
    bodyHtml: '<div class="mpc-delivery-list" id="del-list"></div>',
    onMount: () => {
      const delList = document.getElementById('del-list');
      deliveryRows.slice().sort((a, b) => a.monthNum - b.monthNum).forEach(r => {
        let state = '';
        let countdownClass = '';
        let countdownText;
        if (r.delivered) {
          state = 'state-done'; countdownClass = 'done';
          countdownText = '✓ تم' + (r.confirmDate ? ' — ' + new Date(r.confirmDate).toLocaleDateString('en-GB') : '');
        } else {
          const d = daysUntil(monthDateByNum.get(Number(r.monthNum)));
          if (d === null || d <= 0) { state = 'state-current'; countdownClass = 'urgent'; countdownText = 'هذا الشهر'; }
          else if (d <= 30) { state = 'state-soon'; countdownClass = 'soon'; countdownText = 'بعد ' + formatNumber(d) + ' يوم'; }
          else { countdownText = 'بعد ' + formatNumber(d) + ' يوم'; }
        }

        const row = document.createElement('div');
        row.className = 'mpc-delivery-row ' + state;
        row.innerHTML =
          '<div class="mpc-delivery-month">' + formatNumber(r.monthNum) + '</div>' +
          '<div class="mpc-delivery-info">' +
            '<div class="mpc-delivery-shares">' + formatNumber(r.sharesCount) + ' سهم</div>' +
            '<div class="mpc-delivery-value">' + formatCurrency(r.deliveryValue) + '</div>' +
          '</div>' +
          '<div class="mpc-delivery-countdown ' + countdownClass + '">' + countdownText + '</div>';
        delList.appendChild(row);
      });
    },
  });
}

// شاشة "حالة التحصيل الشهري" الكاملة — الجدول التفصيلي بكل شهر وتاريخه وحالته
function openCollectionTableModal(collectionRows) {
  openModal({
    title: '💰 حالة التحصيل الشهري',
    bodyHtml: '<div class="table-wrap"><table><thead><tr><th>الشهر</th><th>التاريخ</th><th>القيمة</th><th>الحالة</th></tr></thead><tbody id="coll-body"></tbody></table></div>',
    onMount: () => {
      const collBody = document.getElementById('coll-body');
      if (collectionRows.length === 0) {
        collBody.innerHTML = '<tr><td colspan="4" class="table-empty">لا توجد سجلات بعد</td></tr>';
        return;
      }
      collectionRows.slice().sort((a, b) => a.monthNum - b.monthNum).forEach(r => {
        collBody.innerHTML +=
          '<tr><td>' + formatNumber(r.monthNum) + '</td><td>' + (r.confirmDate ? new Date(r.confirmDate).toLocaleDateString('en-GB') : '—') + '</td>' +
          '<td>' + formatCurrency(r.sharesValue) + '</td>' +
          '<td><span class="badge badge-' + (r.collected ? 'success' : 'warning') + '">' + (r.collected ? 'تم التحصيل' : 'بانتظار التحصيل') + '</span></td></tr>';
      });
    },
  });
}

function openWishModal(content, session, assoc, month, existingWish, mySharesLeft) {
  const maxAllowed = mySharesLeft + Number(existingWish ? existingWish.sharesCount : 0);
  openModal({
    title: 'رغبة الشهر ' + month.monthNum,
    bodyHtml:
      '<p class="form-hint" style="margin-bottom:14px">المتاح لهذا الشهر: ' + formatCurrency(month.remainRiyal + (existingWish ? Number(existingWish.sharesCount) * assoc.shareValue * assoc.duration : 0)) + '. أسهمك المتاحة للتوزيع: ' + formatNumber(maxAllowed) + '</p>' +
      '<div class="form-group"><label class="form-label">عدد الأسهم (0 للإلغاء)</label>' +
      '<input id="wish-shares-input" class="form-control" inputmode="decimal" value="' + (existingWish ? existingWish.sharesCount : '') + '" placeholder="مثال: 2.5" /></div>' +
      '<div class="form-error hidden" id="wish-error"></div>' +
      '<button class="btn btn-gold btn-block mt-16" id="wish-save-btn">حفظ</button>',
    onMount: (modal) => {
      const input = modal.querySelector('#wish-shares-input');
      bindDigitNormalization(input);
      const saveBtn = modal.querySelector('#wish-save-btn');
      saveBtn.addEventListener('click', withButtonLoading(saveBtn, async () => {
        const val = parseFloat(normalizeDigits(input.value)) || 0;
        const errEl = modal.querySelector('#wish-error');
        errEl.classList.add('hidden');
        if (val > 0 && !isValidSharesCount(val)) {
          errEl.textContent = 'القيمة يجب أن تكون 0.5 على الأقل وبمضاعفات نصف سهم';
          errEl.classList.remove('hidden');
          return;
        }
        try {
          await callApi('saveWish', { assocId: assoc.id, memberId: session.memberId, memberName: session.memberName, monthNum: month.monthNum, sharesCount: val });
          closeModal();
          showToast('تم الحفظ بنجاح', 'success');
          showAssociationDetail(content, session, assoc);
        } catch (err) {
          errEl.textContent = err.message;
          errEl.classList.remove('hidden');
        }
      }));
    },
  });
}
