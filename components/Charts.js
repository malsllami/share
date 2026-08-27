// رسوم بيانية خفيفة بلا أي مكتبة خارجية — حلقة توزيع (CSS conic-gradient) ورسم خطي بسيط (SVG)
// Lightweight chart helpers, zero external libraries — CSS conic-gradient donut + a small SVG line chart

// طريقة "أكبر باقٍ" (Largest Remainder / Hamilton) لتقريب نسب مئوية مستقلة بحيث يكون مجموعها
// 100٪ بالضبط دائماً — تقريب كل نسبة على حدة (Math.round) قد يُنتج مجموعاً 99٪ أو 101٪ رغم صحة
// كل رقم فردياً حسابياً؛ هذا يُصلح المجموع نفسه ليكون 100٪ تماماً كما يُتوقَّع من أي توزيع كامل
function fairPercents_(values) {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map(v => (v / total) * 100);
  const floors = raw.map(Math.floor);
  let remaining = 100 - floors.reduce((s, f) => s + f, 0);
  const order = floors.map((f, i) => i).sort((a, b) => (raw[b] - floors[b]) - (raw[a] - floors[a]));
  const result = floors.slice();
  for (let i = 0; i < order.length && remaining > 0; i++, remaining--) result[order[i]]++;
  return result;
}

// لون النسبة المئوية — ديناميكي حسب فئتها بدل لون ثابت واحد لكل حلقة/شريط (قرار محمد الصريح):
// 90-100٪ ممتاز (أخضر) | 60-89٪ جيد (نيلي) | 35-59٪ متوسط (كهرماني) | 0-34٪ ضعيف (أحمر) —
// يُستخدَم في كل حلقة/دونات/شريط تقدّم بالموقع بدل لون موحَّد أو ثابت حسب نوع البطاقة فقط
export function percentColor_(percent) {
  const p = Number(percent) || 0;
  if (p >= 90) return 'var(--success)';
  if (p >= 60) return 'var(--indigo)';
  if (p >= 35) return 'var(--warning)';
  return 'var(--danger)';
}

// نفس تدرّج percentColor_ لكن كاسم فئة CSS جاهز لاستخدامه مع renderProgressBarHtml (شرائط التقدّم
// تدعم فقط success/warning/danger أو التدرّج الافتراضي نيلي→ذهبي — الفئة الافتراضية '' تُستخدَم
// لفئة 60-89٪ لأنها أقرب بصرياً لدرجة "نيلي" من ألوان الهوية الحالية بلا حاجة لفئة CSS جديدة)
export function percentBarClass_(percent) {
  const p = Number(percent) || 0;
  if (p >= 90) return 'success';
  if (p >= 60) return '';
  if (p >= 35) return 'warning';
  return 'danger';
}

// حلقة نسبة صغيرة قائمة بذاتها (بلا Legend) — لبطاقات المؤشرات الفردية (KPI) حيث كل بطاقة تحتاج
// حلقة واحدة مصغَّرة + رقم مركزي + تسمية أسفلها، بدل حلقة توزيع كاملة بعدة قطاعات كـrenderDonutHtml
export function renderStatRingHtml(percent, centerText, label) {
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  const color = percentColor_(p);
  return (
    '<div class="stat-ring-wrap">' +
      '<div class="stat-ring" style="background:conic-gradient(' + color + ' 0% ' + p + '%, var(--border) ' + p + '% 100%)">' +
        '<div class="stat-ring-hole"><b>' + centerText + '</b></div>' +
      '</div>' +
      '<div class="stat-ring-label">' + label + '</div>' +
    '</div>'
  );
}

// segments: [{ label, value, color }] — color أي قيمة CSS صالحة (var(--x) أو hex). يُفترض أن الطالب
// رتَّب segments بالترتيب المطلوب عرضه به مسبقاً (مثلاً حسب رقم الشهر) — هذه الدالة لا تُعيد الترتيب.
// القيم الفارغة/صفرية تُعرض كحلقة رمادية محايدة بدل الانهيار على قسمة صفر.
export function renderDonutHtml(segments, centerBig, centerSmall) {
  const total = segments.reduce((s, x) => s + Number(x.value || 0), 0);
  const percents = fairPercents_(segments.map(s => Number(s.value) || 0));

  let acc = 0;
  const stops = total > 0
    ? segments.map((seg, i) => {
        const start = acc, end = acc + percents[i];
        acc = end;
        return seg.color + ' ' + start + '% ' + end + '%';
      }).join(', ')
    : 'var(--border) 0% 100%';

  // القيمة الفعلية (ريال) تُعرض بجانب النسبة دائماً — لا تكتفِ النسبة وحدها، حتى يتحقق من الأرقام
  // مباشرة بنفسه بلا حاجة لتخمين معنى النسبة (طُلب صراحة بعد التباس حول دقّة النسب المعروضة)
  const legend = segments.map((seg, i) => (
      '<div class="donut-legend-row">' +
        '<span class="donut-legend-dot" style="background:' + seg.color + '"></span>' +
        '<span class="donut-legend-label">' + seg.label + '</span>' +
        '<span class="donut-legend-val">' + percents[i] + '٪<small>' + Math.round(Number(seg.value || 0)).toLocaleString('en-US') + ' ر.س</small></span>' +
      '</div>'
    )
  ).join('');

  // صف إجمالي أسفل القائمة — مجموع القيم الفعلي عبر كل الأشهر المعروضة، والنسب مضمونة ١٠٠٪ دائماً
  const totalRow =
    '<div class="donut-legend-row donut-legend-total">' +
      '<span class="donut-legend-label">الإجمالي</span>' +
      '<span class="donut-legend-val">100٪<small>' + Math.round(total).toLocaleString('en-US') + ' ر.س</small></span>' +
    '</div>';

  return (
    '<div class="donut-wrap">' +
      '<div class="donut-ring" style="background:conic-gradient(' + stops + ')">' +
        '<div class="donut-hole"><b>' + centerBig + '</b><span>' + centerSmall + '</span></div>' +
      '</div>' +
      '<div class="donut-legend">' + legend + totalRow + '</div>' +
    '</div>'
  );
}

// قيمة مختصرة لتسميات نقاط الرسم فقط (17,500 → 17.5k) — لا تُستخدَم في أي مكان آخر بالموقع، فقط
// هنا حيث تحتاج تسمية كل نقطة أن تكون قصيرة بما يكفي لتظهر فوق/تحت نقطتها بلا تراكب مزعج
function compactValue_(v) {
  const n = Number(v) || 0;
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'ك';
  return String(Math.round(n));
}

// seriesList: [{ label, color, data:[أرقام] }] — كل السلاسل بنفس طول labels. كل نقطة تحمل تسمية
// رقمية فعلية (بدل نقاط صامتة) — طُلبت صراحة لتوضيح سبب ارتفاع/انخفاض الخط لكل شهر بنظرة واحدة
export function renderLineChartHtml(seriesList, labels) {
  const width = 320, height = 130, padX = 14, padY = 26;
  const allVals = [].concat(...seriesList.map(s => s.data));
  const max = Math.max(1, ...allVals) * 1.15;
  const n = labels.length;
  const xAt = i => padX + (n > 1 ? i * (width - 2 * padX) / (n - 1) : (width - 2 * padX) / 2);
  const yAt = v => height - padY - (v / max) * (height - 2 * padY - 14);

  const lines = seriesList.map((s, si) => {
    // السلسلة الأولى (تحصيل عادةً) تُسمَّى فوق نقاطها، والثانية (تسليم) تحتها — يمنع تراكب النصّين
    // عند تقارب قيمتَي الشهر نفسه
    const labelDy = si === 0 ? -8 : 14;
    const pts = s.data.map((v, i) => xAt(i) + ',' + yAt(v)).join(' ');
    const dots = s.data.map((v, i) =>
      '<circle cx="' + xAt(i) + '" cy="' + yAt(v) + '" r="3" fill="' + s.color + '"/>' +
      (v > 0 ? '<text x="' + xAt(i) + '" y="' + (yAt(v) + labelDy) + '" text-anchor="middle" font-size="8.5" font-weight="700" fill="' + s.color + '">' + compactValue_(v) + '</text>' : '')
    ).join('');
    return '<polyline points="' + pts + '" fill="none" stroke="' + s.color + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' + dots;
  }).join('');

  const xLabels = labels.map((l, i) =>
    '<text x="' + xAt(i) + '" y="' + (height - 4) + '" text-anchor="middle" font-size="9" fill="var(--text-3)">' + l + '</text>'
  ).join('');

  const legend = seriesList.map(s =>
    '<div class="linechart-legend-item"><span class="linechart-legend-dot" style="background:' + s.color + '"></span>' + s.label + '</div>'
  ).join('');

  return (
    '<div class="linechart-wrap">' +
      '<svg viewBox="0 0 ' + width + ' ' + height + '" class="linechart-svg" preserveAspectRatio="none">' + lines + xLabels + '</svg>' +
      '<div class="linechart-legend">' + legend + '</div>' +
    '</div>'
  );
}
