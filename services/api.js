// عميل موحّد للاتصال بخلفية Apps Script — POST بدون رأس Content-Type مخصّص لتفادي CORS Preflight
import { API_BASE_URL } from '../config/config.js';

export async function callApi(action, params = {}) {
  let res;
  try {
    res = await fetch(API_BASE_URL, { method: 'POST', body: JSON.stringify({ action, ...params }) });
  } catch (err) {
    throw new Error('تعذّر الاتصال بالخادم — تحقق من الإنترنت');
  }
  if (!res.ok) throw new Error('تعذّر الاتصال بالخادم');
  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  return data;
}
