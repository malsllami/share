// منتقي أشهر الرغبات المشترك — شريط ملخص ثابت + بطاقات أشهر ملوّنة حسب مدى الإتاحة الفعلية
// يُستخدم في لوحة العضو (لنفسه) ولوحة المدير (لأي عضو يختاره) بنفس المنطق والمظهر.
//
// حالات البطاقة: أخضر = يتسع لسهم كامل على الأقل | برتقالي = يتسع لنصف سهم فقط (0.5 – <1)
// أحمر = لا يتسع حتى لنصف سهم، أو الشهر مغلق، أو لا يملك العضو أسهماً متبقية للتوزيع
import { formatCurrency, formatNumber } from '../utils/numbers.js';
import { renderDualDateHtml } from '../utils/dates.js';

// months: نتيجة getMonthsWithTotals | assoc: {shareValue, duration, monthlyTotal}
// memberSharesLeft: أسهم العضو غير المُوزَّعة على أي شهر بعد (تشمل ما وُزِّع في الشهر الحالي إن وُجد اختيار سابق)
// existingWishByMonth: Map<monthNum, {id, sharesCount}> رغبات هذا العضو الحالية في هذه الجمعية
// onSelect(month, existingWish): يُستدعى عند الضغط على بطاقة قابلة للاختيار
export function renderWishMonthPicker(container, { assoc, months, memberSharesLeft, existingWishByMonth, onSelect }) {
  const totalIncome = assoc.monthlyTotal || 0;
  const totalRequested = months.reduce((sum, m) => sum + (m.usedRiyal || 0), 0);

  container.innerHTML =
    '<div class="wish-summary-bar">' +
      '<div class="wish-summary-item"><div class="v">' + formatCurrency(totalIncome) + '</div><div class="l">إجمالي دخل الجمعية الشهري</div></div>' +
      '<div class="wish-summary-item"><div class="v">' + formatCurrency(totalRequested) + '</div><div class="l">إجمالي رغبات الاستلام (كل الأشهر)</div></div>' +
    '</div>' +
    '<div class="wish-grid"></div>';

  const grid = container.querySelector('.wish-grid');
  const shareUnitValue = assoc.shareValue * assoc.duration;

  months.forEach(m => {
    const existing = existingWishByMonth.get(m.monthNum);
    const existingShares = existing ? Number(existing.sharesCount) : 0;
    const monthRoomShares = shareUnitValue > 0 ? m.remainRiyal / shareUnitValue : 0;
    // سعة الشهر لهذا العضو تحديداً = المتبقي بالشهر + ما سبق أن اختاره هو نفسه فيه (لا يُحتسب ضده)
    const roomForMember = monthRoomShares + existingShares;
    const effectiveMax = Math.min(roomForMember, memberSharesLeft + existingShares);

    let state = 'red';
    if (!m.closed) {
      if (effectiveMax >= 1) state = 'green';
      else if (effectiveMax >= 0.5) state = 'orange';
    }

    const card = document.createElement('div');
    card.className = 'wish-month-card state-' + state + (existing ? ' selected' : '') + (m.closed ? ' closed' : '');
    card.innerHTML =
      '<div class="wish-month-num">' + formatNumber(m.monthNum) + '<span class="wish-month-badge-dot"></span></div>' +
      renderDualDateHtml(m.date) +
      '<div class="wish-month-mini">الموجود: ' + formatCurrency(m.availRiyal) + '<br>المُخصَّص: ' + formatCurrency(m.usedRiyal) + '</div>' +
      '<div class="wish-month-remaining">المتبقي: ' + formatCurrency(m.remainRiyal) + '</div>' +
      (existing ? '<div class="wish-month-info">لك ' + formatNumber(existingShares) + ' سهم هنا</div>' : '') +
      (m.closed ? '<div class="wish-month-info">مغلق</div>' : '');

    if (!m.closed && (state !== 'red' || existing)) {
      card.addEventListener('click', () => onSelect(m, existing));
    }
    grid.appendChild(card);
  });
}
