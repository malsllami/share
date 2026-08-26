// تحييد النصوص قبل إدراجها داخل innerHTML — يمنع تنفيذ أي HTML/سكربت مضمَّن داخل بيانات نصية
// حرة (اسم عضو، ملاحظة، اسم جهاز، قالب رسالة...) تُعرض لاحقاً كجزء من قالب HTML مبني كنص خام
export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
