// استبدال رموز {المتغير} داخل نصوص القوالب (رسائل واتساب القابلة للتعديل من الإعدادات) ببيانات حقيقية
export function fillTemplate(template, data) {
  if (!template) return '';
  return template.replace(/\{([^}]+)\}/g, (match, key) => {
    const value = data[key.trim()];
    return value !== undefined && value !== null ? String(value) : match;
  });
}

// يبني رابط واتساب مباشر (wa.me) برسالة جاهزة — يقبل الجوال بصيغة +966XXXXXXXXX
export function buildWhatsAppLink(phone, message) {
  const digits = (phone || '').replace(/[^\d]/g, '');
  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message);
}
