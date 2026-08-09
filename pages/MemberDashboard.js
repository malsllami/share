// لوحة العضو — بطاقة ملفي، جمعياتي، توزيع الرغبات على الأشهر، وحالة التحصيل/التسليم الخاصة بي
import { callApi } from '../services/api.js';
import { renderAppHeader, wireHeaderEvents } from '../components/Header.js';
import { openModal, closeModal } from '../components/Modal.js';
import { showToast } from '../components/Toast.js';
import { formatCurrency, formatNumber, bindDigitNormalization, normalizeDigits } from '../utils/numbers.js';
import { computeDurationProgress, renderProgressBarHtml, daysUntil } from '../utils/dates.js';
import { formatPhoneDisplay } from '../utils/phone.js';
import { isValidSharesCount } from '../utils/validators.js';
import { withButtonLoading } from '../components/Button.js';
import { renderWishMonthPicker } from '../components/WishMonthPicker.js';

const STATUS_LABEL = { 'جديدة': 'جديدة', 'نشطة': 'نشطة', 'منتهية': 'منتهية' };

export async function renderMemberDashboard(root, { session, onLogout }) {
  root.innerHTML = renderAppHeader({ memberName: session.memberName, isAdmin: false }) +
    '<div class="container" style="padding-top:22px"><div id="member-content"></div></div>';
  wireHeaderEvents(root, onLogout);

  const content = root.querySelector('#member-content');
  await renderMemberAssociationsView(content, session);
}

// عرض "جمعياتي" (بطاقة ملف + قائمة + تفصيل) بلا رأس صفحة مستقل — قابل لإعادة الاستخدام داخل لوحة
// المدير أيضاً (المدير عضو بنفس الوقت في هذا النظام، وله جمعياته ورغباته الخاصة كأي عضو آخر).
export async function renderMemberAssociationsView(content, session) {
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
    content.innerHTML = '<p class="table-empty">' + err.message + '</p>';
    return;
  }

  const me = members.find(m => m.id === session.memberId);
  const mine = associations
    .filter(a => subs.some(s => s.assocId === a.id))
    .map(a => ({ ...a, sub: subs.find(s => s.assocId === a.id) }));

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

  if (mine.length === 0) {
    content.innerHTML = profileHtml + '<div class="card text-center"><p style="color:var(--text-3)">لست مشتركاً في أي جمعية بعد. تواصل مع المدير للاشتراك.</p></div>';
    return;
  }

  content.innerHTML = profileHtml +
    '<div class="section-title">جمعياتي</div>' +
    '<div class="grid grid-2" id="assoc-list"></div>';

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
      '<div class="progress-wrap">' + renderProgressBarHtml(prog.percent) +
        '<div class="progress-label">' + (notStartedYet
          ? '<span>لم تبدأ بعد</span><span>تبدأ خلال ' + formatNumber(daysToStart) + ' يوم</span>'
          : '<span>تقدّم الجمعية الزمني — ' + prog.percent + '٪</span><span>' + formatNumber(prog.remainingDays) + ' يوم متبقٍ</span>') + '</div></div>' +
      '<div class="progress-wrap">' + renderProgressBarHtml(wishedPercent, 'success') +
        '<div class="progress-label"><span>رغبات الاستلام المحدَّدة</span><span>' + formatNumber(wishedTotal) + ' / ' + formatNumber(a.sub.sharesCount) + ' سهم</span></div></div>';
    el.addEventListener('click', () => showAssociationDetail(content, session, a));
    list.appendChild(el);
  });
}

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

  content.innerHTML =
    '<button class="btn btn-outline btn-sm" id="back-to-list">→ رجوع للجمعيات</button>' +
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
      '<div class="progress-wrap mt-16">' + renderProgressBarHtml(prog.percent) +
        '<div class="progress-label">' + (notStartedYet
          ? '<span>لم تبدأ بعد</span><span>تبدأ خلال ' + formatNumber(daysToStart) + ' يوم</span>'
          : '<span>تقدّم الجمعية الزمني — ' + prog.percent + '٪</span><span>' + formatNumber(prog.remainingDays) + ' يوم متبقٍ</span>') + '</div></div>' +
      '<div class="progress-wrap">' + renderProgressBarHtml(wishedPercent, 'success') +
        '<div class="progress-label"><span>رغبات الاستلام المحدَّدة</span><span>' + formatNumber(myWishedTotal) + ' / ' + formatNumber(mySharesTotal) + ' سهم</span></div></div>' +
      (deliveryRows.length ? (
        '<div class="card-title mt-16">🗓 أشهر استلامي المحدَّدة</div>' +
        '<div class="mpc-delivery-list" id="del-list"></div>'
      ) : '') +
    '</div>' +

    '<div class="section-title mt-16">وزّع أسهمك على شهر الاستلام</div>' +
    '<p class="form-hint" style="margin-bottom:12px">اختر شهراً لتحديد كم سهماً تريد استلام قيمته فيه. لا يمكن أن يتجاوز مجموع ما توزّعه أسهمك الكلية.</p>' +
    '<div id="wish-picker"></div>' +

    '<div class="section-title mt-16">حالة التحصيل الشهري</div>' +
    '<div class="table-wrap"><table><thead><tr><th>الشهر</th><th>التاريخ</th><th>القيمة</th><th>الحالة</th></tr></thead><tbody id="coll-body"></tbody></table></div>';

  content.querySelector('#back-to-list').addEventListener('click', () => renderMemberAssociationsView(content, session));

  const existingWishByMonth = new Map(wishes.map(w => [Number(w.monthNum), w]));
  renderWishMonthPicker(content.querySelector('#wish-picker'), {
    assoc, months, memberSharesLeft: mySharesLeft, existingWishByMonth,
    onSelect: (month, existingWish) => openWishModal(content, session, assoc, month, existingWish, mySharesLeft),
  });

  const collBody = content.querySelector('#coll-body');
  if (collectionRows.length === 0) {
    collBody.innerHTML = '<tr><td colspan="4" class="table-empty">لا توجد سجلات بعد</td></tr>';
  } else {
    collectionRows.sort((a, b) => a.monthNum - b.monthNum).forEach(r => {
      collBody.innerHTML +=
        '<tr><td>' + formatNumber(r.monthNum) + '</td><td>' + (r.confirmDate ? new Date(r.confirmDate).toLocaleDateString('en-GB') : '—') + '</td>' +
        '<td>' + formatCurrency(r.sharesValue) + '</td>' +
        '<td><span class="badge badge-' + (r.collected ? 'success' : 'warning') + '">' + (r.collected ? 'تم التحصيل' : 'بانتظار التحصيل') + '</span></td></tr>';
    });
  }

  // قائمة أشهر الاستلام: دائرة رقم ملوّنة حسب الإلحاح (منجَز أخضر / هذا الشهر أو متأخر أحمر / قريب
  // خلال 30 يوماً ذهبي / بعيد محايد) + شارة عدّ تنازلي بالأيام — بيانات حقيقية من تأكيد التسليم الفعلي
  const delList = content.querySelector('#del-list');
  if (delList) {
    deliveryRows.sort((a, b) => a.monthNum - b.monthNum).forEach(r => {
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
  }
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
