'use strict';

// ── ストレージ管理 ────────────────────────────────────────
const Storage = {
  getQuotes() {
    const saved = localStorage.getItem('meigen_quotes');
    if (saved) return JSON.parse(saved);
    // 初回起動時は初期データをコピーして保存
    const initial = INITIAL_QUOTES.map(q => ({ ...q }));
    this.saveQuotes(initial);
    return initial;
  },
  saveQuotes(quotes) {
    localStorage.setItem('meigen_quotes', JSON.stringify(quotes));
  },
  getSettings() {
    const saved = localStorage.getItem('meigen_settings');
    if (saved) return JSON.parse(saved);
    return {
      notificationTime: '07:00',
      notificationEnabled: false,
      activeCategories: ['historical', 'philosophy', 'business', 'sports']
    };
  },
  saveSettings(settings) {
    localStorage.setItem('meigen_settings', JSON.stringify(settings));
  },
  getNotificationDate() {
    return localStorage.getItem('meigen_notif_date') || '';
  },
  setNotificationDate(dateStr) {
    localStorage.setItem('meigen_notif_date', dateStr);
  }
};

// ── アプリ状態 ────────────────────────────────────────────
let state = {
  currentTab: 'home',
  quotes: [],
  settings: {},
  currentQuote: null,
  listFilter: 'all',
  listSearch: '',
  editingId: null
};

// ── 初期化 ────────────────────────────────────────────────
function init() {
  state.quotes = Storage.getQuotes();
  state.settings = Storage.getSettings();
  state.currentQuote = pickRandomQuote();

  renderHome();
  renderList();
  renderManage();
  renderSettings();
  bindEvents();
  registerServiceWorker();
  checkMorningNotification();
}

// ── ランダム名言取得 ──────────────────────────────────────
function pickRandomQuote(excludeId = null) {
  const cats = state.settings.activeCategories;
  let pool = state.quotes.filter(q => cats.includes(q.category));
  if (pool.length === 0) pool = state.quotes;
  if (pool.length === 0) return null;
  if (excludeId && pool.length > 1) pool = pool.filter(q => q.id !== excludeId);
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── ホームタブ描画 ────────────────────────────────────────
function renderHome() {
  const q = state.currentQuote;
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日（${['日','月','火','水','木','金','土'][today.getDay()]}）`;

  document.getElementById('home-date').textContent = dateStr + '　今日の一言';

  if (!q) {
    document.getElementById('home-quote-area').innerHTML =
      '<div class="empty-state"><div class="empty-icon">📭</div><p>表示できる名言がありません。<br>設定でカテゴリを有効にしてください。</p></div>';
    return;
  }

  document.getElementById('home-quote-area').innerHTML = `
    <div class="quote-card" id="quote-card">
      <div class="quote-text">${escapeHtml(q.text)}</div>
      <div class="quote-author">
        <span class="category-badge">${CATEGORY_LABELS[q.category] || q.category}</span>
        <span class="quote-author-name">${escapeHtml(q.author)}</span>
      </div>
    </div>
  `;
}

// ── 一覧タブ描画 ──────────────────────────────────────────
function renderList() {
  const filter = state.listFilter;
  const search = state.listSearch.trim().toLowerCase();

  let filtered = state.quotes.filter(q => {
    const matchCat = filter === 'all' || q.category === filter;
    const matchSearch = !search ||
      q.text.toLowerCase().includes(search) ||
      q.author.toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  document.getElementById('list-count').textContent = `${filtered.length}件`;

  if (filtered.length === 0) {
    document.getElementById('quote-list').innerHTML =
      '<div class="empty-state"><div class="empty-icon">🔍</div><p>該当する名言が見つかりませんでした。</p></div>';
    return;
  }

  document.getElementById('quote-list').innerHTML = filtered.map(q => `
    <div class="quote-list-item">
      <div class="quote-list-text">${escapeHtml(q.text)}</div>
      <div class="quote-list-meta">
        <span class="quote-list-author">${escapeHtml(q.author)}</span>
        <span class="category-badge">${CATEGORY_LABELS[q.category] || q.category}</span>
      </div>
    </div>
  `).join('');
}

// ── 管理タブ描画 ──────────────────────────────────────────
function renderManage() {
  if (state.quotes.length === 0) {
    document.getElementById('manage-list').innerHTML =
      '<div class="empty-state"><div class="empty-icon">✏️</div><p>名言がありません。<br>上のボタンから追加してください。</p></div>';
    return;
  }

  document.getElementById('manage-list').innerHTML = state.quotes.map(q => `
    <div class="manage-item">
      <div class="manage-item-content">
        <div class="manage-item-text">${escapeHtml(q.text)}</div>
        <div class="manage-item-author">${escapeHtml(q.author)}　<span style="font-weight:normal;color:var(--text-light)">${CATEGORY_LABELS[q.category] || q.category}</span></div>
      </div>
      <div class="manage-item-actions">
        <button class="btn-edit" data-id="${q.id}">編集</button>
        <button class="btn-delete" data-id="${q.id}">削除</button>
      </div>
    </div>
  `).join('');
}

// ── 設定タブ描画 ──────────────────────────────────────────
function renderSettings() {
  const s = state.settings;
  document.getElementById('notif-toggle').checked = s.notificationEnabled;
  document.getElementById('notif-time').value = s.notificationTime;

  ['historical', 'philosophy', 'business', 'sports'].forEach(cat => {
    const el = document.getElementById(`cat-${cat}`);
    if (el) el.checked = s.activeCategories.includes(cat);
  });
}

// ── イベントバインド ──────────────────────────────────────
function bindEvents() {
  // ボトムナビ
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // シャッフルボタン
  document.getElementById('shuffle-btn').addEventListener('click', shuffleQuote);

  // 一覧：検索
  document.getElementById('list-search').addEventListener('input', e => {
    state.listSearch = e.target.value;
    renderList();
  });

  // 一覧：カテゴリフィルター
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.listFilter = btn.dataset.cat;
      renderList();
    });
  });

  // 管理：追加ボタン
  document.getElementById('add-quote-btn').addEventListener('click', openAddModal);

  // 管理：編集・削除（委譲）
  document.getElementById('manage-list').addEventListener('click', e => {
    const id = parseInt(e.target.dataset.id);
    if (!id) return;
    if (e.target.classList.contains('btn-edit')) openEditModal(id);
    if (e.target.classList.contains('btn-delete')) deleteQuote(id);
  });

  // 設定：通知トグル
  document.getElementById('notif-toggle').addEventListener('change', async e => {
    if (e.target.checked) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        e.target.checked = false;
        showToast('通知の許可が必要です');
        return;
      }
    }
    state.settings.notificationEnabled = e.target.checked;
    Storage.saveSettings(state.settings);
    updateNotificationSchedule();
    showToast(e.target.checked ? '通知をオンにしました' : '通知をオフにしました');
  });

  // 設定：通知時間
  document.getElementById('notif-time').addEventListener('change', e => {
    state.settings.notificationTime = e.target.value;
    Storage.saveSettings(state.settings);
    updateNotificationSchedule();
    showToast(`通知時間を ${e.target.value} に設定しました`);
  });

  // 設定：カテゴリ
  ['historical', 'philosophy', 'business', 'sports'].forEach(cat => {
    document.getElementById(`cat-${cat}`).addEventListener('change', e => {
      if (e.target.checked) {
        if (!state.settings.activeCategories.includes(cat))
          state.settings.activeCategories.push(cat);
      } else {
        if (state.settings.activeCategories.length <= 1) {
          e.target.checked = true;
          showToast('最低1つのカテゴリを選択してください');
          return;
        }
        state.settings.activeCategories = state.settings.activeCategories.filter(c => c !== cat);
      }
      Storage.saveSettings(state.settings);
      showToast('カテゴリ設定を保存しました');
    });
  });

  // モーダル
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', saveQuote);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // 通知テスト
  document.getElementById('test-notif-btn').addEventListener('click', testNotification);
}

// ── タブ切り替え ──────────────────────────────────────────
function switchTab(tab) {
  state.currentTab = tab;

  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelector(`.nav-btn[data-tab="${tab}"]`).classList.add('active');

  if (tab === 'list') renderList();
  if (tab === 'manage') renderManage();
}

// ── シャッフル ────────────────────────────────────────────
function shuffleQuote() {
  const prevId = state.currentQuote ? state.currentQuote.id : null;
  state.currentQuote = pickRandomQuote(prevId);
  renderHome();
  const card = document.getElementById('quote-card');
  if (card) {
    card.style.animation = 'none';
    card.offsetHeight;
    card.style.animation = 'fadeIn 0.3s ease';
  }
}

// ── モーダル操作 ──────────────────────────────────────────
function openAddModal() {
  state.editingId = null;
  document.getElementById('modal-title').textContent = '名言を追加';
  document.getElementById('modal-text').value = '';
  document.getElementById('modal-author').value = '';
  document.getElementById('modal-category').value = 'historical';
  document.getElementById('modal-overlay').classList.add('open');
}

function openEditModal(id) {
  const q = state.quotes.find(q => q.id === id);
  if (!q) return;
  state.editingId = id;
  document.getElementById('modal-title').textContent = '名言を編集';
  document.getElementById('modal-text').value = q.text;
  document.getElementById('modal-author').value = q.author;
  document.getElementById('modal-category').value = q.category;
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  state.editingId = null;
}

function saveQuote() {
  const text = document.getElementById('modal-text').value.trim();
  const author = document.getElementById('modal-author').value.trim();
  const category = document.getElementById('modal-category').value;

  if (!text || !author) {
    showToast('名言と著者名を入力してください');
    return;
  }

  if (state.editingId) {
    state.quotes = state.quotes.map(q =>
      q.id === state.editingId ? { ...q, text, author, category } : q
    );
    showToast('名言を更新しました');
  } else {
    const newId = state.quotes.length > 0 ? Math.max(...state.quotes.map(q => q.id)) + 1 : 1;
    state.quotes.push({ id: newId, text, author, category });
    showToast('名言を追加しました');
  }

  Storage.saveQuotes(state.quotes);
  closeModal();
  renderManage();
}

function deleteQuote(id) {
  const q = state.quotes.find(q => q.id === id);
  if (!q) return;
  if (!confirm(`「${q.text.substring(0, 20)}…」を削除しますか？`)) return;
  state.quotes = state.quotes.filter(q => q.id !== id);
  Storage.saveQuotes(state.quotes);
  renderManage();
  showToast('削除しました');
}

// ── 通知 ─────────────────────────────────────────────────
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function checkMorningNotification() {
  const s = state.settings;
  if (!s.notificationEnabled) return;
  if (Notification.permission !== 'granted') return;

  const today = new Date().toDateString();
  if (Storage.getNotificationDate() === today) return;

  const [h, m] = s.notificationTime.split(':').map(Number);
  const now = new Date();
  if (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)) {
    fireNotification();
    Storage.setNotificationDate(today);
  }
}

function fireNotification() {
  const q = pickRandomQuote();
  if (!q || Notification.permission !== 'granted') return;
  new Notification('名言通知', {
    body: `${q.text}\n— ${q.author}`,
    icon: './icons/icon-192.png',
    tag: 'daily-quote'
  });
}

async function testNotification() {
  const granted = await requestNotificationPermission();
  if (!granted) {
    showToast('通知の許可が必要です。設定からONにしてください');
    return;
  }
  fireNotification();
  showToast('テスト通知を送信しました');
}

function updateNotificationSchedule() {
  if (!navigator.serviceWorker.controller) return;
  if (!state.settings.notificationEnabled) {
    navigator.serviceWorker.controller.postMessage({ type: 'CANCEL_NOTIFICATION' });
    return;
  }
  const q = pickRandomQuote();
  if (!q) return;
  navigator.serviceWorker.controller.postMessage({
    type: 'SCHEDULE_NOTIFICATION',
    time: state.settings.notificationTime,
    quote: q
  });
}

// ── Service Worker登録 ────────────────────────────────────
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./service-worker.js', { scope: './' })
    .then(reg => {
      navigator.serviceWorker.ready.then(() => updateNotificationSchedule());
    })
    .catch(err => console.warn('SW登録失敗:', err));
}

// ── ユーティリティ ────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── 起動 ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
