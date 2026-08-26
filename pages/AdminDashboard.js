// لوحة المدير — الإعدادات، الأعضاء، الجمعيات (اشتراكات/أشهر/رغبات)، والأرشيف
import { callApi } from '../services/api.js';
import { getIdentityToken } from '../services/auth.js';
import { renderAppHeader, wireHeaderEvents } from '../components/Header.js';
import { openModal, closeModal } from '../components/Modal.js';
import { showToast } from '../components/Toast.js';
import { formatCurrency, formatNumber, bindDigitNormalization, normalizeDigits } from '../utils/numbers.js';
import { renderDualDateHtml, formatDualDate, computeDurationProgress, computeMonthProgress, renderProgressBarHtml } from '../utils/dates.js';
import { buildFullPhone, extractLocalPart, formatPhoneDisplay, renderPhoneInputGroup, bindPhoneLocalInput } from '../utils/phone.js';
import { isValidSharesCount } from '../utils/validators.js';
import { withButtonLoading, withCardLoading } from '../components/Button.js';
import { fillTemplate, buildWhatsAppLink } from '../utils/template.js';
import { renderWishMonthPicker } from '../components/WishMonthPicker.js';
import { renderMemberAssociationsView } from './MemberDashboard.js';
import { renderBottomNavHtml, wireBottomNav, updateBottomNavActive } from '../components/BottomNav.js';
import { renderDonutHtml, renderLineChartHtml } from '../components/Charts.js';
import { ICONS } from '../utils/icons.js';

// المدير عضو في نفس النظام بنفس الوقت (رقم جواله مسجَّل كعضو أيضاً) — تبويب "جمعياتي" يتيح له
// الاشتراك واختيار رغباته الخاصة تماماً كأي عضو آخر، بجانب صلاحياته الإدارية في بقية التبويبات.
const TABS = [
  { id: 'overview', label: 'نظرة عامة' },
  { id: 'my-associations', label: 'جمعياتي' },
  { id: 'associations', label: 'إدارة الجمعيات' },
  { id: 'members', label: 'الأعضاء' },
  { id: 'settings', label: 'الإعدادات' },
  { id: 'archive', label: 'الأرشيف' },
];

// حارس تنقّل بين التبويبات — كل ضغطة تبويب تحمل رقماً تسلسلياً جديداً؛ كل دالة عرض غير متزامنة
// (تنتظر رد الخادم) تستقبل دالة isStale() وتتحقق منها قبل كتابة محتواها النهائي، وإلا تتجاهل
// نتيجتها بصمت. بدون هذا: ضغط تبويب "الجمعيات" ثم "نظرة عامة" بسرعة قد يجعل رد "الجمعيات" (أبطأ لأنه
// يحتاج طلبات شبكية أكثر) يصل متأخراً فيُكتب فوق محتوى "نظرة عامة" الصحيح المعروض فعلاً — وهذا بالضبط
// سبب ظهور تبويب غير الذي ضغطه المدير أحياناً
let activeTabToken_ = 0;

export async function renderAdminDashboard(root, { session, onLogout }) {
  // لا شريط جانبي ولا علوي بديل على أي حجم شاشة (بقرار محمد الصريح) — #admin-tabs يبقى مخفياً دائماً
  // (انظر styles/base.css)، والتنقّل الفعلي الوحيد هو الشريط السفلي الثابت (.bottom-nav) على كل الأحجام
  root.innerHTML = renderAppHeader({ memberName: session.memberName, isAdmin: true }) +
    '<div class="container admin-page-container" style="padding-top:22px">' +
      '<div class="tabs" id="admin-tabs"></div>' +
      '<div id="admin-content"></div>' +
    '</div>' +
    renderBottomNavHtml();
  wireHeaderEvents(root, onLogout);

  const tabsEl = root.querySelector('#admin-tabs');
  const content = root.querySelector('#admin-content');

  function activate(tabId) {
    const token = ++activeTabToken_;
    const isStale = () => token !== activeTabToken_;
    tabsEl.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    updateBottomNavActive(root, tabId);
    if (tabId === 'overview') showOverviewTab(content, activate, session, isStale);
    else if (tabId === 'my-associations') renderMemberAssociationsView(content, session, isStale);
    else if (tabId === 'settings') showSettingsTab(content, isStale);
    else if (tabId === 'members') showMembersTab(content, isStale);
    else if (tabId === 'associations') showAssociationsTab(content, session, isStale);
    else if (tabId === 'archive') showArchiveTab(content, isStale);
  }

  // #admin-tabs مخفي دائماً (لا شريط جانبي/علوي بديل) — يبقى فقط كحامل لحالة "التبويب النشط" الداخلية
  tabsEl.innerHTML = TABS.map(t => '<button class="tab-btn" data-tab="' + t.id + '">' + t.label + '</button>').join('');
  tabsEl.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => activate(b.dataset.tab)));
  wireBottomNav(root, activate);
  activate('overview');
}

/* ══════════════════ نظرة عامة ══════════════════ */
// بطاقة مؤشر متدرّجة صغيرة — أيقونة بيضاء شبه شفافة + رقم بارز + تسمية، تُبنى فوق .stat-card
// الموجودة أصلاً (blue/gold/green/purple + orange الجديد) بدل بطاقات مسطّحة بيضاء/سوداء بلا تمييز
function statCard(color, iconSvg, value, label, compactValue) {
  return (
    '<div class="stat-card ' + color + '">' +
      '<div style="color:#fff;opacity:.85">' + iconSvg + '</div>' +
      '<div class="n" style="margin-top:8px' + (compactValue ? ';font-size:15px' : '') + '">' + value + '</div>' +
      '<div class="l">' + label + '</div>' +
    '</div>'
  );
}

// نسخة مصغَّرة من statCard — بلا أيقونة كبيرة، لعرض بطاقتين جنباً إلى جنب داخل خانة واحدة بالصف
// (بطاقتا "نشطة"/"جديدة" معاً بجانب بعضهما بدل بطاقة واحدة مدمَجة كانتا فيها بلا تمييز لوني حقيقي)
function miniStatCard(color, value, label) {
  return (
    '<div class="stat-card ' + color + '" style="padding:14px">' +
      '<div class="n" style="font-size:19px">' + value + '</div>' +
      '<div class="l">' + label + '</div>' +
    '</div>'
  );
}

// بطاقة "تقدّم الجمعية النشطة" — شريط تقدّم زمني + الأشهر المتبقية + الأيام المتبقية، كلها مجمَّعة
// في بطاقة واحدة بدل تفرّقها بين أماكن مختلفة، من computeDurationProgress الموجودة أصلاً
function buildProgressCardHtml(activeAssoc) {
  if (!activeAssoc) {
    return '<div class="card"><div class="card-title">' + ICONS.target + ' تقدّم الجمعية النشطة</div><p class="table-empty">لا توجد جمعية نشطة حالياً</p></div>';
  }
  const prog = computeDurationProgress(activeAssoc.startDate, activeAssoc.endDate, activeAssoc.duration);
  return (
    '<div class="card">' +
      '<div class="card-title">' + ICONS.target + ' تقدّم ' + activeAssoc.name + '</div>' +
      '<div class="progress-wrap primary">' + renderProgressBarHtml(prog.percent) +
        '<div class="progress-label"><span>مضى ' + formatNumber(prog.elapsedMonths) + ' من ' + formatNumber(activeAssoc.duration) + ' شهر</span><span>' + prog.percent + '٪</span></div>' +
      '</div>' +
      '<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">الأشهر المتبقية</div><div class="assoc-meta-val">' + formatNumber(prog.remainingMonths) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">الأيام المتبقية</div><div class="assoc-meta-val">' + formatNumber(prog.remainingDays) + '</div></div>' +
      '</div>' +
    '</div>'
  );
}

// قائمة أعضاء مشتركين فقط في جمعية معيّنة (باقي الأعضاء غير المشتركين فيها لا يظهرون هنا إطلاقاً) —
// من getSubscriptions({assocId}) الموجودة أصلاً، بلا أي دالة خادم جديدة
async function openSubscribedMembersModal(assoc, members) {
  let subs;
  try {
    subs = await callApi('getSubscriptions', { assocId: assoc.id });
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }
  const memberById = new Map(members.map(m => [m.id, m]));
  openModal({
    title: 'أعضاء المشتركين — ' + assoc.name,
    bodyHtml: subs.length === 0
      ? '<p class="table-empty">لا يوجد أعضاء مشتركون في هذه الجمعية بعد</p>'
      : '<div class="sub-member-list">' + subs.map(s => {
          const full = memberById.get(s.memberId);
          return (
            '<div class="sub-member-row">' +
              '<div><div class="name">' + s.memberName + '</div>' +
                '<div class="meta">' + (full ? formatPhoneDisplay(full.phone) : '') + '</div></div>' +
              '<div class="shares">' + formatNumber(s.sharesCount) + ' سهم</div>' +
            '</div>'
          );
        }).join('') + '</div>',
  });
}

// بطاقتا "الجمعية النشطة" (بأيقونة أعضاء مشتركين) و"الجمعية الجديدة" — الزوج الوحيد المتوقَّع عملياً
// في نفس الوقت (انظر تسلسل الحالات في MonthClosing.gs) — أي حالة استثنائية أكثر تبقى مرئية بالكامل
// من تبويب "إدارة الجمعيات" العادي بلا أي تغيير
function buildTwoAssocCardsHtml(activeAssoc, freshAssoc, activeSummary) {
  const activeCard = activeAssoc ? (
    '<div class="card" style="border-top:4px solid var(--success)">' +
      '<div class="flex-between">' +
        '<div class="card-title" style="margin:0">' + activeAssoc.name + '</div>' +
        '<div class="flex-between" style="gap:8px">' +
          '<button class="mini-icon-btn" id="ov-sub-members-btn" title="أعضاء المشتركين في الجمعية">' + ICONS.people + '</button>' +
          '<span class="badge badge-success">نشطة</span>' +
        '</div>' +
      '</div>' +
      '<div class="fin-summary mt-16">' +
        '<div class="fin-summary-card success"><div class="fin-summary-title"><span class="fin-dot"></span>تم</div>' +
          '<div class="fin-summary-cols">' +
            '<div class="fin-summary-col"><div class="fin-summary-label">تحصيل</div><div class="fin-summary-val">' + formatCurrency(activeSummary.collectionDone) + '</div></div>' +
            '<div class="fin-summary-col"><div class="fin-summary-label">تسليم</div><div class="fin-summary-val">' + formatCurrency(activeSummary.deliveryDone) + '</div></div>' +
          '</div></div>' +
        '<div class="fin-summary-card warning"><div class="fin-summary-title"><span class="fin-dot"></span>متبقٍ</div>' +
          '<div class="fin-summary-cols">' +
            '<div class="fin-summary-col"><div class="fin-summary-label">تحصيل</div><div class="fin-summary-val">' + formatCurrency(activeSummary.collectionRemaining) + '</div></div>' +
            '<div class="fin-summary-col"><div class="fin-summary-label">تسليم</div><div class="fin-summary-val">' + formatCurrency(activeSummary.deliveryRemaining) + '</div></div>' +
          '</div></div>' +
      '</div>' +
    '</div>'
  ) : '<div class="card"><div class="card-title">الجمعية النشطة</div><p class="table-empty">لا توجد جمعية نشطة حالياً</p></div>';

  const freshCard = freshAssoc ? (
    '<div class="card" style="border-top:4px solid var(--gold)">' +
      '<div class="flex-between"><div class="card-title" style="margin:0">' + freshAssoc.name + '</div><span class="badge badge-gold">جديدة</span></div>' +
      '<div class="assoc-meta mt-16">' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">المشتركون</div><div class="assoc-meta-val">' + formatNumber(freshAssoc.memberCount) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">قيمة السهم</div><div class="assoc-meta-val">' + formatCurrency(freshAssoc.shareValue) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">المدة</div><div class="assoc-meta-val">' + freshAssoc.duration + ' شهر</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">تاريخ البداية</div><div class="assoc-meta-val" style="font-size:11px">' + formatDualDate(freshAssoc.startDate).gregorian + '</div></div>' +
      '</div>' +
    '</div>'
  ) : (
    '<div class="card text-center"><div class="card-title">الجمعية الجديدة</div>' +
      '<p style="color:var(--text-3);margin-bottom:12px">لا توجد جمعية جديدة قيد التجهيز حالياً</p>' +
      '<button class="btn btn-gold btn-sm" id="ov-create-fresh-btn">+ إنشاء جمعية جديدة</button></div>'
  );

  return '<div class="section-title">نظرة على الجمعيتين</div><div class="grid-2-fixed" style="margin-bottom:18px">' + activeCard + freshCard + '</div>';
}

function renderActivityFeedHtml(activity) {
  if (!activity || activity.length === 0) return '<p class="table-empty">لا توجد أنشطة مسجَّلة بعد</p>';
  return activity.map(e =>
    '<div class="activity-row"><span class="dot"></span><span class="txt">' + e.text + '</span>' +
      '<span class="time">' + formatDualDate(e.date).gregorian + '</span></div>'
  ).join('');
}

async function showOverviewTab(content, activate, session, isStale) {
  content.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  // نداء واحد لحزمة "نظرة عامة" (كما كان)، ثم نداءان إضافيان اختياريان فقط عند وجود جمعية نشطة
  // (رسمَي أداء التحصيل/التسليم وتوزيع الرغبات يخصّان الجمعية النشطة تحديداً) — لا نداء جديد على
  // الخادم بالمعنى الحرفي: الثلاثة (getMonthsWithTotals/getMonthsConfirmationSummary/getRecentActivity)
  // دوال موجودة أصلاً أو مضافة بشكل حيادي بحت (انظر gas/Activity.gs)
  let bundle;
  try {
    bundle = await callApi('getOverviewBundle');
  } catch (err) {
    if (isStale && isStale()) return;
    content.innerHTML = '<p class="table-empty">' + err.message + '</p>';
    return;
  }
  if (isStale && isStale()) return;

  // monthTotals/confirmSummary/activity كلها الآن جزء من نفس حزمة getOverviewBundle (رحلة شبكة
  // واحدة فقط) بدل 3 رحلات إضافية متزامنة كانت السبب المباشر في تأخير فتح "نظرة عامة" لدقائق —
  // انظر gas/Associations.gs
  const { associations, members, summaryByAssoc, monthTotals, confirmSummary, activity } = bundle;
  const activeAssociations = associations.filter(a => a.status !== 'منتهية');
  const activeMembers = members.filter(m => m.status === 'نشط');
  const activeAssoc = associations.find(a => a.status === 'نشطة') || null;
  const freshAssoc = associations.find(a => a.status === 'جديدة') || null;
  const activeSummary = activeAssoc ? summaryByAssoc[activeAssoc.id] : null;

  const combinedExpected = activeSummary ? activeSummary.collectionExpected + activeSummary.deliveryExpected : 0;
  const combinedDone = activeSummary ? activeSummary.collectionDone + activeSummary.deliveryDone : 0;
  const commitmentPercent = combinedExpected > 0 ? Math.round((combinedDone / combinedExpected) * 100) : 0;

  // رسم دائري: كم شهراً من مدة الجمعية النشطة له رغبات موزَّعة فعلاً (usedRiyal > 0) — من نفس بيانات
  // getMonthsWithTotals المستخدَمة أصلاً بشاشة "الأشهر"، لا حساب جديد منفصل
  const donutColors = ['var(--kpi-blue-1)', 'var(--kpi-green-1)', 'var(--kpi-purple-1)', 'var(--kpi-orange-1)', 'var(--kpi-gold-1)', 'var(--indigo-l)'];
  const donutSegments = monthTotals.slice().sort((a, b) => a.monthNum - b.monthNum).map((m, i) =>
    ({ label: 'شهر ' + formatNumber(m.monthNum), value: Number(m.usedRiyal) || 0, color: donutColors[i % donutColors.length] })
  );
  const monthsWithWishes = monthTotals.filter(m => Number(m.usedRiyal) > 0).length;
  const donutHtml = activeAssoc
    ? renderDonutHtml(donutSegments, formatNumber(monthsWithWishes), 'من ' + formatNumber(activeAssoc.duration) + ' أشهر لها رغبات موزَّعة')
    : '<p class="table-empty">لا توجد جمعية نشطة لعرض توزيع رغباتها</p>';

  // رسم خطي: تحصيل/تسليم "تم" فعلياً (تشيك بوكس مؤكَّد) لكل شهر من getMonthsConfirmationSummary
  // الموجودة أصلاً بشاشة "الأشهر" — بلا أي تجميع جديد عبر التقويم
  const lineLabels = monthTotals.map(m => formatNumber(m.monthNum));
  const lineHtml = activeAssoc && monthTotals.length ? renderLineChartHtml([
    { label: 'تحصيل', color: 'var(--indigo)', data: monthTotals.map(m => (confirmSummary[m.monthNum] || {}).collectionDone || 0) },
    { label: 'تسليم', color: 'var(--orange)', data: monthTotals.map(m => (confirmSummary[m.monthNum] || {}).deliveryDone || 0) },
  ], lineLabels) : '<p class="table-empty">لا يوجد أداء لعرضه بعد</p>';

  content.innerHTML =
    // ١) صف مؤشرات KPI — مرتَّبة كما طلب محمد بالضبط: الالتزام + التقدّم أعلى الصفحة، ثم صف
    // الجمعيات/الأعضاء، ثم صف التحصيل/التسليم. "نشطة"/"جديدة" الآن بطاقتان منفصلتان بلونين مختلفين
    // فعلياً (أخضر/ذهبي — نفس ألوان شارات نشطة/جديدة المستخدَمة في كل الموقع) بدل بطاقة مدمَجة واحدة
    '<div class="section-title">المؤشرات العامة</div>' +
    // ملاحظة مهمة: هذه الصفوف الأربعة تحمل بطاقتين ثابتتين بالضبط دائماً — استُخدم grid-2-fixed
    // (عمودان صريحان) بدل class="grid grid-2" (المصمَّمة لمعارض بطاقات بعدد متغيّر عبر auto-fill)
    // لأن auto-fill على شاشة عريضة يحجز أعمدة فارغة إضافية غير مستخدَمة، فتنحشر البطاقتان الفعليتان
    // في جهة واحدة (يمين الصفحة في RTL) ويبقى الجزء الآخر فارغاً تماماً — خلل ظهر فقط على الشاشات
    // الواسعة (الجوال يخفيه صدفةً لأن auto-fill ينهار لعمود واحد أصلاً هناك)
    '<div class="grid-2-fixed" style="margin-bottom:14px">' +
      statCard('orange', ICONS.target, commitmentPercent + '٪', 'مستوى الالتزام — الجمعية النشطة') +
      buildProgressCardHtml(activeAssoc) +
    '</div>' +
    '<div class="grid-2-fixed" style="margin-bottom:14px">' +
      '<div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">' +
        miniStatCard('green', formatNumber(activeAssociations.filter(a => a.status === 'نشطة').length), 'جمعية نشطة') +
        miniStatCard('gold', formatNumber(activeAssociations.filter(a => a.status === 'جديدة').length), 'جمعية جديدة') +
      '</div>' +
      statCard('blue', ICONS.people, formatNumber(activeMembers.length), 'الأعضاء النشطون') +
    '</div>' +
    '<div class="grid-2-fixed" style="margin-bottom:18px">' +
      statCard('green', ICONS.wallet, formatCurrency(activeSummary ? activeSummary.collectionDone : 0), 'إجمالي التحصيل — الجمعية النشطة') +
      statCard('purple', ICONS.handoff, formatCurrency(activeSummary ? activeSummary.deliveryDone : 0), 'إجمالي التسليم — الجمعية النشطة') +
    '</div>' +

    // ٢) رسمان بيانيان — توزيع الرغبات (دائري) وأداء التحصيل/التسليم (خطي)
    '<div class="grid-2-fixed" style="margin-bottom:18px">' +
      '<div class="card"><div class="card-title">' + ICONS.donut + ' توزيع الرغبات على الأشهر</div>' +
        '<p class="form-hint" style="margin:-8px 0 12px">القيمة لكل شهر = إجمالي مبلغ الاستلام الكامل للأعضاء المختارين لهذا الشهر (وليس تحصيل الشهر نفسه فقط) — لذا تختلف الأرقام غالباً عن مبلغ التحصيل الشهري العادي</p>' +
        donutHtml + '</div>' +
      '<div class="card"><div class="card-title">' + ICONS.chart + ' أداء التحصيل والتسليم</div>' + lineHtml + '</div>' +
    '</div>' +

    // ٣) إجراءات سريعة (كما كانت)
    '<div class="section-title">إجراءات سريعة</div>' +
    '<div class="quick-actions" style="margin-bottom:18px">' +
      '<button class="quick-action-btn" id="qa-create-assoc"><span class="qa-icon">' + ICONS.plus + '</span>إنشاء جمعية</button>' +
      '<button class="quick-action-btn" id="qa-add-member"><span class="qa-icon">' + ICONS.member + '</span>إضافة عضو</button>' +
      '<button class="quick-action-btn" id="qa-goto-assoc"><span class="qa-icon">' + ICONS.building + '</span>الجمعيات</button>' +
      '<button class="quick-action-btn" id="qa-goto-members"><span class="qa-icon">' + ICONS.people + '</span>الأعضاء</button>' +
    '</div>' +

    // ٤) الجمعية النشطة (بأيقونة أعضاء مشتركين) + الجمعية الجديدة
    buildTwoAssocCardsHtml(activeAssoc, freshAssoc, activeSummary) +

    // ٥) أحدث الأنشطة — حقيقية بالكامل من gas/Activity.gs
    '<div class="section-title">أحدث الأنشطة</div>' +
    '<div class="card" style="margin-bottom:18px"><div class="activity-feed">' + renderActivityFeedHtml(activity) + '</div></div>';

  content.querySelector('#qa-create-assoc').addEventListener('click', () => {
    activate('associations');
    openAddAssociationModal(() => showAssociationsTab(content, session));
  });
  content.querySelector('#qa-add-member').addEventListener('click', () => {
    activate('members');
    openAddMemberModal(() => showMembersTab(content));
  });
  content.querySelector('#qa-goto-assoc').addEventListener('click', () => activate('associations'));
  content.querySelector('#qa-goto-members').addEventListener('click', () => activate('members'));

  const subMembersBtn = content.querySelector('#ov-sub-members-btn');
  if (subMembersBtn) subMembersBtn.addEventListener('click', () => openSubscribedMembersModal(activeAssoc, members));
  const createFreshBtn = content.querySelector('#ov-create-fresh-btn');
  if (createFreshBtn) createFreshBtn.addEventListener('click', () => {
    activate('associations');
    openAddAssociationModal(() => showAssociationsTab(content, session));
  });
}

/* ══════════════════ الإعدادات ══════════════════ */
const MESSAGE_PLACEHOLDER_HINTS = {
  collection: '{الاسم} {عدد_الاسهم} {قيمة_التحصيل}',
  delivery: '{الاسم} {عدد_الاسهم} {رقم_الشهر} {التاريخ} {اسهم_التسليم} {المتبقي} {تاريخ_الوقت}',
};

async function showSettingsTab(content, isStale) {
  content.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  let s;
  try {
    s = await callApi('getSettings');
  } catch (err) {
    if (isStale && isStale()) return;
    content.innerHTML = '<p class="table-empty">' + err.message + '</p>';
    return;
  }
  if (isStale && isStale()) return;
  content.innerHTML =
    '<div class="card" style="max-width:520px">' +
      '<div class="card-title">الإعدادات العامة</div>' +
      '<div class="form-group"><label class="form-label">مدة الجمعية الافتراضية (أشهر)</label>' +
        '<input id="s-duration" class="form-control" inputmode="numeric" value="' + (s.defaultDuration || '') + '" /></div>' +
      '<div class="form-group"><label class="form-label">قيمة السهم الافتراضية (ريال)</label>' +
        '<input id="s-share" class="form-control" inputmode="decimal" value="' + (s.defaultShareValue || '') + '" /></div>' +
      '<div class="form-group"><label class="form-label">رقم جوال المدير</label>' +
        renderPhoneInputGroup('s-admin-phone', extractLocalPart(s.adminPhone)) +
        '<div class="form-hint">من يدخل بهذا الرقم تُفتح له لوحة المدير تلقائياً بعد نجاح مصادقة البصمة</div></div>' +
      '<div class="form-error hidden" id="s-error"></div>' +
      '<button class="btn btn-gold btn-block" id="s-save">حفظ الإعدادات</button>' +
    '</div>' +
    '<div class="card mt-16" style="max-width:520px">' +
      '<div class="card-title">نص رسالة واتساب — تأكيد التحصيل</div>' +
      '<div class="form-group"><textarea id="s-msg-collection" class="form-control" rows="6" style="font-family:inherit">' + s.collectionMessage + '</textarea>' +
        '<div class="form-hint">الرموز المتاحة: ' + MESSAGE_PLACEHOLDER_HINTS.collection + '</div></div>' +
    '</div>' +
    '<div class="card mt-16" style="max-width:520px">' +
      '<div class="card-title">نص رسالة واتساب — تأكيد التسليم</div>' +
      '<div class="form-group"><textarea id="s-msg-delivery" class="form-control" rows="8" style="font-family:inherit">' + s.deliveryMessage + '</textarea>' +
        '<div class="form-hint">الرموز المتاحة: ' + MESSAGE_PLACEHOLDER_HINTS.delivery + '</div></div>' +
      '<div class="form-error hidden" id="s-msg-error"></div>' +
      '<button class="btn btn-gold btn-block" id="s-msg-save">حفظ نصوص الرسائل</button>' +
    '</div>';

  [content.querySelector('#s-duration'), content.querySelector('#s-share')].forEach(bindDigitNormalization);
  bindPhoneLocalInput(content.querySelector('#s-admin-phone'));

  const sSaveBtn = content.querySelector('#s-save');
  sSaveBtn.addEventListener('click', withButtonLoading(sSaveBtn, async () => {
    const errEl = content.querySelector('#s-error');
    errEl.classList.add('hidden');
    const adminPhoneLocal = content.querySelector('#s-admin-phone').value;
    const adminPhone = adminPhoneLocal ? buildFullPhone(adminPhoneLocal) : '';
    if (adminPhoneLocal && !adminPhone) { errEl.textContent = 'رقم جوال المدير غير صالح — 9 أرقام تبدأ بـ5'; errEl.classList.remove('hidden'); return; }
    try {
      await callApi('updateSettings', {
        defaultDuration: content.querySelector('#s-duration').value,
        defaultShareValue: content.querySelector('#s-share').value,
        adminPhone: adminPhone,
        identityToken: getIdentityToken(),
      });
      showToast('تم حفظ الإعدادات', 'success');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  }));

  const sMsgSaveBtn = content.querySelector('#s-msg-save');
  sMsgSaveBtn.addEventListener('click', withButtonLoading(sMsgSaveBtn, async () => {
    const errEl = content.querySelector('#s-msg-error');
    errEl.classList.add('hidden');
    try {
      await callApi('updateSettings', {
        defaultDuration: s.defaultDuration,
        defaultShareValue: s.defaultShareValue,
        collectionMessage: content.querySelector('#s-msg-collection').value,
        deliveryMessage: content.querySelector('#s-msg-delivery').value,
        identityToken: getIdentityToken(),
      });
      showToast('تم حفظ نصوص الرسائل', 'success');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  }));
}

/* ══════════════════ الأعضاء ══════════════════ */
async function showMembersTab(content, isStale) {
  content.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  let members;
  try {
    members = await callApi('getMembers');
  } catch (err) {
    if (isStale && isStale()) return;
    content.innerHTML = '<p class="table-empty">' + err.message + '</p>';
    return;
  }
  if (isStale && isStale()) return;

  content.innerHTML =
    '<div class="flex-between mt-16" style="margin-bottom:16px">' +
      '<div class="section-title" style="margin:0">الأعضاء</div>' +
      '<button class="btn btn-gold btn-sm" id="add-member-btn">+ إضافة عضو</button>' +
    '</div>' +
    '<div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الجوال</th><th>الحالة</th><th>ملاحظات</th><th></th></tr></thead><tbody id="members-body"></tbody></table></div>';

  const body = content.querySelector('#members-body');
  if (members.length === 0) body.innerHTML = '<tr><td colspan="5" class="table-empty">لا يوجد أعضاء بعد</td></tr>';
  members.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + m.name + '</td><td>' + formatPhoneDisplay(m.phone) + '</td>' +
      '<td><span class="badge badge-' + (m.status === 'نشط' ? 'success' : 'danger') + '">' + m.status + '</span></td>' +
      '<td style="max-width:180px;white-space:normal">' + (m.notes ? m.notes : '<span style="color:var(--text-3)">—</span>') + '</td>' +
      '<td>' +
        '<button class="btn btn-outline btn-sm toggle-status-btn">' + (m.status === 'نشط' ? 'إيقاف' : 'تفعيل') + '</button> ' +
        '<button class="btn btn-outline btn-sm edit-note-btn">' + (m.notes ? 'تعديل الملاحظة' : '+ ملاحظة') + '</button>' +
      '</td>';
    const toggleBtn = tr.querySelector('.toggle-status-btn');
    toggleBtn.addEventListener('click', withButtonLoading(toggleBtn, async () => {
      await callApi('setMemberStatus', { memberId: m.id, status: m.status === 'نشط' ? 'موقوف' : 'نشط', identityToken: getIdentityToken() });
      showMembersTab(content);
    }));
    tr.querySelector('.edit-note-btn').addEventListener('click', () => openMemberNoteModal(m, () => showMembersTab(content)));
    body.appendChild(tr);
  });

  content.querySelector('#add-member-btn').addEventListener('click', () => openAddMemberModal(() => showMembersTab(content)));
}

// نافذة "إضافة عضو" مستقلة — تُستدعى من تبويب "الأعضاء" نفسه ومن "إجراءات سريعة" بنظرة عامة معاً
function openAddMemberModal(onDone) {
  openModal({
    title: 'إضافة عضو جديد',
    bodyHtml:
      '<div class="form-group"><label class="form-label">الاسم</label><input id="m-name" class="form-control" /></div>' +
      '<div class="form-group"><label class="form-label">رقم الجوال</label>' + renderPhoneInputGroup('m-phone') + '</div>' +
      '<div class="form-error hidden" id="m-error"></div>' +
      '<button class="btn btn-gold btn-block" id="m-save">إضافة</button>',
    onMount: (modal) => {
      bindPhoneLocalInput(modal.querySelector('#m-phone'));
      const saveBtn = modal.querySelector('#m-save');
      saveBtn.addEventListener('click', withButtonLoading(saveBtn, async () => {
        const errEl = modal.querySelector('#m-error');
        errEl.classList.add('hidden');
        const phone = buildFullPhone(modal.querySelector('#m-phone').value);
        if (!phone) { errEl.textContent = 'رقم الجوال غير صالح — 9 أرقام تبدأ بـ5'; errEl.classList.remove('hidden'); return; }
        try {
          await callApi('addMember', { name: modal.querySelector('#m-name').value, phone, identityToken: getIdentityToken() });
          closeModal();
          showToast('تمت إضافة العضو', 'success');
          onDone();
        } catch (err) {
          errEl.textContent = err.message;
          errEl.classList.remove('hidden');
        }
      }));
    },
  });
}

// ملاحظة المدير على عضو — نص حرّ للتذكير فقط، تظهر للعضو نفسه بلوحته (قراءة فقط) ولا تدخل في أي
// حساب تحصيل/تسليم/رغبات إطلاقاً — مثال: "المتبقي من تحصيل شهر 5 يُستلم يدوياً لاحقاً"
function openMemberNoteModal(member, onDone) {
  openModal({
    title: 'ملاحظة — ' + member.name,
    bodyHtml:
      '<p class="form-hint" style="margin-bottom:12px">تذكير نصّي يظهر للعضو في لوحته — لا يدخل في أي حساب أو منطق بالنظام</p>' +
      '<div class="form-group"><textarea id="note-text" class="form-control" rows="4" style="font-family:inherit" placeholder="مثال: المتبقي من تحصيل شهر 5 يُستلم يدوياً لاحقاً">' + (member.notes || '') + '</textarea></div>' +
      '<div class="form-error hidden" id="note-error"></div>' +
      '<div class="flex-between" style="gap:8px">' +
        (member.notes ? '<button class="btn btn-outline btn-block" id="note-clear">حذف الملاحظة</button>' : '') +
        '<button class="btn btn-gold btn-block" id="note-save">حفظ</button>' +
      '</div>',
    onMount: (modal) => {
      const errEl = modal.querySelector('#note-error');
      const saveBtn = modal.querySelector('#note-save');
      saveBtn.addEventListener('click', withButtonLoading(saveBtn, async () => {
        errEl.classList.add('hidden');
        try {
          await callApi('updateMember', { id: member.id, notes: modal.querySelector('#note-text').value, identityToken: getIdentityToken() });
          closeModal();
          showToast('تم حفظ الملاحظة', 'success');
          onDone();
        } catch (err) {
          errEl.textContent = err.message;
          errEl.classList.remove('hidden');
        }
      }));
      const clearBtn = modal.querySelector('#note-clear');
      if (clearBtn) clearBtn.addEventListener('click', withButtonLoading(clearBtn, async () => {
        try {
          await callApi('updateMember', { id: member.id, notes: '', identityToken: getIdentityToken() });
          closeModal();
          showToast('تم حذف الملاحظة', 'success');
          onDone();
        } catch (err) {
          errEl.textContent = err.message;
          errEl.classList.remove('hidden');
        }
      }));
    },
  });
}

/* ══════════════════ الجمعيات ══════════════════ */
async function showAssociationsTab(content, session, isStale) {
  content.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  let associations;
  try {
    associations = await callApi('getAssociations');
  } catch (err) {
    if (isStale && isStale()) return;
    content.innerHTML = '<p class="table-empty">' + err.message + '</p>';
    return;
  }
  if (isStale && isStale()) return;

  content.innerHTML =
    '<div class="flex-between mt-16" style="margin-bottom:16px">' +
      '<div class="section-title" style="margin:0">الجمعيات</div>' +
      '<button class="btn btn-gold btn-sm" id="add-assoc-btn">+ إنشاء جمعية</button>' +
    '</div>' +
    '<div class="grid grid-2" id="assoc-admin-list"></div>';

  const list = content.querySelector('#assoc-admin-list');
  if (associations.length === 0) list.innerHTML = '<p class="table-empty">لا توجد جمعيات بعد</p>';
  associations.forEach(a => {
    const prog = computeDurationProgress(a.startDate, a.endDate, a.duration);
    const el = document.createElement('div');
    el.className = 'assoc-card status-' + a.status;
    el.innerHTML =
      '<div class="flex-between"><div class="assoc-name">' + a.name + '</div><span class="badge badge-' + (a.status === 'نشطة' ? 'success' : a.status === 'منتهية' ? 'gray' : 'gold') + '">' + a.status + '</span></div>' +
      '<div class="assoc-meta">' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">المشتركون</div><div class="assoc-meta-val">' + formatNumber(a.memberCount) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">قيمة السهم</div><div class="assoc-meta-val">' + formatCurrency(a.shareValue) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">المدة</div><div class="assoc-meta-val">' + a.duration + ' شهر</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">التحصيل الشهري</div><div class="assoc-meta-val">' + formatCurrency(a.monthlyTotal) + '</div></div>' +
      '</div>' +
      (a.status !== 'منتهية' ? (
        '<div class="capacity-bar-wrap">' + renderProgressBarHtml(prog.percent) +
          '<div class="capacity-label"><span>مضى ' + formatNumber(prog.elapsedMonths) + ' شهر (' + prog.percent + '٪)</span>' +
          '<span>متبقٍ ' + formatNumber(prog.remainingMonths) + ' شهر / ' + formatNumber(prog.remainingDays) + ' يوم</span></div></div>'
      ) : '');
    el.addEventListener('click', withCardLoading(el, () => showAssociationAdminDetail(content, session, a)));
    list.appendChild(el);
  });

  content.querySelector('#add-assoc-btn').addEventListener('click', () => openAddAssociationModal(() => showAssociationsTab(content, session)));
}

// نافذة "إنشاء جمعية" مستقلة — تُستدعى من تبويب "إدارة الجمعيات" نفسه ومن "إجراءات سريعة" بنظرة عامة معاً
async function openAddAssociationModal(onDone) {
  const settings = await callApi('getSettings');
  openModal({
    title: 'إنشاء جمعية جديدة',
    bodyHtml:
      '<div class="form-group"><label class="form-label">تاريخ البداية</label><input id="a-start" type="date" class="form-control" /></div>' +
      '<div class="form-group"><label class="form-label">مدة الجمعية (أشهر)</label><input id="a-duration" class="form-control" inputmode="numeric" value="' + settings.defaultDuration + '" /></div>' +
      '<div class="form-group"><label class="form-label">قيمة السهم (ريال)</label><input id="a-share" class="form-control" inputmode="decimal" value="' + settings.defaultShareValue + '" /></div>' +
      '<div class="form-hint" style="margin-bottom:14px">اسم الجمعية يُولَّد تلقائياً بصيغة "جمعية − N"</div>' +
      '<div class="form-error hidden" id="a-error"></div>' +
      '<button class="btn btn-gold btn-block" id="a-save">إنشاء</button>',
    onMount: (modal) => {
      [modal.querySelector('#a-duration'), modal.querySelector('#a-share')].forEach(bindDigitNormalization);
      const saveBtn = modal.querySelector('#a-save');
      saveBtn.addEventListener('click', withButtonLoading(saveBtn, async () => {
        const errEl = modal.querySelector('#a-error');
        errEl.classList.add('hidden');
        try {
          const r = await callApi('addAssociation', {
            startDate: modal.querySelector('#a-start').value,
            duration: modal.querySelector('#a-duration').value,
            shareValue: modal.querySelector('#a-share').value,
          });
          closeModal();
          showToast('تم إنشاء ' + r.name, 'success');
          onDone();
        } catch (err) {
          errEl.textContent = err.message;
          errEl.classList.remove('hidden');
        }
      }));
    },
  });
}

async function showAssociationAdminDetail(content, session, assoc) {
  content.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  const summary = await callApi('getAssociationFinancialSummary', { assocId: assoc.id });
  const prog = computeDurationProgress(assoc.startDate, assoc.endDate, assoc.duration);

  // نسبة إنجاز واحدة مدمجة (تحصيل + تسليم معاً) بدل عرض 4 أرقام متفرقة — أوضح للمدير بنظرة واحدة
  const combinedExpected = summary.collectionExpected + summary.deliveryExpected;
  const combinedDone = summary.collectionDone + summary.deliveryDone;
  const completionPercent = combinedExpected > 0 ? Math.round((combinedDone / combinedExpected) * 100) : 0;

  content.innerHTML =
    '<button class="btn btn-outline btn-sm" id="back-btn">→ رجوع للجمعيات</button>' +
    '<div class="card mt-16">' +
      '<div class="flex-between"><div class="assoc-name">' + assoc.name + '</div>' +
      '<span class="badge badge-' + (assoc.status === 'نشطة' ? 'success' : assoc.status === 'منتهية' ? 'gray' : 'gold') + '">' + assoc.status + '</span></div>' +
      (assoc.status !== 'منتهية' ? (
        '<div class="capacity-bar-wrap mt-16">' + renderProgressBarHtml(prog.percent) +
          '<div class="capacity-label"><span>مضى ' + formatNumber(prog.elapsedMonths) + ' من ' + formatNumber(assoc.duration) + ' شهر (' + prog.percent + '٪)</span>' +
          '<span>متبقٍ ' + formatNumber(prog.remainingMonths) + ' شهر / ' + formatNumber(prog.remainingDays) + ' يوم</span></div></div>'
      ) : '') +
      // بطاقتان مجمَّعتان حسب الحالة (منجَز/متبقٍ) بدل 4 أرقام متفرقة — كل بطاقة تقارن التحصيل
      // بالتسليم مباشرة، ثم شريط واحد يلخّص نسبة الإنجاز الكلية المدمجة
      '<div class="fin-summary">' +
        '<div class="fin-summary-card success">' +
          '<div class="fin-summary-title"><span class="fin-dot"></span>تم التحصيل والتسليم</div>' +
          '<div class="fin-summary-cols">' +
            '<div class="fin-summary-col"><div class="fin-summary-label">التحصيل</div><div class="fin-summary-val">' + formatCurrency(summary.collectionDone) + '</div></div>' +
            '<div class="fin-summary-col"><div class="fin-summary-label">التسليم</div><div class="fin-summary-val">' + formatCurrency(summary.deliveryDone) + '</div></div>' +
          '</div>' +
        '</div>' +
        '<div class="fin-summary-card warning">' +
          '<div class="fin-summary-title"><span class="fin-dot"></span>المتبقي</div>' +
          '<div class="fin-summary-cols">' +
            '<div class="fin-summary-col"><div class="fin-summary-label">التحصيل</div><div class="fin-summary-val">' + formatCurrency(summary.collectionRemaining) + '</div></div>' +
            '<div class="fin-summary-col"><div class="fin-summary-label">التسليم</div><div class="fin-summary-val">' + formatCurrency(summary.deliveryRemaining) + '</div></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="progress-wrap primary mt-16">' + renderProgressBarHtml(completionPercent, 'success') +
        '<div class="progress-label"><span>نسبة الإنجاز</span><span>' + completionPercent + '٪</span></div></div>' +
    '</div>' +
    '<div class="tabs mt-16" id="assoc-sub-tabs">' +
      '<button class="tab-btn" data-t="months">الأشهر</button>' +
      '<button class="tab-btn" data-t="subs">الاشتراكات</button>' +
      '<button class="tab-btn" data-t="wishes">الرغبات</button>' +
    '</div>' +
    '<div id="assoc-sub-content"></div>';

  content.querySelector('#back-btn').addEventListener('click', () => showAssociationsTab(content, session));
  const subContent = content.querySelector('#assoc-sub-content');
  const subTabs = content.querySelector('#assoc-sub-tabs');

  function activate(t) {
    subTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.t === t));
    if (t === 'subs') showSubscriptionsSubTab(subContent, assoc, content, session);
    else if (t === 'months') showMonthsSubTab(subContent, assoc);
    else if (t === 'wishes') showWishesSubTab(subContent, assoc);
  }
  subTabs.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => activate(b.dataset.t)));
  // الدخول لتفصيل الجمعية يفتح مباشرة على "الأشهر" — هي الأكثر استخداماً يومياً (تأكيد تحصيل/تسليم)
  activate('months');
}

async function showSubscriptionsSubTab(subContent, assoc, content, session) {
  subContent.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  let subs, members;
  try {
    [subs, members] = await Promise.all([callApi('getSubscriptions', { assocId: assoc.id }), callApi('getMembers')]);
  } catch (err) {
    subContent.innerHTML = '<p class="table-empty">' + err.message + '</p>';
    return;
  }

  subContent.innerHTML =
    '<div class="flex-between" style="margin:14px 0"><span></span><button class="btn btn-gold btn-sm" id="add-sub-btn">+ إضافة اشتراك</button></div>' +
    '<div class="table-wrap"><table><thead><tr><th>العضو</th><th>الأسهم</th><th>قيمة الاشتراك</th><th></th></tr></thead><tbody id="subs-body"></tbody></table></div>';

  const body = subContent.querySelector('#subs-body');
  if (subs.length === 0) body.innerHTML = '<tr><td colspan="4" class="table-empty">لا يوجد مشتركون بعد</td></tr>';
  subs.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + s.memberName + '</td><td>' + formatNumber(s.sharesCount) + '</td><td>' + formatCurrency(s.sharesValue) + '</td>' +
      '<td><button class="btn btn-outline btn-sm edit-sub-btn">تعديل</button> ' +
      (assoc.status === 'جديدة' ? '<button class="btn btn-danger btn-sm withdraw-btn">انسحاب</button>' : '') + '</td>';
    tr.querySelector('.edit-sub-btn').addEventListener('click', () => openSubModal(subContent, assoc, s.memberId, s.memberName, s.sharesCount));
    const withdrawBtn = tr.querySelector('.withdraw-btn');
    if (withdrawBtn) withdrawBtn.addEventListener('click', withButtonLoading(withdrawBtn, async () => {
      if (!confirm('هل تريد سحب اشتراك ' + s.memberName + '؟')) return;
      await callApi('withdrawSubscription', { assocId: assoc.id, memberId: s.memberId });
      showSubscriptionsSubTab(subContent, assoc, content, session);
    }));
    body.appendChild(tr);
  });

  subContent.querySelector('#add-sub-btn').addEventListener('click', () => {
    const eligible = members.filter(m => !subs.some(s => s.memberId === m.id) && m.status === 'نشط');
    if (eligible.length === 0) { showToast('لا يوجد أعضاء متاحون للإضافة', 'error'); return; }
    openModal({
      title: 'إضافة اشتراك',
      bodyHtml:
        '<div class="form-group"><label class="form-label">العضو</label><select id="sub-member" class="form-control">' +
          eligible.map(m => '<option value="' + m.id + '">' + m.name + '</option>').join('') + '</select></div>' +
        '<div class="form-group"><label class="form-label">عدد الأسهم</label><input id="sub-shares" class="form-control" inputmode="decimal" placeholder="مثال: 20" /></div>' +
        '<div class="form-error hidden" id="sub-error"></div>' +
        '<button class="btn btn-gold btn-block" id="sub-save">إضافة</button>',
      onMount: (modal) => {
        bindDigitNormalization(modal.querySelector('#sub-shares'));
        const saveBtn = modal.querySelector('#sub-save');
        saveBtn.addEventListener('click', withButtonLoading(saveBtn, async () => {
          const errEl = modal.querySelector('#sub-error');
          errEl.classList.add('hidden');
          const shares = normalizeDigits(modal.querySelector('#sub-shares').value);
          if (!isValidSharesCount(shares)) { errEl.textContent = 'عدد الأسهم يجب أن يكون 0.5 على الأقل وبمضاعفات نصف سهم'; errEl.classList.remove('hidden'); return; }
          try {
            await callApi('addSubscription', { assocId: assoc.id, memberId: modal.querySelector('#sub-member').value, sharesCount: shares });
            closeModal();
            showToast('تمت إضافة الاشتراك', 'success');
            showSubscriptionsSubTab(subContent, assoc, content, session);
          } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
        }));
      },
    });
  });
}

function openSubModal(subContent, assoc, memberId, memberName, currentShares) {
  openModal({
    title: 'تعديل أسهم ' + memberName,
    bodyHtml:
      '<div class="form-group"><label class="form-label">عدد الأسهم الجديد</label><input id="edit-shares" class="form-control" inputmode="decimal" value="' + currentShares + '" /></div>' +
      '<div class="form-hint" style="margin-bottom:14px">تعديل الأسهم يحذف رغبات وتسليمات العضو السابقة في هذه الجمعية ويعيد بناء سجلات التحصيل</div>' +
      '<div class="form-error hidden" id="edit-error"></div>' +
      '<button class="btn btn-gold btn-block" id="edit-save">حفظ</button>',
    onMount: (modal) => {
      bindDigitNormalization(modal.querySelector('#edit-shares'));
      const saveBtn = modal.querySelector('#edit-save');
      saveBtn.addEventListener('click', withButtonLoading(saveBtn, async () => {
        const errEl = modal.querySelector('#edit-error');
        errEl.classList.add('hidden');
        const shares = normalizeDigits(modal.querySelector('#edit-shares').value);
        if (!isValidSharesCount(shares)) { errEl.textContent = 'عدد الأسهم يجب أن يكون 0.5 على الأقل وبمضاعفات نصف سهم'; errEl.classList.remove('hidden'); return; }
        try {
          await callApi('updateSubscription', { assocId: assoc.id, memberId, sharesCount: shares });
          closeModal();
          showToast('تم التعديل', 'success');
          showSubscriptionsSubTab(subContent, assoc, subContent, {});
        } catch (err) {
          errEl.textContent = err.message;
          errEl.classList.remove('hidden');
        }
      }));
    },
  });
}

async function showMonthsSubTab(subContent, assoc) {
  subContent.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  let months, confirmSummary;
  try {
    [months, confirmSummary] = await Promise.all([
      callApi('getMonthsWithTotals', { assocId: assoc.id }),
      callApi('getMonthsConfirmationSummary', { assocId: assoc.id }),
    ]);
  } catch (err) {
    subContent.innerHTML = '<p class="table-empty">' + err.message + '</p>';
    return;
  }

  // شريط تنقّل سريع بأرقام الأشهر — أفقي قابل للتمرير، الشهر الجاري مميَّز بالأزرق، والضغط على أي
  // رقم ينتقل مباشرة لبطاقة ذلك الشهر (Scroll) بدل التمرير اليدوي بحثاً عنه بين كل البطاقات
  subContent.innerHTML =
    '<div class="month-quick-nav mt-16" id="month-quick-nav">' +
      months.map(m => {
        const isCurrent = computeMonthProgress(m.date).state === 'current';
        return '<button class="month-quick-nav-btn' + (isCurrent ? ' active' : '') + '" data-month="' + m.monthNum + '">' + formatNumber(m.monthNum) + '</button>';
      }).join('') +
    '</div>' +
    '<div class="grid grid-2 mt-16" id="months-list"></div>';

  subContent.querySelector('#month-quick-nav').querySelectorAll('.month-quick-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = subContent.querySelector('#month-card-' + btn.dataset.month);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const list = subContent.querySelector('#months-list');
  months.forEach(m => {
    const mProg = computeMonthProgress(m.date);
    const stateBadge = mProg.state === 'current' ? '<span class="badge badge-gold" style="margin-inline-start:6px">الشهر الجاري</span>' : '';
    const cs = confirmSummary[m.monthNum] || { collectionDone: 0, collectionPending: 0, deliveryDone: 0, deliveryPending: 0 };
    const hasDelivery = cs.deliveryDone > 0 || cs.deliveryPending > 0;

    // بطاقة مدمجة ومختصرة: (1) بطاقة "ثوابت" واحدة (تحصيل الشهر | تسليم الشهر، ثم الفائض أسفلهما)؛
    // (2) التأكيد الفعلي مجمَّعاً حسب الحالة (تم/متبقٍ) بنفس أسلوب الملخص المالي لتفصيل الجمعية —
    // بديل مباشر عن الكتلة النظرية الطويلة + شريط السعة الزمنية السابقين
    const el = document.createElement('div');
    el.className = 'card';
    el.id = 'month-card-' + m.monthNum;
    el.style.cursor = 'pointer';
    el.innerHTML =
      '<div class="flex-between"><span style="font-weight:800">الشهر ' + formatNumber(m.monthNum) + stateBadge + '</span>' +
      '<span class="badge badge-' + (m.closed ? 'gray' : 'warning') + '">' + (m.closed ? 'مغلق' : 'مفتوح') + '</span></div>' +
      renderDualDateHtml(m.date) +
      '<div class="fin-summary mt-16">' +
        '<div class="fin-summary-card info">' +
          '<div class="fin-summary-cols">' +
            '<div class="fin-summary-col"><div class="fin-summary-label">التحصيل لهذا الشهر</div><div class="fin-summary-val">' + formatCurrency(m.fixedRiyal) + '</div></div>' +
            '<div class="fin-summary-col"><div class="fin-summary-label">التسليم لهذا الشهر</div><div class="fin-summary-val">' + formatCurrency(m.usedRiyal) + '</div></div>' +
          '</div>' +
          '<div class="fin-summary-highlight"><div class="fin-summary-label">الفائض لهذا الشهر</div><div class="fin-summary-val">' + formatCurrency(m.remainRiyal) + '</div></div>' +
        '</div>' +
        '<div class="fin-summary-card success">' +
          '<div class="fin-summary-title"><span class="fin-dot"></span>تم فعلياً (تشيك بوكس)</div>' +
          '<div class="fin-summary-cols">' +
            '<div class="fin-summary-col"><div class="fin-summary-label">تحصيل</div><div class="fin-summary-val">' + formatCurrency(cs.collectionDone) + '</div></div>' +
            (hasDelivery ? '<div class="fin-summary-col"><div class="fin-summary-label">تسليم</div><div class="fin-summary-val">' + formatCurrency(cs.deliveryDone) + '</div></div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="fin-summary-card warning">' +
          '<div class="fin-summary-title"><span class="fin-dot"></span>متبقٍ (لم يُختَر التشيك بوكس بعد)</div>' +
          '<div class="fin-summary-cols">' +
            '<div class="fin-summary-col"><div class="fin-summary-label">تحصيل</div><div class="fin-summary-val">' + formatCurrency(cs.collectionPending) + '</div></div>' +
            (hasDelivery ? '<div class="fin-summary-col"><div class="fin-summary-label">تسليم</div><div class="fin-summary-val">' + formatCurrency(cs.deliveryPending) + '</div></div>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    el.addEventListener('click', withCardLoading(el, () => showMonthDetailModal(subContent, assoc, m)));
    list.appendChild(el);
  });
}

async function showMonthDetailModal(subContent, assoc, month) {
  // طلب واحد بدل ثلاثة (getMonthDetailBundle) — كان فتح بطاقة الشهر أبطأ ملحوظاً من بقية البطاقات
  // تحديداً بسبب 3 طلبات شبكة منفصلة هنا مقابل طلب واحد للبطاقات الأخرى
  const { collection, delivery, settings } = await callApi('getMonthDetailBundle', { assocId: assoc.id, monthNum: month.monthNum });

  openModal({
    title: 'الشهر ' + month.monthNum + ' — ' + assoc.name,
    bodyHtml:
      '<div class="card-title">التحصيل</div>' +
      '<div class="table-wrap" style="margin-bottom:18px"><table><thead><tr><th>العضو</th><th>القيمة</th><th>تم؟</th><th>واتساب</th></tr></thead><tbody id="coll-rows"></tbody></table></div>' +
      (delivery.length ? '<div class="card-title">التسليم</div><div class="table-wrap"><table><thead><tr><th>العضو</th><th>القيمة</th><th>تم؟</th><th>واتساب</th></tr></thead><tbody id="del-rows"></tbody></table></div>' : '<p class="form-hint">لا يوجد تسليم مطلوب لهذا الشهر</p>'),
    onMount: (modal) => {
      const collBody = modal.querySelector('#coll-rows');
      collection.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + c.memberName + '</td><td>' + formatCurrency(c.sharesValue) + '</td>' +
          '<td><input type="checkbox" ' + (c.collected ? 'checked' : '') + ' /></td>' +
          '<td><a class="btn btn-success btn-sm wa-btn" target="_blank" rel="noopener" style="' + (c.collected ? '' : 'display:none') + '">واتساب</a></td>';
        const checkbox = tr.querySelector('input');
        const waBtn = tr.querySelector('.wa-btn');

        function updateWaLink() {
          const message = fillTemplate(settings.collectionMessage, {
            الاسم: c.memberName,
            عدد_الاسهم: formatNumber(c.sharesCount),
            قيمة_التحصيل: formatCurrency(c.sharesValue),
          });
          waBtn.href = buildWhatsAppLink(c.memberPhone, message);
        }
        updateWaLink();

        checkbox.addEventListener('change', async (e) => {
          if (checkbox.dataset.loading === '1') { e.preventDefault(); return; } // منع تكرار التبديل أثناء طلب سابق قيد التنفيذ
          checkbox.dataset.loading = '1';
          checkbox.disabled = true;
          try {
            await callApi('confirmCollection', { id: c.id, collected: e.target.checked });
            waBtn.style.display = e.target.checked ? '' : 'none';
            showToast('تم التحديث', 'success');
            // تحديث بطاقات "الأشهر" خلف النافذة المنبثقة بلا انتظار — وإلا تبقى القيم (المتبقي،
            // شارة مغلق/مفتوح) قديمة حتى يُغادر المدير التبويب ويعود إليه يدوياً
            showMonthsSubTab(subContent, assoc);
          } catch (err) {
            e.target.checked = !e.target.checked; // تراجع بصري عن التبديل عند الفشل
            showToast(err.message, 'error');
          } finally {
            checkbox.dataset.loading = '';
            checkbox.disabled = false;
          }
        });
        collBody.appendChild(tr);
      });

      const delBody = modal.querySelector('#del-rows');
      if (delBody) delivery.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + d.memberName + '</td><td>' + formatCurrency(d.deliveryValue) + '</td>' +
          '<td><input type="checkbox" ' + (d.delivered ? 'checked' : '') + ' /></td>' +
          '<td><a class="btn btn-success btn-sm wa-btn" target="_blank" rel="noopener" style="' + (d.delivered ? '' : 'display:none') + '">واتساب</a></td>';
        const checkbox = tr.querySelector('input');
        const waBtn = tr.querySelector('.wa-btn');

        // "المتبقي" يحتاج بيانات إضافية (إجمالي أسهم العضو + كل تسليماته المؤكَّدة) — تُجلَب عند الحاجة فقط
        async function updateWaLink() {
          const [subs, deliveryRows] = await Promise.all([
            callApi('getSubscriptions', { assocId: assoc.id, memberId: d.memberId }),
            callApi('getMemberDeliveryRows', { assocId: assoc.id, memberId: d.memberId }),
          ]);
          const totalShares = subs[0] ? Number(subs[0].sharesCount) : 0;
          const totalEntitlement = totalShares * assoc.shareValue * assoc.duration;
          const deliveredSoFar = deliveryRows.filter(r => r.delivered).reduce((s, r) => s + Number(r.deliveryValue), 0);
          const remaining = Math.max(0, totalEntitlement - deliveredSoFar);
          const now = new Date();
          const message = fillTemplate(settings.deliveryMessage, {
            الاسم: d.memberName,
            عدد_الاسهم: formatNumber(totalShares),
            رقم_الشهر: formatNumber(d.monthNum),
            التاريخ: formatDualDate(month.date).combined,
            اسهم_التسليم: formatNumber(d.sharesCount),
            المتبقي: formatCurrency(remaining),
            تاريخ_الوقت: now.toLocaleDateString('en-GB') + ' ' + now.toLocaleTimeString('ar-SA'),
          });
          waBtn.href = buildWhatsAppLink(d.memberPhone, message);
        }
        if (d.delivered) updateWaLink();

        checkbox.addEventListener('change', async (e) => {
          if (checkbox.dataset.loading === '1') { e.preventDefault(); return; }
          checkbox.dataset.loading = '1';
          checkbox.disabled = true;
          try {
            await callApi('confirmDelivery', { id: d.id, delivered: e.target.checked });
            waBtn.style.display = e.target.checked ? '' : 'none';
            if (e.target.checked) await updateWaLink();
            showToast('تم التحديث', 'success');
            // نفس تحديث بطاقات "الأشهر" خلف النافذة المنبثقة بلا انتظار (انظر معالج التحصيل أعلاه)
            showMonthsSubTab(subContent, assoc);
          } catch (err) {
            e.target.checked = !e.target.checked;
            showToast(err.message, 'error');
          } finally {
            checkbox.dataset.loading = '';
            checkbox.disabled = false;
          }
        });
        delBody.appendChild(tr);
      });
    },
  });
}

async function showWishesSubTab(subContent, assoc) {
  subContent.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  let wishes;
  try {
    wishes = await callApi('getWishes', { assocId: assoc.id });
  } catch (err) {
    subContent.innerHTML = '<p class="table-empty">' + err.message + '</p>';
    return;
  }
  subContent.innerHTML =
    '<div class="flex-between" style="margin:14px 0"><span></span><button class="btn btn-gold btn-sm" id="add-wish-btn">+ إضافة / تعديل رغبة</button></div>' +
    '<div class="table-wrap"><table><thead><tr><th>العضو</th><th>الشهر</th><th>الأسهم</th><th></th></tr></thead><tbody id="wishes-body"></tbody></table></div>';
  const body = subContent.querySelector('#wishes-body');
  if (wishes.length === 0) body.innerHTML = '<tr><td colspan="4" class="table-empty">لا توجد رغبات بعد</td></tr>';
  wishes.forEach(w => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + w.memberName + '</td><td>' + formatNumber(w.monthNum) + '</td><td>' + formatNumber(w.sharesCount) + '</td><td><button class="btn btn-danger btn-sm del-wish-btn">حذف</button></td>';
    const delBtn = tr.querySelector('.del-wish-btn');
    delBtn.addEventListener('click', withButtonLoading(delBtn, async () => {
      if (!confirm('حذف رغبة ' + w.memberName + '؟')) return;
      try {
        await callApi('deleteWish', { id: w.id, assocId: w.assocId, monthNum: w.monthNum, isAdmin: true });
        showWishesSubTab(subContent, assoc);
      } catch (err) { showToast(err.message, 'error'); }
    }));
    body.appendChild(tr);
  });

  // للمدير كامل الصلاحية لإضافة/تعديل رغبة أي عضو مشترك (saveWish يقبل isAdmin=true حتى في جمعية "نشطة")
  // نفس منتقي الأشهر المستخدَم بلوحة العضو (بطاقات ملوّنة + شريط ملخص)، يُعاد بناؤه عند تغيير العضو
  subContent.querySelector('#add-wish-btn').addEventListener('click', async () => {
    const [subs, months] = await Promise.all([
      callApi('getSubscriptions', { assocId: assoc.id }),
      callApi('getMonthsWithTotals', { assocId: assoc.id }),
    ]);
    if (subs.length === 0) { showToast('لا يوجد أعضاء مشتركون في هذه الجمعية بعد', 'error'); return; }

    // عضو "مُجمَّد" = وزّع كامل أسهمه على أشهر الاستلام بالفعل — يبقى قابلاً للاختيار (لتعديل/تقليص
    // رغبته الحالية ونقل الفرق لشهر آخر) لكن يُميَّز بعلامة 🔒 في القائمة حتى لا يظنّ المدير أن له أسهماً متاحة
    const wishedTotalByMember = {};
    wishes.forEach(w => { wishedTotalByMember[w.memberId] = (wishedTotalByMember[w.memberId] || 0) + Number(w.sharesCount); });

    openModal({
      title: 'إضافة / تعديل رغبة',
      bodyHtml:
        '<div class="form-group"><label class="form-label">العضو</label><select id="w-member" class="form-control">' +
          subs.map(s => {
            const frozen = (wishedTotalByMember[s.memberId] || 0) >= Number(s.sharesCount) - 0.001;
            return '<option value="' + s.memberId + '">' + s.memberName + ' (' + formatNumber(s.sharesCount) + ' سهم)' + (frozen ? ' 🔒 مكتمل التوزيع' : '') + '</option>';
          }).join('') + '</select></div>' +
        '<p class="form-hint" style="margin-top:-10px;margin-bottom:14px">🔒 = وزّع العضو كامل أسهمه على أشهر الاستلام بالفعل؛ اختياره يتيح فقط تعديل/تقليص رغبته الحالية ونقل الفرق لشهر آخر</p>' +
        '<div id="w-picker-wrap"><div id="w-picker"></div></div>' +
        '<div id="w-shares-step" class="hidden">' +
          '<button class="btn btn-outline btn-sm" id="w-back-btn" type="button">→ رجوع لاختيار الشهر</button>' +
          '<div class="form-group mt-16"><label class="form-label" id="w-shares-label">عدد الأسهم</label>' +
            '<input id="w-shares" class="form-control" inputmode="decimal" placeholder="مثال: 2.5" /></div>' +
          '<div class="form-error hidden" id="w-error"></div>' +
          '<button class="btn btn-gold btn-block" id="w-save">حفظ</button>' +
        '</div>',
      onMount: (modal) => {
        const memberSelect = modal.querySelector('#w-member');
        const pickerWrap = modal.querySelector('#w-picker-wrap');
        const picker = modal.querySelector('#w-picker');
        const sharesStep = modal.querySelector('#w-shares-step');
        let currentMonth = null;

        async function renderPickerForSelectedMember() {
          const memberId = memberSelect.value;
          const sub = subs.find(s => s.memberId === memberId);
          const wishesForMember = await callApi('getWishes', { assocId: assoc.id, memberId });
          const wishedTotal = wishesForMember.reduce((s, w) => s + Number(w.sharesCount), 0);
          const sharesLeft = Math.max(0, Number(sub.sharesCount) - wishedTotal);
          const existingByMonth = new Map(wishesForMember.map(w => [Number(w.monthNum), w]));
          renderWishMonthPicker(picker, {
            assoc, months, memberSharesLeft: sharesLeft, existingWishByMonth: existingByMonth,
            onSelect: (month, existing) => {
              currentMonth = month;
              modal.querySelector('#w-shares-label').textContent = 'عدد الأسهم للشهر ' + month.monthNum + ' (0 لحذف الرغبة)';
              modal.querySelector('#w-shares').value = existing ? existing.sharesCount : '';
              pickerWrap.classList.add('hidden');
              sharesStep.classList.remove('hidden');
            },
          });
        }

        memberSelect.addEventListener('change', renderPickerForSelectedMember);
        renderPickerForSelectedMember();

        modal.querySelector('#w-back-btn').addEventListener('click', () => {
          sharesStep.classList.add('hidden');
          pickerWrap.classList.remove('hidden');
        });

        bindDigitNormalization(modal.querySelector('#w-shares'));
        const saveBtn = modal.querySelector('#w-save');
        saveBtn.addEventListener('click', withButtonLoading(saveBtn, async () => {
          const errEl = modal.querySelector('#w-error');
          errEl.classList.add('hidden');
          const memberId = memberSelect.value;
          const memberName = subs.find(s => s.memberId === memberId).memberName;
          const shares = normalizeDigits(modal.querySelector('#w-shares').value) || '0';
          try {
            await callApi('saveWish', { assocId: assoc.id, memberId, memberName, monthNum: currentMonth.monthNum, sharesCount: shares, isAdmin: true });
            closeModal();
            showToast('تم الحفظ بنجاح', 'success');
            showWishesSubTab(subContent, assoc);
          } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
        }));
      },
    });
  });
}

/* ══════════════════ الأرشيف ══════════════════ */
async function showArchiveTab(content, isStale) {
  content.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  let archived;
  try {
    archived = await callApi('getArchivedAssociations');
  } catch (err) {
    if (isStale && isStale()) return;
    content.innerHTML = '<p class="table-empty">' + err.message + '</p>';
    return;
  }
  if (isStale && isStale()) return;
  content.innerHTML = '<div class="section-title mt-16">الجمعيات المنتهية (أرشيف للقراءة فقط)</div><div class="grid grid-2" id="archive-list"></div>';
  const list = content.querySelector('#archive-list');
  if (archived.length === 0) list.innerHTML = '<p class="table-empty">لا توجد جمعيات مؤرشفة بعد</p>';
  archived.forEach(a => {
    const el = document.createElement('div');
    el.className = 'assoc-card status-منتهية';
    el.innerHTML =
      '<div class="assoc-name">' + a.name + '</div>' +
      '<div class="assoc-meta">' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">المشتركون</div><div class="assoc-meta-val">' + formatNumber(a.memberCount) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">قيمة السهم</div><div class="assoc-meta-val">' + formatCurrency(a.shareValue) + '</div></div>' +
      '</div>';
    el.style.cursor = 'pointer';
    el.addEventListener('click', withCardLoading(el, () => showArchiveDetailModal(a, content)));
    list.appendChild(el);
  });
}

async function showArchiveDetailModal(assoc, archiveContent) {
  const detail = await callApi('getArchivedAssociationDetail', { assocId: assoc.id });
  openModal({
    title: assoc.name + ' (مؤرشفة)',
    bodyHtml:
      '<div class="card-title">الاشتراكات</div>' +
      '<div class="table-wrap" style="margin-bottom:16px"><table><thead><tr><th>العضو</th><th>الأسهم</th></tr></thead><tbody>' +
        detail.subscriptions.map(s => '<tr><td>' + s.memberName + '</td><td>' + formatNumber(s.sharesCount) + '</td></tr>').join('') +
      '</tbody></table></div>' +
      '<div class="card-title">التسليم</div>' +
      '<div class="table-wrap" style="margin-bottom:16px"><table><thead><tr><th>العضو</th><th>الشهر</th><th>القيمة</th></tr></thead><tbody>' +
        detail.delivery.map(d => '<tr><td>' + d.memberName + '</td><td>' + formatNumber(d.monthNum) + '</td><td>' + formatCurrency(d.deliveryValue) + '</td></tr>').join('') +
      '</tbody></table></div>' +
      '<div class="form-error hidden" id="archive-restore-err"></div>' +
      '<button class="btn btn-outline" id="archive-restore-btn" type="button">استعادة هذه الجمعية من الأرشيف</button>' +
      '<p style="font-size:12px;color:var(--text-3);margin-top:8px">' +
        'تُستخدم فقط لتصحيح أرشفة وقعت خطأً — تُعيد الجمعية وكل بياناتها للجداول النشطة، وتُعيد اشتقاق حالة كل شهر من سجلات التحصيل والتسليم الحقيقية تلقائياً.' +
      '</p>',
    onMount: (modal) => {
      const btn = modal.querySelector('#archive-restore-btn');
      const errEl = modal.querySelector('#archive-restore-err');
      btn.addEventListener('click', withButtonLoading(btn, async () => {
        errEl.classList.add('hidden');
        try {
          await callApi('restoreArchivedAssociation', { assocId: assoc.id });
          closeModal();
          showToast('تمت استعادة "' + assoc.name + '" إلى الجمعيات النشطة', 'success');
          if (archiveContent) showArchiveTab(archiveContent);
        } catch (err) {
          errEl.textContent = err.message;
          errEl.classList.remove('hidden');
        }
      }));
    },
  });
}
