// لوحة العضو — بطاقة ملفي، جمعياتي (كمركز/Hub مختصر)، وشاشات متخصصة منبثقة لكل تفصيل
// (توزيع الرغبات / أشهر الاستلام المحدَّدة / حالة التحصيل) بدل صفحة طويلة واحدة يجب التمرير فيها بالكامل —
// أقرب لتجربة تطبيق جوال حقيقي: الرئيسية = ملخص سريع + أزرار، والتفاصيل = شاشات مخصصة عند الحاجة فقط.
import { callApi } from '../services/api.js';
import { renderAppHeader, wireHeaderEvents } from '../components/Header.js';
import { openModal, closeModal } from '../components/Modal.js';
import { showToast } from '../components/Toast.js';
import { formatCurrency, formatNumber, bindDigitNormalization, normalizeDigits } from '../utils/numbers.js';
import { computeDurationProgress, renderProgressBarHtml, daysUntil } from '../utils/dates.js';
import { formatPhoneDisplay } from '../utils/phone.js';
import { isValidSharesCount } from '../utils/validators.js';
import { withButtonLoading, withCardLoading } from '../components/Button.js';
import { renderWishMonthPicker } from '../components/WishMonthPicker.js';

const STATUS_LABEL = { 'جديدة': 'جديدة', 'نشطة': 'نشطة', 'منتهية': 'منتهية' };

export async function renderMemberDashboard(root, { session, onLogout }) {
  root.innerHTML = renderAppHeader({ memberName: session.memberName, isAdmin: false }) +
    '<div class="container" style="padding-top:22px"><div id="member-content"></div></div>';
  wireHeaderEvents(root, onLogout);

  const content = root.querySelector('#member-content');
  await renderMemberAssociationsView(content, session);
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
export async function renderMemberAssociationsView(content, session, isStale) {
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

  // ── بطاقة ملف العضو: صورة رمزية بأول حرف من الاسم + رقمه + 3 إحصائيات إجمالية عبر كل جمعياته ──
  const totalShares = mine.reduce((s, a) => s + Number(a.sub.sharesCount), 0);
  const totalEntitlement = mine.reduce((s, a) => s + Number(a.sub.sharesCount) * a.shareValue * a.duration, 0);
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
      '</div>' +
    '</div>';

  const availableSectionHtml = available.length
    ? '<div class="section-title">جمعيات متاحة للاشتراك</div><div class="grid grid-2" id="available-assoc-list"></div>'
    : '';

  if (mine.length === 0) {
    content.innerHTML = profileHtml +
      '<div class="card text-center"><p style="color:var(--text-3)">لست مشتركاً في أي جمعية بعد.' +
      (available.length ? '' : ' تواصل مع المدير للاشتراك.') + '</p></div>' +
      availableSectionHtml;
    renderAvailableAssociations(content, session, available);
    return;
  }

  content.innerHTML = profileHtml +
    '<div class="section-title">جمعياتي</div>' +
    '<div class="grid grid-2" id="assoc-list"></div>' +
    availableSectionHtml;

  const list = content.querySelector('#assoc-list');
  mine.forEach(a => {
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
      '<div class="progress-wrap primary">' + renderProgressBarHtml(prog.percent) +
        '<div class="progress-label">' + (notStartedYet
          ? '<span>لم تبدأ بعد</span><span>تبدأ خلال ' + formatNumber(daysToStart) + ' يوم</span>'
          : '<span>تقدّم الجمعية الزمني — ' + prog.percent + '٪</span><span>' + formatNumber(prog.remainingDays) + ' يوم متبقٍ</span>') + '</div></div>' +
      '<div class="progress-wrap secondary">' + renderProgressBarHtml(wishedPercent, 'success') +
        '<div class="progress-label"><span>رغبات الاستلام المحدَّدة</span><span>' + formatNumber(wishedTotal) + ' / ' + formatNumber(a.sub.sharesCount) + ' سهم</span></div></div>';
    el.addEventListener('click', withCardLoading(el, () => showAssociationDetail(content, session, a)));
    list.appendChild(el);
  });

  renderAvailableAssociations(content, session, available);
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
