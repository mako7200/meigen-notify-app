const CACHE_NAME = 'meigen-notify-v53';
const CACHE_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/quotes.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './images/characters/aizen.png',
  './images/characters/giorno.png',
  './images/characters/tanaka.png',
  './images/animals/cat_sleeping_dot_transparent.png',
  './images/animals/cat_awake_dot_transparent.png',
  './images/animals/cat_yawn_dot_transparent.png',
  './images/animals/cat_grooming_dot_transparent.png',
  './images/animals/cat_stretching_dot_transparent.png',
  './images/flowers/CherryBlossomPetals_2_transparent.png',
  './images/flowers/petal_1_transparent.png',
  './images/flowers/petal_2_transparent.png',
  './images/flowers/petal_3_transparent.png',
  './images/flowers/petal_4_transparent.png',
  './images/flowers/petal_5_transparent.png',
  './images/flowers/petal_6_transparent.png',
  './images/flowers/petal_7_transparent.png',
  './images/Halloween/pumpkin_1_transparent.png',
  './images/Halloween/ghost_1_transparent.png',
  './images/Halloween/bat_1_transparent.png',
  './images/winter/snowflake_1_transparent.png',
  './images/winter/snowball_1_transparent.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        CACHE_FILES.map(url =>
          fetch(url, { cache: 'reload' }).then(response => cache.put(url, response))
        )
      )
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // localhost では毎回サーバーから取得（開発中の変更を即反映させるため）
  if (event.request.url.includes('localhost') || event.request.url.includes('127.0.0.1')) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

// 通知スケジューラー
let notificationTimer = null;

self.addEventListener('message', event => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'SCHEDULE_NOTIFICATION') {
    scheduleNotification(event.data.time, event.data.quote);
  }
  if (event.data.type === 'CANCEL_NOTIFICATION') {
    if (notificationTimer) clearTimeout(notificationTimer);
  }
});

function scheduleNotification(timeStr, quote) {
  if (notificationTimer) clearTimeout(notificationTimer);

  const [hours, minutes] = timeStr.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  // 今日の設定時刻が過ぎていたら翌日にセット
  if (target <= now) target.setDate(target.getDate() + 1);

  const delay = target - now;

  notificationTimer = setTimeout(() => {
    self.registration.showNotification('今日の名言', {
      body: `${quote.text}\n— ${quote.author}`,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'daily-quote',
      renotify: false,
      vibrate: [200, 100, 200]
    });
  }, delay);
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('./');
    })
  );
});
