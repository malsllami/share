// حارس أزرار عام — يمنع تكرار الضغط أثناء تنفيذ عملية غير متزامنة، ويحوّل الزر بصرياً
// لشريط تقدّم متحرك (بدل مجرد تعطيله) حتى يتضح للمستخدم أن العملية قيد التنفيذ فعلاً.
export function withButtonLoading(button, asyncFn) {
  return async (...args) => {
    if (button.dataset.loading === '1') return; // منع صارم لأي ضغطة إضافية أثناء التنفيذ
    button.dataset.loading = '1';
    button.disabled = true;
    button.classList.add('btn-loading');
    try {
      await asyncFn(...args);
    } finally {
      button.dataset.loading = '';
      button.disabled = false;
      button.classList.remove('btn-loading');
    }
  };
}
