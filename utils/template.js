// استبدال رموز {المتغير} داخل نصوص القوالب (رسائل واتساب القابلة للتعديل من الإعدادات) ببيانات حقيقية
// تُنظَّف حروف تحكّم الاتجاه غير المرئية (LRM/RLM وعلامات التضمين وغيرها) من اسم المتغيّر قبل المطابقة
// — لصق نص عربي داخل قوسين معقوفين من تطبيقات مختلفة (كمحادثة أو رسالة) قد يُدخل أحد هذه الحروف
// الخفية بلا أن يلاحظها المستخدم إطلاقاً، فيبدو الرمز {المتغير} مطابقاً تماماً بصرياً بينما هو مختلف
// فعلياً بايتياً عن مفتاح البيانات — يظهر عندها الرمز كما هو حرفياً بدل استبداله بالقيمة الحقيقية
function cleanPlaceholderKey_(key) {
  return key.replace(/[​‌‍\u200E\u200F\u202A\u202B\u202C\u202D\u202E﻿]/g, '').trim();
}

export function fillTemplate(template, data) {
  if (!template) return '';
  return template.replace(/\{([^}]+)\}/g, (match, key) => {
    const value = data[cleanPlaceholderKey_(key)];
    return value !== undefined && value !== null ? String(value) : match;
  });
}

// يبني رابط واتساب مباشر (wa.me) برسالة جاهزة — يقبل الجوال بصيغة +966XXXXXXXXX
export function buildWhatsAppLink(phone, message) {
  const digits = (phone || '').replace(/[^\d]/g, '');
  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message);
}
