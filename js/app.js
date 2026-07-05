'use strict';

// ── ストレージ管理 ────────────────────────────────────────
// quotes.jsの組み込みデータに新しいフィールドを追加した際、
// 既に端末に保存済みの名言データへ後から補うためのバージョン番号
const QUOTES_DATA_VERSION = 6;

const RANK_META = {
  rare:        { class: 'rank-rare',   label: 'RARE' },
  super_rare:  { class: 'rank-super',  label: 'SUPER RARE' },
  ultra_rare:  { class: 'rank-ultra',  label: 'ULTRA RARE' },
  secret_rare: { class: 'rank-secret', label: 'SECRET' },
  mythic:      { class: 'rank-mythic', label: 'MYTHIC' }
};

const MYTHIC_DEFAULT_COLORS = ['#C8943B', '#8B2CF5', '#1a0a2e'];

function rankRingHtml(rarity) {
  if (rarity === 'super_rare') return '<span class="metallic-border-ring"></span>';
  if (rarity === 'ultra_rare') return '<span class="emerald-border-ring"></span>';
  if (rarity === 'secret_rare') return '<span class="secret-border-ring"></span><span class="secret-holo-bg"></span>';
  if (rarity === 'mythic') return '<span class="mythic-border-ring"></span><span class="mythic-holo-bg"></span>';
  return '';
}

function categoryLabel(q) {
  if (q.category === 'special') return '';
  return CATEGORY_LABELS[q.category] || q.category;
}

function mythicStyleAttr(q) {
  if (q.rarity !== 'mythic') return '';
  const c = (q.themeColors && q.themeColors.length) ? q.themeColors : MYTHIC_DEFAULT_COLORS;
  return ` style="--mc1:${c[0]};--mc2:${c[1]};--mc3:${c[2] || c[0]};"`;
}

const Storage = {
  getQuotes() {
    const saved = localStorage.getItem('meigen_quotes');
    if (saved) return this.migrateQuotes(JSON.parse(saved));
    const initial = INITIAL_QUOTES.map(q => ({ ...q }));
    this.saveQuotes(initial);
    localStorage.setItem('meigen_quotes_version', String(QUOTES_DATA_VERSION));
    return initial;
  },
  saveQuotes(quotes) { localStorage.setItem('meigen_quotes', JSON.stringify(quotes)); },
  migrateQuotes(quotes) {
    const savedVersion = Number(localStorage.getItem('meigen_quotes_version') || '1');
    if (savedVersion >= QUOTES_DATA_VERSION) return quotes;
    const initialById = {};
    INITIAL_QUOTES.forEach(q => { initialById[q.id] = q; });
    const existingIds = new Set(quotes.map(q => q.id));
    const migrated = quotes.map(q => {
      const initial = initialById[q.id];
      if (!initial) return q;
      return {
        ...q,
        authorBio: q.authorBio || initial.authorBio || '',
        background: q.background || initial.background || '',
        rarity: q.rarity === 'legendary' ? (initial.rarity || '') : (q.rarity || initial.rarity),
        themeColors: q.themeColors || initial.themeColors
      };
    });
    // 端末に保存済みのデータには存在しない、新しく追加された名言を補う
    const newlyAdded = INITIAL_QUOTES.filter(q => !existingIds.has(q.id)).map(q => ({ ...q }));
    const result = [...migrated, ...newlyAdded];
    this.saveQuotes(result);
    localStorage.setItem('meigen_quotes_version', String(QUOTES_DATA_VERSION));
    return result;
  },
  getSettings() {
    const saved = localStorage.getItem('meigen_settings');
    if (saved) return JSON.parse(saved);
    return { notificationTime: '07:00', notificationEnabled: false, activeCategories: ['historical', 'philosophy', 'business', 'sports'] };
  },
  saveSettings(settings) { localStorage.setItem('meigen_settings', JSON.stringify(settings)); },
  getNotificationDate() { return localStorage.getItem('meigen_notif_date') || ''; },
  setNotificationDate(d) { localStorage.setItem('meigen_notif_date', d); },
  getFavorites() { const s = localStorage.getItem('meigen_favorites'); return s ? JSON.parse(s) : []; },
  saveFavorites(ids) { localStorage.setItem('meigen_favorites', JSON.stringify(ids)); },
  // 1日1言：今日のレコード { date, quoteId }
  getDailyRecord() { const s = localStorage.getItem('meigen_daily'); return s ? JSON.parse(s) : null; },
  saveDailyRecord(r) { localStorage.setItem('meigen_daily', JSON.stringify(r)); },
  // 解放済み名言リスト [{ id, date }, ...]
  getUnlocked() { const s = localStorage.getItem('meigen_unlocked'); return s ? JSON.parse(s) : []; },
  saveUnlocked(list) { localStorage.setItem('meigen_unlocked', JSON.stringify(list)); },
  // 日記 { [quoteId]: "text" }
  getDiary() { const s = localStorage.getItem('meigen_diary'); return s ? JSON.parse(s) : {}; },
  saveDiary(diary) { localStorage.setItem('meigen_diary', JSON.stringify(diary)); }
};

// ── アプリ状態 ────────────────────────────────────────────
let state = {
  currentTab: 'home',
  quotes: [],
  settings: {},
  currentQuote: null,
  listFilter: 'all',
  listSearch: '',
  editingId: null,
  favorites: [],
  listFavoriteOnly: false,
  unlocked: [],   // [{ id, date }, ...]
  diary: {},      // { [quoteId]: "text" }
  isAdmin: false  // セッション中のみ有効（再読み込みでリセット）
};

let typewriterTimer = null;
let audioCtx = null;

// ── 初期化 ────────────────────────────────────────────────
function init() {
  state.quotes    = Storage.getQuotes();
  state.settings  = Storage.getSettings();
  state.favorites = Storage.getFavorites();
  state.unlocked  = Storage.getUnlocked();
  state.diary     = Storage.getDiary();
  state.currentQuote = getDailyQuote();

  renderHome();
  renderList();
  renderManage();
  renderSettings();
  bindEvents();
  initRipple();
  initSplash();
  initInstallBanner();
  registerServiceWorker();
  checkMorningNotification();

  if (localStorage.getItem('meigen_just_updated')) {
    localStorage.removeItem('meigen_just_updated');
    showToast('アップデートしました');
  }
}

// ── 1日1言：今日の名言を取得（または新規割当） ───────────
let dailyQuoteJustRevealed = false;

function getDailyQuote() {
  const today = new Date().toDateString();
  const record = Storage.getDailyRecord();

  // 今日の名言がすでに決まっている
  if (record && record.date === today) {
    dailyQuoteJustRevealed = false;
    return state.quotes.find(q => q.id === record.quoteId) || state.quotes[0] || null;
  }

  // 新しい日 → まだ見ていない名言からランダムに選ぶ
  const unlockedIds = state.unlocked.map(u => u.id);
  let pool = state.quotes.filter(q => !unlockedIds.includes(q.id));
  if (pool.length === 0) pool = [...state.quotes]; // 全部見たらリセット

  const chosen = pool[Math.floor(Math.random() * pool.length)];

  // 解放リストに追加
  if (!state.unlocked.find(u => u.id === chosen.id)) {
    state.unlocked.push({ id: chosen.id, date: today });
    Storage.saveUnlocked(state.unlocked);
  }
  Storage.saveDailyRecord({ date: today, quoteId: chosen.id });

  dailyQuoteJustRevealed = true;
  return chosen;
}

// ── ホームタブ描画 ────────────────────────────────────────
function renderHome() {
  const q = state.currentQuote;
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日（${['日','月','火','水','木','金','土'][today.getDay()]}）`;

  document.getElementById('home-date').textContent = dateStr + '　今日の一言';

  if (!q) {
    document.getElementById('home-quote-area').innerHTML =
      '<div class="empty-state"><div class="empty-icon">📭</div><p>表示できる名言がありません。</p></div>';
    document.getElementById('diary-section').style.display = 'none';
    return;
  }

  const isFav = state.favorites.includes(q.id);
  const rank = RANK_META[q.rarity];
  const cLabel = categoryLabel(q);
  document.getElementById('home-quote-area').innerHTML = `
    <div class="quote-card${rank ? ' ' + rank.class : ''}" id="quote-card"${mythicStyleAttr(q)}>
      ${rankRingHtml(q.rarity)}
      <button class="card-fav-btn${isFav ? ' active' : ''}" id="card-fav-btn">${isFav ? '★' : '☆'}</button>
      <div class="quote-text" id="quote-text"></div>
      <div class="quote-author">
        ${cLabel ? `<span class="category-badge">${cLabel}</span>` : '<span></span>'}
        <span class="quote-author-name">${escapeHtml(q.author)}</span>
      </div>
    </div>
  `;
  document.getElementById('card-fav-btn').addEventListener('click', () => {
    const wasFav = state.favorites.includes(q.id);
    toggleFavorite(q.id);
    if (!wasFav) {
      const btn = document.getElementById('card-fav-btn');
      if (btn) spawnStarBurst(btn);
      playStarSound();
    }
  });

  // 日記セクション表示
  renderDiarySection(q.id);

  if (!document.getElementById('splash')) {
    typewriter(document.getElementById('quote-text'), q.text);
  }
}

// ── ホーム日記セクション描画 ─────────────────────────────
const DIARY_TOGGLE_ICON = '<svg class="diary-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"/></svg>';

function renderDiarySection(quoteId) {
  const section = document.getElementById('diary-section');
  section.style.display = 'block';
  const existing = state.diary[quoteId] || '';

  document.getElementById('diary-toggle-btn').innerHTML = `${DIARY_TOGGLE_ICON}${existing ? 'コメントを編集する' : 'コメントを書く'}`;
  document.getElementById('diary-textarea').value = existing;
  document.getElementById('diary-char-count').textContent = `${existing.length} / 100`;

  const q = state.quotes.find(q => q.id === quoteId);
  if (q) {
    document.getElementById('diary-quote-preview-text').textContent = q.text;
    document.getElementById('diary-quote-preview-author').textContent = `— ${q.author}`;
  }
}

// ── 一覧タブ描画 ──────────────────────────────────────────
function renderList() {
  const unlockedIds = state.unlocked.map(u => u.id);
  const search = state.listSearch.trim().toLowerCase();

  let unlockedQuotes = state.quotes.filter(q => {
    if (!unlockedIds.includes(q.id)) return false;
    if (state.listFavoriteOnly && !state.favorites.includes(q.id)) return false;
    if (state.listFilter !== 'all' && q.category !== state.listFilter) return false;
    if (search) return q.text.toLowerCase().includes(search) || q.author.toLowerCase().includes(search);
    return true;
  });

  const totalLocked = state.quotes.length - unlockedIds.length;
  document.getElementById('progress-count').textContent = `${unlockedIds.length} / ${state.quotes.length}`;
  document.getElementById('progress-fill').style.width = state.quotes.length > 0 ? `${(unlockedIds.length / state.quotes.length) * 100}%` : '0%';

  if (unlockedQuotes.length === 0 && (state.listFavoriteOnly || search || state.listFilter !== 'all')) {
    document.getElementById('quote-list').innerHTML = state.listFavoriteOnly
      ? '<div class="empty-state"><div class="empty-icon">☆</div><p>お気に入りがまだありません。<br>ホームの星マークで追加してください。</p></div>'
      : '<div class="empty-state"><div class="empty-icon">🔍</div><p>該当する名言が見つかりませんでした。</p></div>';
    return;
  }

  let html = unlockedQuotes.map(q => {
    const isFav = state.favorites.includes(q.id);
    const hasDiary = state.diary[q.id] && state.diary[q.id].trim();
    const rank = RANK_META[q.rarity];
    const cLabel = categoryLabel(q);
    return `
      <div class="quote-list-item${isFav ? ' is-favorite' : ''}${rank ? ' ' + rank.class : ''}" data-id="${q.id}"${mythicStyleAttr(q)}>
        ${rankRingHtml(q.rarity)}
        ${rank ? `<span class="rank-badge">${rank.label}</span>` : ''}
        <button class="list-fav-btn${isFav ? ' active' : ''}" data-id="${q.id}">${isFav ? '★' : '☆'}</button>
        <div class="quote-list-text">${escapeHtml(q.text)}</div>
        <div class="quote-list-meta">
          <span class="quote-list-author">${escapeHtml(q.author)}</span>
          ${cLabel ? `<span class="category-badge">${cLabel}</span>` : ''}
        </div>
        ${hasDiary ? '<div class="diary-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> コメントあり</div>' : ''}
      </div>
    `;
  }).join('');

  // 未解放の名言は鍵アイコン＋？？？（フィルターなしのときのみ表示）
  if (!state.listFavoriteOnly && !search && state.listFilter === 'all') {
    for (let i = 0; i < totalLocked; i++) {
      html += `
        <div class="quote-list-item locked">
          <div class="locked-content">
            <svg class="lock-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="11" width="14" height="10" rx="2"/>
              <path d="M8 11V7a4 4 0 018 0v4"/>
            </svg>
          </div>
        </div>
      `;
    }
  }

  document.getElementById('quote-list').innerHTML = html;
}

// ── 管理タブ描画 ──────────────────────────────────────────
function renderManage() {
  const addBtn = document.getElementById('add-quote-btn');
  const adminBar = document.getElementById('admin-bar');

  addBtn.style.display = state.isAdmin ? 'flex' : 'none';
  document.getElementById('admin-next-quote-btn').style.display = state.isAdmin ? 'block' : 'none';
  adminBar.innerHTML = state.isAdmin
    ? `<div class="admin-status">管理者モード中</div>
       <button class="admin-lock-btn" id="admin-lock-btn" aria-label="ロックする">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.75-1.5"/></svg>
       </button>`
    : `<button class="admin-lock-btn" id="admin-lock-btn" aria-label="管理者モードにする">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
       </button>`;
  document.getElementById('admin-lock-btn').addEventListener('click', () => {
    if (state.isAdmin) {
      state.isAdmin = false;
      renderManage();
      showToast('管理者モードを終了しました');
    } else {
      openAdminPinModal();
    }
  });

  const unlockedIds = state.unlocked.map(u => u.id);
  const quotes = state.isAdmin ? state.quotes : state.quotes.filter(q => unlockedIds.includes(q.id));

  if (quotes.length === 0) {
    document.getElementById('manage-list').innerHTML =
      '<div class="empty-state"><div class="empty-icon">✏️</div><p>開放済みの名言がありません。<br>ホームで名言を開放すると表示されます。</p></div>';
    return;
  }
  document.getElementById('manage-list').innerHTML = quotes.map(q => {
    const isLocked = state.isAdmin && !unlockedIds.includes(q.id);
    const rank = RANK_META[q.rarity];
    const cLabel = categoryLabel(q);
    return `
    <div class="quote-list-item manage-item${rank ? ' ' + rank.class : ''}" data-id="${q.id}"${mythicStyleAttr(q)}>
      ${rankRingHtml(q.rarity)}
      ${rank ? `<span class="rank-badge">${rank.label}</span>` : ''}
      <div class="manage-item-content">
        <div class="manage-item-text">${escapeHtml(q.text)}</div>
        <div class="manage-item-author">${escapeHtml(q.author)}${cLabel ? `　<span style="font-weight:normal;">${cLabel}</span>` : ''}${isLocked ? ' <span class="locked-tag">未開放</span>' : ''}</div>
      </div>
      ${state.isAdmin ? `
      <div class="manage-item-actions">
        <button class="btn-edit" data-id="${q.id}">編集</button>
        <button class="btn-delete" data-id="${q.id}">削除</button>
      </div>` : ''}
    </div>
  `;
  }).join('');
}

// ── 管理者PINモーダル ────────────────────────────────────
const ADMIN_PIN = '01680';

function openAdminPinModal() {
  document.getElementById('admin-pin-input').value = '';
  document.getElementById('admin-pin-overlay').classList.add('open');
  lockBodyScroll();
  setTimeout(() => document.getElementById('admin-pin-input').focus(), 50);
}

function closeAdminPinModal() {
  document.getElementById('admin-pin-overlay').classList.remove('open');
  unlockBodyScroll();
}

function submitAdminPin() {
  const value = document.getElementById('admin-pin-input').value.trim();
  if (value === ADMIN_PIN) {
    state.isAdmin = true;
    closeAdminPinModal();
    renderManage();
    showToast('管理者モードにしました');
  } else {
    showToast('PINコードが違います');
  }
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

  // 一覧：お気に入り＋カードタップ（委譲）
  document.getElementById('quote-list').addEventListener('click', e => {
    const favBtn = e.target.closest('.list-fav-btn');
    if (favBtn) {
      const id = parseInt(favBtn.dataset.id);
      const wasFav = state.favorites.includes(id);
      if (!wasFav) { spawnStarBurst(favBtn); playStarSound(); }
      toggleFavorite(id);
      if (state.listFavoriteOnly && wasFav) {
        favBtn.textContent = '☆';
        favBtn.classList.remove('active');
        favBtn.closest('.quote-list-item').classList.remove('is-favorite');
        favBtn.closest('.quote-list-item').classList.add('fav-removed');
      } else {
        renderList();
      }
      return;
    }
    // 解放済みカードタップ → 詳細モーダル
    const card = e.target.closest('.quote-list-item:not(.locked)');
    if (card && card.dataset.id) openDetailModal(parseInt(card.dataset.id));
  });

  // お気に入りフィルター
  document.getElementById('fav-filter-btn').addEventListener('click', () => {
    state.listFavoriteOnly = !state.listFavoriteOnly;
    const btn = document.getElementById('fav-filter-btn');
    btn.classList.toggle('active', state.listFavoriteOnly);
    btn.textContent = state.listFavoriteOnly ? '★' : '☆';
    renderList();
  });

  // 管理：追加ボタン
  document.getElementById('add-quote-btn').addEventListener('click', openAddModal);

  // 管理：編集・削除（委譲）
  document.getElementById('manage-list').addEventListener('click', e => {
    const id = parseInt(e.target.dataset.id);
    if (id) {
      if (e.target.classList.contains('btn-edit')) { openEditModal(id); return; }
      if (e.target.classList.contains('btn-delete')) { deleteQuote(id); return; }
    }
    // カード本体タップ → 管理者テスト表示としてホームに反映
    if (!state.isAdmin) return;
    const card = e.target.closest('.manage-item');
    if (!card || !card.dataset.id) return;
    const quote = state.quotes.find(q => q.id === parseInt(card.dataset.id));
    if (!quote) return;
    state.currentQuote = quote;
    renderHome();
    switchTab('home');
    showToast('ホームにテスト表示しました');
  });

  // 設定：通知トグル
  document.getElementById('notif-toggle').addEventListener('change', async e => {
    if (e.target.checked) {
      const granted = await requestNotificationPermission();
      if (!granted) { e.target.checked = false; showToast('通知の許可が必要です'); return; }
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
        if (!state.settings.activeCategories.includes(cat)) state.settings.activeCategories.push(cat);
      } else {
        if (state.settings.activeCategories.length <= 1) { e.target.checked = true; showToast('最低1つのカテゴリを選択してください'); return; }
        state.settings.activeCategories = state.settings.activeCategories.filter(c => c !== cat);
      }
      Storage.saveSettings(state.settings);
      showToast('カテゴリ設定を保存しました');
    });
  });

  // 名言追加・編集モーダル
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', saveQuote);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  // 管理者PINモーダル
  document.getElementById('admin-pin-cancel').addEventListener('click', closeAdminPinModal);
  document.getElementById('admin-pin-submit').addEventListener('click', submitAdminPin);
  document.getElementById('admin-pin-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('admin-pin-overlay')) closeAdminPinModal();
  });
  document.getElementById('admin-pin-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAdminPin();
  });

  // 日記：トグルボタン（コメントモーダルを開く）
  document.getElementById('diary-toggle-btn').addEventListener('click', () => {
    document.getElementById('diary-modal-overlay').classList.add('open');
    lockBodyScroll();
    setTimeout(() => document.getElementById('diary-textarea').focus(), 150);
  });

  document.getElementById('diary-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('diary-modal-overlay')) saveAndCloseDiary();
  });

  // 日記：文字数カウント
  document.getElementById('diary-textarea').addEventListener('input', e => {
    document.getElementById('diary-char-count').textContent = `${e.target.value.length} / 100`;
  });

  // 日記：閉じる（＝自動保存）
  document.getElementById('diary-save-btn').addEventListener('click', saveAndCloseDiary);

  // 詳細モーダル：閉じる（＝自動保存）
  document.getElementById('detail-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('detail-modal-overlay')) saveAndCloseDetail();
  });
  document.getElementById('detail-close-btn').addEventListener('click', saveAndCloseDetail);
  document.getElementById('detail-diary-textarea').addEventListener('input', e => {
    document.getElementById('detail-diary-count').textContent = e.target.value.length;
  });

  // 通知テスト
  document.getElementById('test-notif-btn').addEventListener('click', testNotification);

  // 管理者：次の名言（テスト表示、実際の解放状況には影響しない）
  document.getElementById('admin-next-quote-btn').addEventListener('click', () => {
    if (!state.isAdmin || state.quotes.length === 0) return;
    state.currentQuote = state.quotes[Math.floor(Math.random() * state.quotes.length)];
    renderHome();
  });
}

// ── タブ切り替え ──────────────────────────────────────────
const TAB_ORDER = ['home', 'list', 'manage', 'settings'];
const TAB_LABELS = { home: 'ホーム', list: '一覧', manage: '管理', settings: '設定' };

function switchTab(tab) {
  const prevIndex = TAB_ORDER.indexOf(state.currentTab);
  const nextIndex = TAB_ORDER.indexOf(tab);
  const slideClass = nextIndex >= prevIndex ? 'slide-right' : 'slide-left';
  state.currentTab = tab;
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active', 'slide-right', 'slide-left'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active', 'bounce'));
  const newSection = document.getElementById(`tab-${tab}`);
  newSection.classList.add('active', slideClass);
  const newBtn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
  newBtn.classList.add('active', 'bounce');
  setTimeout(() => newBtn.classList.remove('bounce'), 350);
  document.getElementById('header-title-text').textContent = TAB_LABELS[tab] || TAB_LABELS.home;
  if (tab === 'list') renderList();
  if (tab === 'manage') renderManage();
}

// ── モーダル表示中の背面スクロール制御 ────────────────────
function lockBodyScroll() {
  document.querySelector('main').classList.add('no-scroll');
  document.documentElement.classList.add('modal-open');
}

function unlockBodyScroll() {
  document.querySelector('main').classList.remove('no-scroll');
  document.documentElement.classList.remove('modal-open');
}

function closeDiaryModal() {
  document.getElementById('diary-modal-overlay').classList.remove('open');
  unlockBodyScroll();
}

function saveAndCloseDiary() {
  if (!state.currentQuote) { closeDiaryModal(); return; }
  const text = document.getElementById('diary-textarea').value.trim();
  const existing = state.diary[state.currentQuote.id] || '';
  closeDiaryModal();
  if (text === existing) return;
  saveDiaryEntry(state.currentQuote.id, text);
  document.getElementById('diary-toggle-btn').innerHTML = `${DIARY_TOGGLE_ICON}${text ? 'コメントを編集する' : 'コメントを書く'}`;
  showToast(text ? 'コメントを保存しました' : 'コメントを削除しました');
}

// ── 名言追加・編集モーダル ────────────────────────────────
function openAddModal() {
  state.editingId = null;
  document.getElementById('modal-title').textContent = '名言を追加';
  document.getElementById('modal-text').value = '';
  document.getElementById('modal-author').value = '';
  document.getElementById('modal-category').value = 'historical';
  document.getElementById('modal-author-bio').value = '';
  document.getElementById('modal-background').value = '';
  document.getElementById('modal-rarity').value = '';
  document.getElementById('modal-overlay').classList.add('open');
  lockBodyScroll();
}

function openEditModal(id) {
  const q = state.quotes.find(q => q.id === id);
  if (!q) return;
  state.editingId = id;
  document.getElementById('modal-title').textContent = '名言を編集';
  document.getElementById('modal-text').value = q.text;
  document.getElementById('modal-author').value = q.author;
  document.getElementById('modal-category').value = q.category;
  document.getElementById('modal-author-bio').value = q.authorBio || '';
  document.getElementById('modal-background').value = q.background || '';
  document.getElementById('modal-rarity').value = q.rarity || '';
  document.getElementById('modal-overlay').classList.add('open');
  lockBodyScroll();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  state.editingId = null;
  unlockBodyScroll();
}

function saveQuote() {
  const text = document.getElementById('modal-text').value.trim();
  const author = document.getElementById('modal-author').value.trim();
  const category = document.getElementById('modal-category').value;
  const authorBio = document.getElementById('modal-author-bio').value.trim();
  const background = document.getElementById('modal-background').value.trim();
  const rarity = document.getElementById('modal-rarity').value;
  if (!text || !author) { showToast('名言と著者名を入力してください'); return; }
  if (state.editingId) {
    state.quotes = state.quotes.map(q => q.id === state.editingId ? { ...q, text, author, category, authorBio, background, rarity } : q);
    showToast('名言を更新しました');
  } else {
    const newId = state.quotes.length > 0 ? Math.max(...state.quotes.map(q => q.id)) + 1 : 1;
    state.quotes.push({ id: newId, text, author, category, authorBio, background, rarity });
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

// ── 詳細モーダル（日記編集） ──────────────────────────────
function openDetailModal(id) {
  const q = state.quotes.find(q => q.id === id);
  if (!q) return;
  const unlockInfo = state.unlocked.find(u => u.id === id);
  const existing = state.diary[id] || '';

  document.getElementById('detail-modal-overlay').dataset.quoteId = id;
  const detailBadge = document.getElementById('detail-badge');
  const cLabel = categoryLabel(q);
  detailBadge.textContent = cLabel;
  detailBadge.style.display = cLabel ? '' : 'none';
  document.getElementById('detail-text').textContent = q.text;
  document.getElementById('detail-author').textContent = `— ${q.author}`;
  document.getElementById('detail-date').textContent = unlockInfo ? formatUnlockDate(unlockInfo.date) : '';

  const bioBlock = document.getElementById('detail-bio-block');
  if (q.authorBio) {
    document.getElementById('detail-bio-text').textContent = q.authorBio;
    bioBlock.style.display = 'block';
  } else {
    bioBlock.style.display = 'none';
  }

  const backgroundBlock = document.getElementById('detail-background-block');
  if (q.background) {
    document.getElementById('detail-background-text').textContent = q.background;
    backgroundBlock.style.display = 'block';
  } else {
    backgroundBlock.style.display = 'none';
  }

  document.getElementById('detail-diary-textarea').value = existing;
  document.getElementById('detail-diary-count').textContent = existing.length;
  document.getElementById('detail-modal-overlay').classList.add('open');
  lockBodyScroll();
}

function closeDetailModal() {
  document.getElementById('detail-modal-overlay').classList.remove('open');
  unlockBodyScroll();
}

function saveAndCloseDetail() {
  const id = parseInt(document.getElementById('detail-modal-overlay').dataset.quoteId);
  const text = document.getElementById('detail-diary-textarea').value.trim();
  const existing = state.diary[id] || '';
  closeDetailModal();
  if (text === existing) return;
  saveDiaryEntry(id, text);
  renderList();
  showToast(text ? 'コメントを保存しました' : 'コメントを削除しました');
}

function formatUnlockDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日の名言`;
}

// ── 日記保存 ─────────────────────────────────────────────
function saveDiaryEntry(quoteId, text) {
  if (text) {
    state.diary[quoteId] = text;
  } else {
    delete state.diary[quoteId];
  }
  Storage.saveDiary(state.diary);
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
  const q = state.currentQuote;
  if (!q || Notification.permission !== 'granted') return;
  new Notification('今日の名言', {
    body: `${q.text}\n— ${q.author}`,
    icon: './icons/icon-192.png',
    tag: 'daily-quote'
  });
}

async function testNotification() {
  const granted = await requestNotificationPermission();
  if (!granted) { showToast('通知の許可が必要です。設定からONにしてください'); return; }
  fireNotification();
  showToast('テスト通知を送信しました');
}

function updateNotificationSchedule() {
  if (!navigator.serviceWorker.controller) return;
  if (!state.settings.notificationEnabled) {
    navigator.serviceWorker.controller.postMessage({ type: 'CANCEL_NOTIFICATION' });
    return;
  }
  if (!state.currentQuote) return;
  navigator.serviceWorker.controller.postMessage({
    type: 'SCHEDULE_NOTIFICATION',
    time: state.settings.notificationTime,
    quote: state.currentQuote
  });
}

// ── Service Worker登録 ────────────────────────────────────
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      localStorage.setItem('meigen_just_updated', '1');
      window.location.reload();
    }
  });
  navigator.serviceWorker.register('./service-worker.js', { scope: './', updateViaCache: 'none' })
    .then(reg => {
      navigator.serviceWorker.ready.then(() => updateNotificationSchedule());
      const checkWaiting = () => { if (reg.waiting) showUpdateBanner(reg.waiting); };
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(nw);
        });
      });
      checkWaiting();
      // 起動時、待機中のSWが無くても必ず最新版と照合し直す
      // （iOSでは完全終了をまたぐと待機状態が失われることがあるため、受け身のreg.waitingだけに頼らない）
      reg.update().catch(() => {});

      // アプリを開き直す・フォアグラウンドに戻るたびに更新チェックをやり直す
      // （一度見逃すと二度と検知できなくなる事態を防ぐため）
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {});
          checkWaiting();
        }
      });
    })
    .catch(err => console.warn('SW登録失敗:', err));
}

function showUpdateBanner(worker) {
  const banner = document.getElementById('update-banner');
  if (banner.classList.contains('show')) return;
  banner.classList.add('show');
  document.getElementById('update-btn').addEventListener('click', () => {
    banner.classList.remove('show');
    worker.postMessage({ type: 'SKIP_WAITING' });
  });
}

// ── リップルエフェクト ────────────────────────────────────
function spawnRipple(btn, clientX, clientY) {
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement('span');
  ripple.classList.add('ripple');
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${clientX - rect.left - size / 2}px`;
  ripple.style.top  = `${clientY - rect.top  - size / 2}px`;
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 1100);
}

function initRipple() {
  document.addEventListener('pointerdown', e => {
    const btn = e.target.closest('.add-btn, .filter-btn, .nav-btn, .btn-save, .btn-cancel, .btn-edit, .btn-delete, .admin-lock-btn');
    if (!btn) return;
    spawnRipple(btn, e.clientX, e.clientY);
  });
}

// ── インストールバナー ────────────────────────────────────
let deferredPrompt = null;

function initInstallBanner() {
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;
  if (localStorage.getItem('install_dismissed')) return;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (isIOS) { setTimeout(() => showInstallBanner('ios'), 3500); return; }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    setTimeout(() => showInstallBanner('android'), 3500);
  });
}

function showInstallBanner(type) {
  const banner   = document.getElementById('install-banner');
  const msg      = document.getElementById('install-msg');
  const addBtn   = document.getElementById('install-btn');
  const closeBtn = document.getElementById('install-close');
  if (type === 'ios') {
    msg.innerHTML = 'Safari の「共有」→「ホーム画面に追加」でインストールできます。';
    addBtn.style.display = 'none';
  } else {
    msg.innerHTML = 'ホーム画面に追加して、アプリとして使いましょう。';
    addBtn.addEventListener('click', async () => {
      if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; }
      localStorage.setItem('install_dismissed', '1');
      hideInstallBanner();
    });
  }
  banner.classList.add('show');
  closeBtn.addEventListener('click', () => {
    if (document.getElementById('install-no-show').checked) localStorage.setItem('install_dismissed', '1');
    hideInstallBanner();
  });
}

function hideInstallBanner() {
  document.getElementById('install-banner').classList.remove('show');
}

// ── スプラッシュスクリーン ────────────────────────────────
function initSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.addEventListener('animationend', e => {
    if (e.animationName === 'splashFadeOut') {
      splash.remove();
      const el = document.getElementById('quote-text');
      if (el && state.currentQuote) typewriter(el, state.currentQuote.text);
      revealMythicIfNeeded();
    }
  });
}

// ── 超シークレットレア初解放時の演出 ──────────────────────
function revealMythicIfNeeded() {
  if (!dailyQuoteJustRevealed || !state.currentQuote || state.currentQuote.rarity !== 'mythic') return;
  playMythicSound();
  const card = document.getElementById('quote-card');
  if (card) spawnMythicBurst(card, state.currentQuote.themeColors);
}

// ── お気に入り ────────────────────────────────────────────
function toggleFavorite(id) {
  if (state.favorites.includes(id)) {
    state.favorites = state.favorites.filter(f => f !== id);
  } else {
    state.favorites.push(id);
  }
  Storage.saveFavorites(state.favorites);
  const isFav = state.favorites.includes(id);
  if (state.currentQuote && state.currentQuote.id === id) {
    const btn = document.getElementById('card-fav-btn');
    if (btn) { btn.textContent = isFav ? '★' : '☆'; btn.classList.toggle('active', isFav); }
  }
  showToast(isFav ? '⭐ お気に入りに追加しました' : 'お気に入りを解除しました');
}

// ── タイプライター ────────────────────────────────────────
function typewriter(el, text, speed = 60) {
  if (typewriterTimer) clearInterval(typewriterTimer);
  el.classList.add('typing');
  el.textContent = '';
  let i = 0;
  typewriterTimer = setInterval(() => {
    el.textContent += text[i];
    i++;
    if (i >= text.length) { clearInterval(typewriterTimer); typewriterTimer = null; el.classList.remove('typing'); }
  }, speed);
}

// ── 効果音 ───────────────────────────────────────────────
function playStarSound() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [
      { freq: 1047, delay: 0,    dur: 0.22, vol: 0.28 },
      { freq: 1319, delay: 0.07, dur: 0.20, vol: 0.22 },
      { freq: 1568, delay: 0.13, dur: 0.32, vol: 0.18 },
    ];
    notes.forEach(({ freq, delay, dur, vol }) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      const t = audioCtx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t); osc.stop(t + dur + 0.01);
    });
  } catch (e) {}
}

function playMythicSound() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [
      { freq: 523,  delay: 0,    dur: 0.18, vol: 0.22 },
      { freq: 659,  delay: 0.09, dur: 0.18, vol: 0.22 },
      { freq: 784,  delay: 0.18, dur: 0.18, vol: 0.22 },
      { freq: 1047, delay: 0.27, dur: 0.22, vol: 0.24 },
    ];
    notes.forEach(({ freq, delay, dur, vol }) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.type = 'triangle'; osc.frequency.value = freq;
      const t = audioCtx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t); osc.stop(t + dur + 0.02);
    });
    // 最後にきらめくディチューンした高音を重ねる
    [1568, 1580].forEach(freq => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      const t = audioCtx.currentTime + 0.36;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.start(t); osc.stop(t + 0.62);
    });
  } catch (e) {}
}

// ── 超シークレットレア解放バースト ────────────────────────
function spawnMythicBurst(el, colors) {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const palette = (colors && colors.length) ? colors : ['#F0C878', '#ffffff'];

  // 画面フラッシュ
  const flash = document.createElement('div');
  flash.className = 'mythic-flash';
  document.body.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove());

  // 衝撃波リング（2重）
  for (let i = 0; i < 2; i++) {
    const ring = document.createElement('div');
    ring.className = 'mythic-shockwave';
    ring.style.left = cx + 'px';
    ring.style.top = cy + 'px';
    ring.style.borderColor = palette[i % palette.length];
    ring.style.boxShadow = `0 0 24px ${palette[i % palette.length]}`;
    ring.style.animationDelay = (i * 0.1) + 's';
    document.body.appendChild(ring);
    ring.addEventListener('animationend', () => ring.remove());
  }

  // 太めのインパクトライン（少数・不均等な角度で鋭さを出す）
  const count = 8;
  for (let i = 0; i < count; i++) {
    const color = palette[i % palette.length];
    const ray = document.createElement('div');
    ray.className = 'mythic-burst-ray';
    ray.style.setProperty('--ra', ((360 / count) * i + (Math.random() * 14 - 7)) + 'deg');
    ray.style.left = cx + 'px';
    ray.style.top = cy + 'px';
    ray.style.background = color;
    ray.style.boxShadow = `0 0 10px ${color}`;
    document.body.appendChild(ray);
    ray.addEventListener('animationend', () => ray.remove());
  }

  // カード自体の衝撃演出
  el.classList.add('mythic-punch');
  el.addEventListener('animationend', () => el.classList.remove('mythic-punch'), { once: true });
}

// ── スターバーストエフェクト ──────────────────────────────
function spawnStarBurst(btn) {
  const rect = btn.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top  + rect.height / 2;
  for (let i = 0; i < 8; i++) {
    const ray = document.createElement('div');
    ray.className = 'star-burst-ray';
    ray.style.setProperty('--ra', (360 / 8) * i + 'deg');
    ray.style.left = cx + 'px';
    ray.style.top  = cy + 'px';
    document.body.appendChild(ray);
    ray.addEventListener('animationend', () => ray.remove());
  }
  btn.classList.add('star-flash');
  btn.addEventListener('animationend', () => btn.classList.remove('star-flash'), { once: true });
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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── 起動 ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
