import { showToast } from './Toast.js';

// حارس أزرار عام — يمنع تكرار الضغط أثناء تنفيذ عملية غير متزامنة، ويحوّل الزر بصرياً
// لشريط تقدّم متحرك (بدل مجرد تعطيله) حتى يتضح للمستخدم أن العملية قيد التنفيذ فعلاً.
// مهم: catch إجباري هنا — بدونه أي خطأ يُرمى داخل asyncFn (فشل شبكي، أو خطأ يرميه callApi) يتحوّل
// لـ Unhandled Promise Rejection صامت تماماً (الزر فقط يعود لحالته الطبيعية بلا أي رسالة للمستخدم،
// وكأن شيئاً لم يحدث) — كان هذا خللاً حقيقياً اكتُشف عند تشخيص "بطاقة لا تفتح" بلا أي خطأ ظاهر.
export function withButtonLoading(button, asyncFn) {
  return async (...args) => {
    if (button.dataset.loading === '1') return; // منع صارم لأي ضغطة إضافية أثناء التنفيذ
    button.dataset.loading = '1';
    button.disabled = true;
    button.classList.add('btn-loading');
    try {
      await asyncFn(...args);
    } catch (err) {
      showToast(err.message || 'حدث خطأ غير متوقع', 'error');
    } finally {
      button.dataset.loading = '';
      button.disabled = false;
      button.classList.remove('btn-loading');
    }
  };
}

// نفس فكرة withButtonLoading لكن للبطاقات القابلة للنقر (assoc-card, nav-card, بطاقات الأشهر...)
// التي تُحمِّل بياناتها من الخادم عند الضغط عليها. بدون هذا الحارس، أي تأخر طبيعي في استجابة
// Apps Script (شائع، ثانية إلى بضع ثوانٍ) يجعل البطاقة تبدو بلا استجابة فيضغط المستخدم عليها
// مكرراً — فتتراكم طلبات متزامنة زائدة للخادم تُبطئ الاستجابة أكثر بدل حلّ المشكلة. هنا: أول ضغطة
// فقط تُنفَّذ، وتظهر تعتيم + شريط تحميل متحرك فوري على البطاقة نفسها كتأكيد بصري لحظي أن الضغطة سُجِّلت.
export function withCardLoading(el, asyncFn) {
  return async (...args) => {
    if (el.dataset.loading === '1') return;
    el.dataset.loading = '1';
    el.classList.add('card-loading');
    try {
      await asyncFn(...args);
    } catch (err) {
      showToast(err.message || 'حدث خطأ غير متوقع', 'error');
    } finally {
      // العنصر قد يكون استُبدل من الصفحة أثناء التنفيذ (لو غيّرت الدالة innerHTML الحاوية) — لا ضرر
      // من محاولة إزالة الحالة حتى لو لم يعد ظاهراً، والعنصر نفسه سيُهمَل من قِبل جامع النفايات لاحقاً
      el.dataset.loading = '';
      el.classList.remove('card-loading');
    }
  };
}
