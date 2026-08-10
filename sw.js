// عامل الخدمة (Service Worker) — يخزّن "هيكل التطبيق" فقط (الملفات الثابتة: HTML/CSS/JS/الشعار)
// للتحميل الفوري عند الزيارات اللاحقة وقابلية عمل الواجهة جزئياً بلا اتصال — وليس بديلاً عن الشبكة
// لأي بيانات فعلية. طلبات الخادم (Apps Script) لا تُخزَّن أبداً: بيانات مالية حيّة، وعرض نسخة قديمة
// منها خطأ جسيم يخالف قاعدة "بيانات حقيقية 100٪ دائماً" في هذا المشروع.

const CACHE_NAME = 'sahm-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './assets/logo.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './styles/tokens.css',
  './styles/base.css',
  './styles/components.css',
  './config/config.js',
  './services/api.js',
  './services/webauthn.js',
  './services/auth.js',
  './utils/numbers.js',
  './utils/validators.js',
  './utils/phone.js',
  './utils/template.js',
  './utils/dates.js',
  './components/Toast.js',
  './components/Modal.js',
  './components/Header.js',
  './components/WishMonthPicker.js',
  './components/Button.js',
  './components/BottomNav.js',
  './pages/Login.js',
  './pages/MemberDashboard.js',
  './pages/AdminDashboard.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // إضافات/تعديلات الخادم لا تُلمَس إطلاقاً

  const url = new URL(req.url);
  if (url.hostname.indexOf('script.google.com') > -1) return; // بيانات Apps Script الحيّة — شبكة فقط دائماً
  if (url.origin !== self.location.origin) return; // خطوط جوجل ونحوها — سلوك المتصفح الافتراضي

  // هيكل التطبيق: نتيجة الكاش فوراً إن وُجدت (تحميل فوري)، مع تحديث الكاش بصمت في الخلفية من الشبكة
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
