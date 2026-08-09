// لوحة المدير — الإعدادات، الأعضاء، الجمعيات (اشتراكات/أشهر/رغبات)، والأرشيف
import { callApi } from '../services/api.js';
import { renderAppHeader, wireHeaderEvents } from '../components/Header.js';
import { openModal, closeModal } from '../components/Modal.js';
import { showToast } from '../components/Toast.js';
import { formatCurrency, formatNumber, bindDigitNormalization, normalizeDigits } from '../utils/numbers.js';
import { renderDualDateHtml, formatDualDate, computeDurationProgress, computeMonthProgress, renderProgressBarHtml } from '../utils/dates.js';
import { buildFullPhone, extractLocalPart, formatPhoneDisplay, renderPhoneInputGroup, bindPhoneLocalInput } from '../utils/phone.js';
import { isValidSharesCount } from '../utils/validators.js';
import { withButtonLoading } from '../components/Button.js';
import { fillTemplate, buildWhatsAppLink } from '../utils/template.js';
import { renderWishMonthPicker } from '../components/WishMonthPicker.js';
import { renderMemberAssociationsView } from './MemberDashboard.js';

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

export async function renderAdminDashboard(root, { session, onLogout }) {
  root.innerHTML = renderAppHeader({ memberName: session.memberName, isAdmin: true }) +
    '<div class="container" style="padding-top:22px">' +
      '<div class="tabs" id="admin-tabs"></div>' +
      '<div id="admin-content"></div>' +
    '</div>';
  wireHeaderEvents(root, onLogout);

  const tabsEl = root.querySelector('#admin-tabs');
  const content = root.querySelector('#admin-content');

  function activate(tabId) {
    tabsEl.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    if (tabId === 'overview') showOverviewTab(content);
    else if (tabId === 'my-associations') renderMemberAssociationsView(content, session);
    else if (tabId === 'settings') showSettingsTab(content);
    else if (tabId === 'members') showMembersTab(content);
    else if (tabId === 'associations') showAssociationsTab(content, session);
    else if (tabId === 'archive') showArchiveTab(content);
  }

  tabsEl.innerHTML = TABS.map(t => '<button class="tab-btn" data-tab="' + t.id + '">' + t.label + '</button>').join('');
  tabsEl.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => activate(b.dataset.tab)));
  activate('overview');
}

/* ══════════════════ نظرة عامة ══════════════════ */
async function showOverviewTab(content) {
  content.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  const [associations, members, reqCount] = await Promise.all([
    callApi('getAssociations'),
    callApi('getMembers'),
    callApi('getRequestCount'),
  ]);

  const activeAssociations = associations.filter(a => a.status !== 'منتهية');
  const activeMembers = members.filter(m => m.status === 'نشط');

  // بيانات حقيقية من الجداول مباشرة لكل جمعية جارية — لا تقدير ولا أرقام وهمية
  const [monthsPerAssoc, summaries] = await Promise.all([
    Promise.all(activeAssociations.map(a => callApi('getMonths', { assocId: a.id }))),
    Promise.all(activeAssociations.map(a => callApi('getAssociationFinancialSummary', { assocId: a.id }))),
  ]);

  let totalDeliveryExpected = 0, totalDeliveryDone = 0;
  let totalSubscriptionValue = 0, totalSubscribedMembers = 0;
  summaries.forEach(s => { totalDeliveryExpected += s.deliveryExpected; totalDeliveryDone += s.deliveryDone; });
  activeAssociations.forEach(a => {
    totalSubscriptionValue += (Number(a.totalShares) || 0) * a.shareValue * a.duration;
    totalSubscribedMembers += Number(a.memberCount) || 0;
  });
  const totalDeliveryRemaining = Math.max(0, totalDeliveryExpected - totalDeliveryDone);
  const deliveryPercent = totalDeliveryExpected > 0 ? Math.round((totalDeliveryDone / totalDeliveryExpected) * 100) : 0;

  content.innerHTML =
    '<div class="grid grid-3 mt-16" style="margin-bottom:20px">' +
      '<div class="stat-card"><div class="n">' + formatNumber(associations.length) + '</div><div class="l">إجمالي الجمعيات (' + formatNumber(activeAssociations.length) + ' جارية)</div></div>' +
      '<div class="stat-card"><div class="n">' + formatNumber(members.length) + '</div><div class="l">إجمالي الأعضاء (' + formatNumber(activeMembers.length) + ' نشط)</div></div>' +
      '<div class="stat-card"><div class="n">' + formatNumber(reqCount.count) + '</div><div class="l">عدد طلبات السكربت</div></div>' +
    '</div>' +

    '<div class="section-title">عداد التسليم الكلي — كل الجمعيات الجارية</div>' +
    '<div class="card" style="margin-bottom:20px">' +
      '<div class="grid grid-3">' +
        '<div class="stat-card"><div class="n">' + formatCurrency(totalDeliveryExpected) + '</div><div class="l">الإجمالي المستحق تسليمه</div></div>' +
        '<div class="stat-card"><div class="n" style="color:var(--success)">' + formatCurrency(totalDeliveryDone) + '</div><div class="l">تم تسليمه</div></div>' +
        '<div class="stat-card"><div class="n" style="color:var(--warning)">' + formatCurrency(totalDeliveryRemaining) + '</div><div class="l">المتبقي للتسليم</div></div>' +
      '</div>' +
      '<div class="capacity-bar-wrap mt-16">' + renderProgressBarHtml(deliveryPercent, 'success') +
        '<div class="capacity-label"><span>نسبة الإنجاز</span><span>' + deliveryPercent + '٪</span></div></div>' +
    '</div>' +

    '<div class="grid grid-3 mt-16" style="margin-bottom:20px">' +
      '<div class="stat-card"><div class="n">' + formatCurrency(totalSubscriptionValue) + '</div><div class="l">إجمالي قيمة اشتراكات الجمعيات الجارية</div></div>' +
      '<div class="stat-card"><div class="n">' + formatNumber(totalSubscribedMembers) + '</div><div class="l">إجمالي الاشتراكات في كل الجمعيات الجارية</div></div>' +
      '<div class="stat-card"><div class="n">' + formatNumber(activeAssociations.length) + '</div><div class="l">عدد الجمعيات النشطة/الجارية</div></div>' +
    '</div>' +

    '<div class="section-title">الجمعيات الجارية</div>' +
    '<div class="grid grid-2" id="overview-assoc-list"></div>';

  const list = content.querySelector('#overview-assoc-list');
  if (activeAssociations.length === 0) { list.innerHTML = '<p class="table-empty">لا توجد جمعية جارية حالياً</p>'; return; }

  activeAssociations.forEach((a, idx) => {
    const months = monthsPerAssoc[idx];
    const s = summaries[idx];
    const closedCount = months.filter(m => m.closed).length;
    const prog = computeDurationProgress(a.startDate, a.endDate, a.duration);
    const dual = formatDualDate(a.endDate);
    const totalValue = (Number(a.totalShares) || 0) * a.shareValue * a.duration;

    const el = document.createElement('div');
    el.className = 'assoc-card status-' + a.status;
    el.innerHTML =
      '<div class="flex-between"><div class="assoc-name">' + a.name + '</div><span class="badge badge-' + (a.status === 'نشطة' ? 'success' : 'gold') + '">' + a.status + '</span></div>' +
      '<div class="assoc-meta">' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">المشتركون</div><div class="assoc-meta-val">' + formatNumber(a.memberCount) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">إجمالي قيمة الاشتراكات</div><div class="assoc-meta-val">' + formatCurrency(totalValue) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">الأشهر المغلقة</div><div class="assoc-meta-val">' + formatNumber(closedCount) + ' / ' + formatNumber(a.duration) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">تنتهي</div><div class="assoc-meta-val" style="font-size:11px">' + dual.gregorian + '</div></div>' +
      '</div>' +
      '<div class="capacity-bar-wrap">' + renderProgressBarHtml(prog.percent) +
        '<div class="capacity-label"><span>مضى ' + formatNumber(prog.elapsedMonths) + ' من ' + formatNumber(a.duration) + ' شهر (' + prog.percent + '٪)</span>' +
        '<span>متبقٍ ' + formatNumber(prog.remainingDays) + ' يوم</span></div></div>' +
      '<div class="grid grid-2 mt-16" style="gap:8px">' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">تحصيل — تم</div><div class="assoc-meta-val" style="color:var(--success)">' + formatCurrency(s.collectionDone) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">تسليم — تم</div><div class="assoc-meta-val" style="color:var(--success)">' + formatCurrency(s.deliveryDone) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">تحصيل — متبقٍ</div><div class="assoc-meta-val" style="color:var(--warning)">' + formatCurrency(s.collectionRemaining) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">تسليم — متبقٍ</div><div class="assoc-meta-val" style="color:var(--warning)">' + formatCurrency(s.deliveryRemaining) + '</div></div>' +
      '</div>';
    list.appendChild(el);
  });
}

/* ══════════════════ الإعدادات ══════════════════ */
const MESSAGE_PLACEHOLDER_HINTS = {
  collection: '{الاسم} {عدد_الاسهم} {قيمة_التحصيل}',
  delivery: '{الاسم} {عدد_الاسهم} {رقم_الشهر} {التاريخ} {اسهم_التسليم} {المتبقي} {تاريخ_الوقت}',
};

async function showSettingsTab(content) {
  content.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  const s = await callApi('getSettings');
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
      });
      showToast('تم حفظ نصوص الرسائل', 'success');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  }));
}

/* ══════════════════ الأعضاء ══════════════════ */
async function showMembersTab(content) {
  content.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  const members = await callApi('getMembers');

  content.innerHTML =
    '<div class="flex-between mt-16" style="margin-bottom:16px">' +
      '<div class="section-title" style="margin:0">الأعضاء</div>' +
      '<button class="btn btn-gold btn-sm" id="add-member-btn">+ إضافة عضو</button>' +
    '</div>' +
    '<div class="table-wrap"><table><thead><tr><th>الاسم</th><th>الجوال</th><th>الحالة</th><th></th></tr></thead><tbody id="members-body"></tbody></table></div>';

  const body = content.querySelector('#members-body');
  if (members.length === 0) body.innerHTML = '<tr><td colspan="4" class="table-empty">لا يوجد أعضاء بعد</td></tr>';
  members.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + m.name + '</td><td>' + formatPhoneDisplay(m.phone) + '</td>' +
      '<td><span class="badge badge-' + (m.status === 'نشط' ? 'success' : 'danger') + '">' + m.status + '</span></td>' +
      '<td><button class="btn btn-outline btn-sm toggle-status-btn">' + (m.status === 'نشط' ? 'إيقاف' : 'تفعيل') + '</button></td>';
    const toggleBtn = tr.querySelector('.toggle-status-btn');
    toggleBtn.addEventListener('click', withButtonLoading(toggleBtn, async () => {
      await callApi('setMemberStatus', { memberId: m.id, status: m.status === 'نشط' ? 'موقوف' : 'نشط' });
      showMembersTab(content);
    }));
    body.appendChild(tr);
  });

  content.querySelector('#add-member-btn').addEventListener('click', () => {
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
            await callApi('addMember', { name: modal.querySelector('#m-name').value, phone });
            closeModal();
            showToast('تمت إضافة العضو', 'success');
            showMembersTab(content);
          } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
        }));
      },
    });
  });
}

/* ══════════════════ الجمعيات ══════════════════ */
async function showAssociationsTab(content, session) {
  content.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  const associations = await callApi('getAssociations');

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
    el.addEventListener('click', () => showAssociationAdminDetail(content, session, a));
    list.appendChild(el);
  });

  content.querySelector('#add-assoc-btn').addEventListener('click', async () => {
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
            showAssociationsTab(content, session);
          } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
          }
        }));
      },
    });
  });
}

async function showAssociationAdminDetail(content, session, assoc) {
  content.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  const summary = await callApi('getAssociationFinancialSummary', { assocId: assoc.id });
  const prog = computeDurationProgress(assoc.startDate, assoc.endDate, assoc.duration);

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
      '<div class="grid grid-2 mt-16" style="gap:8px">' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">إجمالي التحصيل — تم</div><div class="assoc-meta-val" style="color:var(--success)">' + formatCurrency(summary.collectionDone) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">إجمالي التسليم — تم</div><div class="assoc-meta-val" style="color:var(--success)">' + formatCurrency(summary.deliveryDone) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">إجمالي التحصيل — متبقٍ</div><div class="assoc-meta-val" style="color:var(--warning)">' + formatCurrency(summary.collectionRemaining) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">إجمالي التسليم — متبقٍ</div><div class="assoc-meta-val" style="color:var(--warning)">' + formatCurrency(summary.deliveryRemaining) + '</div></div>' +
      '</div>' +
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
  const [subs, members] = await Promise.all([callApi('getSubscriptions', { assocId: assoc.id }), callApi('getMembers')]);

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
  const [months, confirmSummary] = await Promise.all([
    callApi('getMonthsWithTotals', { assocId: assoc.id }),
    callApi('getMonthsConfirmationSummary', { assocId: assoc.id }),
  ]);

  subContent.innerHTML = '<div class="grid grid-2 mt-16" id="months-list"></div>';
  const list = subContent.querySelector('#months-list');
  months.forEach(m => {
    const mProg = computeMonthProgress(m.date);
    const stateLabel = mProg.state === 'past' ? 'شهر ماضٍ' : mProg.state === 'current' ? 'الشهر الجاري' : 'شهر قادم';
    const cs = confirmSummary[m.monthNum] || { collectionDone: 0, collectionPending: 0, deliveryDone: 0, deliveryPending: 0 };
    const hasDelivery = cs.deliveryDone > 0 || cs.deliveryPending > 0;

    const el = document.createElement('div');
    el.className = 'card';
    el.style.cursor = 'pointer';
    el.innerHTML =
      '<div class="flex-between"><span style="font-weight:800">الشهر ' + formatNumber(m.monthNum) + '</span>' +
      '<span class="badge badge-' + (m.closed ? 'gray' : 'warning') + '">' + (m.closed ? 'مغلق' : 'مفتوح') + '</span></div>' +
      renderDualDateHtml(m.date) +
      '<div class="capacity-bar-wrap mt-16">' + renderProgressBarHtml(mProg.percent, mProg.state === 'past' ? 'success' : mProg.state === 'current' ? 'warning' : '') +
        '<div class="capacity-label"><span>' + stateLabel + '</span><span>' + mProg.percent + '٪</span></div></div>' +
      '<div class="card-title mt-16" style="font-size:12px;color:var(--text-3);margin-bottom:8px">سعة الشهر (نظرية — حسب الرغبات)</div>' +
      '<div class="grid grid-3">' +
        '<div class="stat-card"><div class="n">' + formatCurrency(m.fixedRiyal) + '</div><div class="l">تحصيل ثابت</div></div>' +
        '<div class="stat-card"><div class="n">' + formatCurrency(m.usedRiyal) + '</div><div class="l">مُخصَّص</div></div>' +
        '<div class="stat-card"><div class="n">' + formatCurrency(m.remainRiyal) + '</div><div class="l">متبقٍ</div></div>' +
      '</div>' +
      '<div class="card-title mt-16" style="font-size:12px;color:var(--text-3);margin-bottom:8px">التأكيد الفعلي (حسب تشيك بوكس التحصيل/التسليم)</div>' +
      '<div class="grid grid-2" style="gap:8px">' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">تحصيل — تم</div><div class="assoc-meta-val" style="color:var(--success)">' + formatCurrency(cs.collectionDone) + '</div></div>' +
        '<div class="assoc-meta-item"><div class="assoc-meta-label">تحصيل — متبقٍ</div><div class="assoc-meta-val" style="color:var(--warning)">' + formatCurrency(cs.collectionPending) + '</div></div>' +
        (hasDelivery ? (
          '<div class="assoc-meta-item"><div class="assoc-meta-label">تسليم — تم</div><div class="assoc-meta-val" style="color:var(--success)">' + formatCurrency(cs.deliveryDone) + '</div></div>' +
          '<div class="assoc-meta-item"><div class="assoc-meta-label">تسليم — متبقٍ</div><div class="assoc-meta-val" style="color:var(--warning)">' + formatCurrency(cs.deliveryPending) + '</div></div>'
        ) : '') +
      '</div>';
    el.addEventListener('click', () => showMonthDetailModal(subContent, assoc, m));
    list.appendChild(el);
  });
}

async function showMonthDetailModal(subContent, assoc, month) {
  const [collection, delivery, settings] = await Promise.all([
    callApi('getCollectionData', { assocId: assoc.id, monthNum: month.monthNum }),
    callApi('getDeliveryData', { assocId: assoc.id, monthNum: month.monthNum }),
    callApi('getSettings'),
  ]);

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
  const wishes = await callApi('getWishes', { assocId: assoc.id });
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
async function showArchiveTab(content) {
  content.innerHTML = '<div class="loading-row"><div class="spinner"></div></div>';
  const archived = await callApi('getArchivedAssociations');
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
    el.addEventListener('click', () => showArchiveDetailModal(a, content));
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
