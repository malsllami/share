// عميل موحّد للاتصال بخلفية Apps Script — POST بدون رأس Content-Type مخصّص لتفادي CORS Preflight
import { API_BASE_URL } from '../config/config.js';

// إعادة محاولة تلقائية واحدة فقط عند فشل شبكي أو استجابة خادم غير ناجحة (تذبذب عابر شائع مع Apps
// Script تحت حمل أو Cold Start) — لا تُعاد المحاولة أبداً عند نجاح الاتصال لكن الخادم يرد بخطأ عمل
// شرعي ({error: ...})، لأن ذلك رفض حقيقي وليس تذبذباً، ويجب أن يظهر للمستخدم فوراً بلا تأخير
const RETRY_DELAY_MS = 800;

// مهلة قصوى لكل محاولة اتصال — بدونها كان الطلب يبقى معلَّقاً بلا أي حد زمني إن تأخر Apps Script
// (Cold Start أو ضغط تزامن)، فيظهر للمستخدم كتعليق كامل للتطبيق بلا أي رسالة توضّح السبب
// Hard timeout per attempt — without this, a slow Apps Script response left the request hanging
// indefinitely with no feedback to the user at all.
const REQUEST_TIMEOUT_MS = 25000;

async function attemptFetch_(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(API_BASE_URL, { method: 'POST', body, signal: controller.signal });
  } catch (err) {
    return { kind: err.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
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

  if (outcome.kind === 'timeout') throw new Error('استغرق الخادم وقتاً طويلاً للرد — حاول مرة أخرى');
  if (outcome.kind === 'network') throw new Error('تعذّر الاتصال بالخادم — تحقق من الإنترنت');
  if (outcome.kind === 'http') throw new Error('تعذّر الاتصال بالخادم');

  let data;
  try {
    data = await outcome.res.json();
  } catch (err) {
    // رد الخادم لم يكن JSON صالحاً (مثلاً صفحة خطأ HTML عند تجاوز حصة Apps Script) — رسالة عربية
    // مفهومة بدل تسريب خطأ تحليل تقني خام للمستخدم
    throw new Error('تعذّر قراءة رد الخادم — حاول مرة أخرى');
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}
