// عميل موحّد للاتصال بخلفية Apps Script — POST بدون رأس Content-Type مخصّص لتفادي CORS Preflight
import { API_BASE_URL } from '../config/config.js';

// إعادة محاولة تلقائية واحدة فقط عند فشل شبكي أو استجابة خادم غير ناجحة (تذبذب عابر شائع مع Apps
// Script تحت حمل أو Cold Start) — لا تُعاد المحاولة أبداً عند نجاح الاتصال لكن الخادم يرد بخطأ عمل
// شرعي ({error: ...})، لأن ذلك رفض حقيقي وليس تذبذباً، ويجب أن يظهر للمستخدم فوراً بلا تأخير
const RETRY_DELAY_MS = 800;

async function attemptFetch_(body) {
  let res;
  try {
    res = await fetch(API_BASE_URL, { method: 'POST', body });
  } catch (err) {
    return { kind: 'network' };
  }
  if (!res.ok) return { kind: 'http' };
  return { kind: 'ok', res };
}

export async function callApi(action, params = {}) {
  const body = JSON.stringify({ action, ...params });

  let outcome = await attemptFetch_(body);
  if (outcome.kind !== 'ok') {
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    outcome = await attemptFetch_(body);
  }

  if (outcome.kind === 'network') throw new Error('تعذّر الاتصال بالخادم — تحقق من الإنترنت');
  if (outcome.kind === 'http') throw new Error('تعذّر الاتصال بالخادم');

  const data = await outcome.res.json();
  if (data && data.error) throw new Error(data.error);
  return data;
}
