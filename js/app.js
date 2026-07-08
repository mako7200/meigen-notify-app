'use strict';

// ── ストレージ管理 ────────────────────────────────────────
// quotes.jsの組み込みデータに新しいフィールドを追加した際、
// 既に端末に保存済みの名言データへ後から補うためのバージョン番号
const QUOTES_DATA_VERSION = 9;

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

const RARITY_ORDER = { mythic: 5, secret_rare: 4, ultra_rare: 3, super_rare: 2, rare: 1 };

function rarityRank(q) {
  return RARITY_ORDER[q.rarity] || 0;
}

// ── レア度別コレクション内訳 ──────────────────────────────
const RARITY_TIERS = [
  { key: 'normal',      label: 'Normal',      segClass: 'seg-normal' },
  { key: 'rare',        label: 'Rare',        segClass: 'seg-rare' },
  { key: 'super_rare',  label: 'Super Rare',  segClass: 'seg-super' },
  { key: 'ultra_rare',  label: 'Ultra Rare',  segClass: 'seg-ultra' },
  { key: 'secret_rare', label: 'Secret Rare', segClass: 'seg-secret' },
  { key: 'mythic',      label: 'Mythic',      segClass: 'seg-mythic' }
];

function getRarityBreakdown() {
  const unlockedIds = state.unlocked.map(u => u.id);
  return RARITY_TIERS.map(tier => {
    const tierQuotes = state.quotes.filter(q => (q.rarity || 'normal') === tier.key);
    const unlocked = tierQuotes.filter(q => unlockedIds.includes(q.id)).length;
    return { ...tier, total: tierQuotes.length, unlocked };
  });
}

function renderProgressTrack() {
  const track = document.getElementById('progress-track');
  if (!track) return;
  const total = state.quotes.length;
  track.innerHTML = getRarityBreakdown().map(tier => {
    const pct = total > 0 ? (tier.unlocked / total) * 100 : 0;
    return `<div class="progress-seg ${tier.segClass}" style="width:${pct}%"></div>`;
  }).join('');
}

function openRarityModal() {
  const unlockedIds = state.unlocked.map(u => u.id);
  document.getElementById('rarity-modal-total').textContent = `${unlockedIds.length} / ${state.quotes.length}`;
  document.getElementById('rarity-modal-rows').innerHTML = getRarityBreakdown()
    .filter(tier => tier.total > 0)
    .map(tier => {
      const pct = tier.total > 0 ? (tier.unlocked / tier.total) * 100 : 0;
      return `
        <div class="rarity-row">
          <div class="rarity-row-label"><span>${tier.label}</span><span class="rarity-row-count">${tier.unlocked} / ${tier.total}</span></div>
          <div class="rarity-row-track"><div class="rarity-row-fill ${tier.segClass}" style="width:${pct}%"></div></div>
        </div>
      `;
    }).join('');
  document.getElementById('rarity-modal-overlay').classList.add('open');
  lockBodyScroll();
}

function closeRarityModal() {
  document.getElementById('rarity-modal-overlay').classList.remove('open');
  unlockBodyScroll();
}

function sortQuotes(quotes, sortKey, dir) {
  let sorted;
  if (sortKey === 'rarity') {
    sorted = [...quotes].sort((a, b) => rarityRank(b) - rarityRank(a));
  } else if (sortKey === 'author') {
    sorted = [...quotes].sort((a, b) => (a.authorReading || a.author).localeCompare(b.authorReading || b.author, 'ja'));
  } else {
    // 通常順 = 入手した順
    const orderIndex = {};
    state.unlocked.forEach((u, i) => { orderIndex[u.id] = i; });
    sorted = [...quotes].sort((a, b) => (orderIndex[a.id] ?? 999999) - (orderIndex[b.id] ?? 999999));
  }
  return dir === 'desc' ? sorted.reverse() : sorted;
}

const SORT_DIR_ARROW = {
  asc:  '<path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12"/>',
  desc: '<path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0-3.75-3.75M17.25 21 21 17.25"/>'
};

function updateSortDirectionBtn(btnId, dir) {
  const btn = document.getElementById(btnId);
  btn.classList.toggle('asc', dir === 'asc');
  btn.classList.toggle('desc', dir === 'desc');
  btn.dataset.dir = dir;
  btn.querySelector('svg').innerHTML = SORT_DIR_ARROW[dir];
}

// ── 自作ドロップダウン（並び替え用） ────────────────────────
function initSortDropdown(dropdownId, onSelect) {
  const dropdown = document.getElementById(dropdownId);
  const btn = dropdown.querySelector('.sort-dropdown-btn');
  const label = dropdown.querySelector('.sort-dropdown-current');
  const options = dropdown.querySelectorAll('.sort-dropdown-option');

  btn.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.sort-dropdown.open').forEach(d => {
      if (d !== dropdown) d.classList.remove('open');
    });
    dropdown.classList.toggle('open');
  });

  options.forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      options.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      label.textContent = opt.textContent;
      dropdown.classList.remove('open');
      onSelect(opt.dataset.value);
    });
  });
}

// ── カテゴリフィルター（複数選択ドロップダウン） ────────────
function updateCategoryFilterLabel(labelId, checkboxClass, filterList) {
  const label = document.getElementById(labelId);
  const total = document.querySelectorAll('.' + checkboxClass).length;
  label.textContent = filterList.length === total
    ? 'すべて'
    : `表示カテゴリ数：${filterList.length}`;
}

function initCategoryFilterDropdown(dropdownId, labelId, checkboxClass, stateKey, onChange) {
  const dropdown = document.getElementById(dropdownId);
  const btn = dropdown.querySelector('.sort-dropdown-btn');
  const menu = dropdown.querySelector('.sort-dropdown-menu');
  const checkboxes = dropdown.querySelectorAll('.' + checkboxClass);

  btn.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.sort-dropdown.open').forEach(d => {
      if (d !== dropdown) d.classList.remove('open');
    });
    dropdown.classList.toggle('open');
  });

  // チェックボックス操作ではドロップダウンを閉じない
  menu.addEventListener('click', e => e.stopPropagation());

  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      const checked = [...checkboxes].filter(c => c.checked).map(c => c.value);
      if (checked.length === 0) {
        cb.checked = true;
        showToast('最低1つのカテゴリを選択してください');
        return;
      }
      state[stateKey] = checked;
      updateCategoryFilterLabel(labelId, checkboxClass, state[stateKey]);
      onChange();
    });
  });
}

function categoryLabel(q) {
  return CATEGORY_LABELS[q.category] || q.category;
}

function mythicStyleAttr(q, withCharacterBg) {
  if (q.rarity !== 'mythic') return '';
  const c = (q.themeColors && q.themeColors.length) ? q.themeColors : MYTHIC_DEFAULT_COLORS;
  let style = `--mc1:${c[0]};--mc2:${c[1]};--mc3:${c[2] || c[0]};`;
  if (withCharacterBg && q.characterImage) {
    style += `background-image: linear-gradient(180deg, rgba(10,6,20,0.35) 0%, rgba(10,6,20,0.65) 55%, rgba(10,6,20,0.92) 100%), url('${q.characterImage}');`;
  }
  return ` style="${style}"`;
}

function characterBgClass(q) {
  return q.characterImage ? ' has-character-bg' : '';
}

// ── 着せ替えテーマ ────────────────────────────────────────
const THEMES = {
  default: {
    label: 'デフォルト',
    unlockId: null,
    icon: null,
    stops: '#090627, #14063a, #0d1a4a, #1a0a3d',
    bgSize: '400% 400%',
    speed: '12s'
  },
  aizen: {
    label: '藍染',
    unlockId: 101,
    icon: 'images/characters/aizen.png',
    stops: '#050208 0%, #4A1580 30%, #3E3A2A 45%, #1A0838 65%, #050208 100%',
    bgSize: '500% 500%',
    speed: '36s'
  },
  giorno: {
    label: 'ジョルノ',
    unlockId: 102,
    icon: 'images/characters/giorno.png',
    stops: '#020805 0%, #0F5C36 30%, #423C22 45%, #0A2818 65%, #020805 100%',
    bgSize: '500% 500%',
    speed: '36s'
  },
  tanaka: {
    label: '田中',
    unlockId: 103,
    icon: 'images/characters/tanaka.png',
    stops: '#050505 0%, #6B2400 30%, #3A2E22 45%, #1A0F08 65%, #050505 100%',
    bgSize: '500% 500%',
    speed: '36s'
  },
  newyear: {
    label: 'お正月',
    seasonal: { start: [12, 28], end: [1, 7] },
    icon: null,
    stops: '#1a0505, #4a0f0f, #6b1010, #8B0000, #C8943B',
    bgSize: '400% 400%',
    speed: '14s'
  },
  sakura: {
    label: '桜',
    seasonal: { start: [3, 20], end: [4, 10] },
    icon: 'images/flowers/CherryBlossomPetals_2_transparent.png',
    stops: '#2a1520, #4a2535, #6b3a50, #E8A0BC, #FFE0EC',
    bgSize: '400% 400%',
    speed: '14s'
  },
  halloween: {
    label: 'ハロウィン',
    seasonal: { start: [10, 25], end: [10, 31] },
    icon: null,
    stops: '#0a0510, #2a1030, #4a1a50, #FF8C00, #1a0520',
    bgSize: '400% 400%',
    speed: '14s'
  }
};

function applyTheme(key) {
  const theme = THEMES[key] || THEMES.default;
  const root = document.documentElement.style;
  root.setProperty('--theme-stops', theme.stops);
  root.setProperty('--theme-bg-size', theme.bgSize);
  root.setProperty('--theme-speed', theme.speed);
  document.documentElement.dataset.theme = key;

  if (key === 'sakura') startSakuraPetals();
  else stopSakuraPetals();
}

// ── 桜テーマ：花びらが舞う演出 ────────────────────────────
let petalIntervalFront = null;
let petalIntervalBack = null;

const PETAL_IMAGE_URLS = [
  'images/flowers/petal_1_transparent.png',
  'images/flowers/petal_2_transparent.png',
  'images/flowers/petal_3_transparent.png',
  'images/flowers/petal_4_transparent.png',
  'images/flowers/petal_5_transparent.png',
  'images/flowers/petal_6_transparent.png',
  'images/flowers/petal_7_transparent.png'
];

function spawnPetal(layer, opts) {
  const petal = document.createElement('div');
  petal.className = 'petal';
  const imageUrl = PETAL_IMAGE_URLS[Math.floor(Math.random() * PETAL_IMAGE_URLS.length)];
  petal.style.backgroundImage = `url('${imageUrl}')`;
  const size = opts.minSize + Math.random() * (opts.maxSize - opts.minSize);
  petal.style.width = size + 'px';
  petal.style.left = Math.random() * 100 + '%';
  const glow = opts.glow || '0 0 4px rgba(255, 170, 210, 0.9)';
  petal.style.filter = (opts.blur ? `blur(${opts.blur}px) ` : '') + `drop-shadow(${glow})`;
  if (opts.opacity) petal.style.opacity = opts.opacity;

  // 見た目にさらにバリエーションが出るよう、初期角度と左右反転もランダムにする
  petal.style.setProperty('--base-rotate', (Math.random() * 360) + 'deg');
  petal.style.setProperty('--flip', Math.random() < 0.5 ? 1 : -1);

  const duration = opts.minDuration + Math.random() * (opts.maxDuration - opts.minDuration);
  const fallHeight = layer.clientHeight || window.innerHeight;
  const rotateDir = Math.random() < 0.5 ? 1 : -1;
  petal.style.setProperty('--mid-x1', ((Math.random() * 2 - 1) * opts.sway) + 'px');
  petal.style.setProperty('--mid-x2', ((Math.random() * 2 - 1) * opts.sway) + 'px');
  petal.style.setProperty('--fall-mid', (fallHeight * 0.35) + 'px');
  petal.style.setProperty('--fall-mid2', (fallHeight * 0.7) + 'px');
  petal.style.setProperty('--fall-end', (fallHeight + 30) + 'px');
  petal.style.setProperty('--rotate-dir', rotateDir);
  petal.style.animationDuration = duration + 's';

  layer.appendChild(petal);
  setTimeout(() => petal.remove(), duration * 1000 + 100);
}

function startSakuraPetals() {
  stopSakuraPetals();
  const layer = document.getElementById('petal-layer');
  if (!layer) return;
  petalIntervalBack = setInterval(() => spawnPetal(layer, {
    minSize: 14, maxSize: 20, minDuration: 32, maxDuration: 44, sway: 35, blur: 1.5, opacity: 0.5,
    glow: '0 0 3px rgba(255, 170, 210, 0.7)'
  }), 700);
  petalIntervalFront = setInterval(() => spawnPetal(layer, {
    minSize: 22, maxSize: 30, minDuration: 20, maxDuration: 28, sway: 60,
    glow: '0 0 6px rgba(255, 170, 210, 0.9)'
  }), 700);
}

function stopSakuraPetals() {
  clearInterval(petalIntervalBack);
  clearInterval(petalIntervalFront);
  petalIntervalBack = null;
  petalIntervalFront = null;
  const layer = document.getElementById('petal-layer');
  if (layer) layer.innerHTML = '';
}

function isThemeUnlocked(key) {
  if (state.isAdmin) return true;
  const theme = THEMES[key];
  if (theme.seasonal) return state.seasonalUnlocked.includes(key);
  if (!theme.unlockId) return true;
  return state.unlocked.some(u => u.id === theme.unlockId);
}

// ── 季節限定テーマ：期間中にアプリを開くと解放（以後もずっと使える） ──
function isDateInSeasonalRange(seasonal, date) {
  const value = (date.getMonth() + 1) * 100 + date.getDate();
  const start = seasonal.start[0] * 100 + seasonal.start[1];
  const end = seasonal.end[0] * 100 + seasonal.end[1];
  if (start <= end) return value >= start && value <= end;
  return value >= start || value <= end; // 年をまたぐ期間（例：12/28〜1/7）
}

function checkSeasonalThemeUnlocks() {
  const today = new Date();
  let newlyUnlockedLabel = null;
  Object.keys(THEMES).forEach(key => {
    const theme = THEMES[key];
    if (!theme.seasonal || state.seasonalUnlocked.includes(key)) return;
    if (isDateInSeasonalRange(theme.seasonal, today)) {
      state.seasonalUnlocked.push(key);
      newlyUnlockedLabel = theme.label;
    }
  });
  if (newlyUnlockedLabel) {
    Storage.saveSeasonalUnlocked(state.seasonalUnlocked);
    showToast(`季節限定テーマ「${newlyUnlockedLabel}」を解放しました`);
  }
}

function renderThemeSwatches() {
  const list = document.getElementById('theme-swatch-list');
  const lockSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>';
  list.innerHTML = Object.keys(THEMES).map(key => {
    const theme = THEMES[key];
    const unlocked = isThemeUnlocked(key);
    const isActive = state.settings.theme === key;
    return `
      <button class="theme-swatch${isActive ? ' active' : ''}${unlocked ? '' : ' locked'}" data-theme="${key}">
        <div class="theme-swatch-circle" style="background-image: linear-gradient(-45deg, ${theme.stops});">
          ${unlocked ? '' : `<span class="theme-swatch-lock-icon">${lockSvg}</span>`}
        </div>
        <div class="theme-swatch-label">${unlocked ? theme.label : '？？？'}</div>
      </button>
    `;
  }).join('');

  const currentTheme = THEMES[state.settings.theme] || THEMES.default;
  const currentIcon = document.getElementById('theme-current-icon');
  if (currentTheme.icon) {
    currentIcon.style.backgroundImage = `url('${currentTheme.icon}')`;
    currentIcon.classList.add('visible');
  } else {
    currentIcon.style.backgroundImage = '';
    currentIcon.classList.remove('visible');
  }
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
        themeColors: q.themeColors || initial.themeColors,
        characterImage: q.characterImage || initial.characterImage,
        authorReading: q.authorReading || initial.authorReading
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
    const defaults = { notificationTime: '07:00', notificationEnabled: false, theme: 'default', catEnabled: true };
    const saved = localStorage.getItem('meigen_settings');
    if (saved) return { ...defaults, ...JSON.parse(saved) };
    return defaults;
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
  saveDiary(diary) { localStorage.setItem('meigen_diary', JSON.stringify(diary)); },
  // 連続ログイン { count, lastDate }
  getStreak() { const s = localStorage.getItem('meigen_streak'); return s ? JSON.parse(s) : { count: 0, lastDate: '' }; },
  saveStreak(streak) { localStorage.setItem('meigen_streak', JSON.stringify(streak)); },
  // ログインボーナス { date, quoteId }
  getBonusRecord() { const s = localStorage.getItem('meigen_bonus'); return s ? JSON.parse(s) : null; },
  saveBonusRecord(r) { localStorage.setItem('meigen_bonus', JSON.stringify(r)); },
  // 解放済み季節限定テーマ一覧 [key, ...]
  getSeasonalUnlocked() { const s = localStorage.getItem('meigen_seasonal_unlocked'); return s ? JSON.parse(s) : []; },
  saveSeasonalUnlocked(list) { localStorage.setItem('meigen_seasonal_unlocked', JSON.stringify(list)); }
};

// ── アプリ状態 ────────────────────────────────────────────
let state = {
  currentTab: 'home',
  quotes: [],
  settings: {},
  currentQuote: null,
  listFilterCategories: ['historical', 'philosophy', 'business', 'sports', 'special'],
  manageFilterCategories: ['historical', 'philosophy', 'business', 'sports', 'special'],
  listSearch: '',
  manageSearch: '',
  listSort: 'default',
  manageSort: 'default',
  listSortDir: 'asc',
  manageSortDir: 'asc',
  editingId: null,
  favorites: [],
  listFavoriteOnly: false,
  unlocked: [],   // [{ id, date }, ...]
  diary: {},      // { [quoteId]: "text" }
  isAdmin: false, // セッション中のみ有効（再読み込みでリセット）
  streak: 0,
  seasonalUnlocked: [] // 解放済み季節限定テーマのキー一覧
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
  state.seasonalUnlocked = Storage.getSeasonalUnlocked();
  updateStreak();
  state.currentQuote = getDailyQuote();
  checkSeasonalThemeUnlocks();

  applyTheme(state.settings.theme);
  renderHome();
  renderList();
  renderManage();
  renderSettings();
  bindEvents();
  initRipple();
  initSplash();
  initInstallBanner();
  initCatWidget();
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

// ── 連続ログインボーナス ──────────────────────────────────
// 10日を1周期とし、周期内の3日目・7日目・10日目にボーナスが発生する
const BONUS_CYCLE = 10;
const BONUS_MILESTONES = [3, 7, 10];

function updateStreak() {
  const today = new Date().toDateString();
  const streak = Storage.getStreak();
  if (streak.lastDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    streak.count = (streak.lastDate === yesterday) ? streak.count + 1 : 1;
    streak.lastDate = today;
    Storage.saveStreak(streak);
  }
  state.streak = streak.count;
}

function getCyclePosition(streak) {
  const pos = streak % BONUS_CYCLE;
  return pos === 0 ? BONUS_CYCLE : pos;
}

function getBonusMilestone(streak) {
  if (streak <= 0) return null;
  const pos = getCyclePosition(streak);
  return BONUS_MILESTONES.includes(pos) ? pos : null;
}

function isBonusDay() {
  return getBonusMilestone(state.streak) !== null;
}

function daysUntilNextBonus(streak) {
  const pos = getCyclePosition(streak);
  const next = BONUS_MILESTONES.find(m => m > pos);
  return (next !== undefined ? next : BONUS_CYCLE + BONUS_MILESTONES[0]) - pos;
}

function getTodaysBonusRecord() {
  const today = new Date().toDateString();
  const record = Storage.getBonusRecord();
  return (record && record.date === today) ? record : null;
}

// 節目ごとの確定レア度条件（該当カードが尽きていたら通常抽選2枚にフォールバック）
function milestoneRarityFilter(milestone) {
  if (milestone === 3) return q => !!q.rarity; // レア以上（ノーマル以外）
  if (milestone === 7) return q => ['super_rare', 'ultra_rare', 'secret_rare', 'mythic'].includes(q.rarity);
  if (milestone === 10) return q => q.rarity === 'ultra_rare'; // ウルトラレアちょうど
  return () => true;
}

function claimBonusQuote() {
  const today = new Date().toDateString();
  const milestone = getBonusMilestone(state.streak);
  const unlockedIds = state.unlocked.map(u => u.id);
  const filterFn = milestoneRarityFilter(milestone);

  let pool = state.quotes.filter(q => !unlockedIds.includes(q.id) && filterFn(q));
  let drawCount = 1;
  if (pool.length === 0) {
    // 対象レア度を集め尽くしている場合は、レア度を問わず2枚引けるボーナスに切り替え
    pool = state.quotes.filter(q => !unlockedIds.includes(q.id));
    drawCount = 2;
  }
  if (pool.length === 0) pool = [...state.quotes]; // 全部見たらリセット

  const chosenList = [];
  for (let i = 0; i < drawCount && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const chosen = pool.splice(idx, 1)[0];
    chosenList.push(chosen);
    if (!state.unlocked.find(u => u.id === chosen.id)) {
      state.unlocked.push({ id: chosen.id, date: today });
    }
  }
  Storage.saveUnlocked(state.unlocked);
  Storage.saveBonusRecord({ date: today, quoteIds: chosenList.map(q => q.id) });
  return chosenList;
}

function renderStreakIndicator() {
  const el = document.getElementById('streak-indicator');
  if (!el) return;
  if (state.streak <= 0) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = 'block';

  const pos = getCyclePosition(state.streak);
  const claimedToday = isBonusDay() && !!getTodaysBonusRecord();
  const dots = [];
  for (let day = 1; day <= BONUS_CYCLE; day++) {
    const isMilestone = BONUS_MILESTONES.includes(day);
    let cls = 'streak-dot' + (isMilestone ? ` milestone milestone-${day}` : '');
    if (day < pos || (day === pos && (!isMilestone || claimedToday))) cls += ' done';
    else if (day === pos) cls += ' current';
    dots.push(`<span class="${cls}"></span>`);
  }

  const sub = isBonusDay()
    ? (claimedToday ? '受取済み' : '')
    : `あと${daysUntilNextBonus(state.streak)}日`;

  el.innerHTML = `
    <div class="streak-row">
      <span class="streak-main-group">
        <span class="streak-main">ログイン ${state.streak}日目</span>
        <svg class="progress-label-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
      </span>
      ${sub ? `<span class="streak-sub">${sub}</span>` : ''}
    </div>
    <div class="streak-dots">${dots.join('')}</div>
  `;
}

// ── 連続ログインボーナス説明モーダル ──────────────────────
const LOGIN_MILESTONE_INFO = {
  3:  { reward: 'R↑',  cls: 'milestone-3' },
  7:  { reward: 'SR↑', cls: 'milestone-7' },
  10: { reward: 'UR',  cls: 'milestone-10' }
};
let loginModalCatTimer = null;

function openLoginModal() {
  if (state.streak <= 0) return;
  const pos = getCyclePosition(state.streak);
  const claimedToday = isBonusDay() && !!getTodaysBonusRecord();

  const statusText = isBonusDay()
    ? (claimedToday ? '本日のボーナスは受取済みです' : '本日はボーナス対象日です')
    : `次のボーナスまであと${daysUntilNextBonus(state.streak)}日`;

  document.getElementById('login-modal-current').innerHTML = `
    <span class="login-modal-day">ログイン ${state.streak}日目</span>
    <span class="login-modal-sub">${statusText}</span>
  `;

  const cells = [];
  for (let day = 1; day <= BONUS_CYCLE; day++) {
    const info = LOGIN_MILESTONE_INFO[day];
    const isCurrent = day === pos;
    let cls = 'login-day-cell' + (info ? ` milestone ${info.cls}` : '');
    if (day < pos || (isCurrent && (!info || claimedToday))) cls += ' done';
    else if (isCurrent) cls += ' current';
    cells.push(`
      <div class="${cls}">
        <span class="login-day-num">${day}</span>
        <span class="login-day-reward">${info ? info.reward : ''}</span>
      </div>
    `);
  }

  document.getElementById('login-modal-rows').innerHTML = `
    <div class="login-day-grid">${cells.join('')}</div>
  `;

  document.getElementById('login-modal-cat-row').classList.toggle('hidden', !state.settings.catEnabled);

  // 起きて挨拶した後、3秒経ったら眠りにつく
  const catImg = document.getElementById('login-modal-cat-img');
  const catSpeech = document.getElementById('login-modal-cat-speech');
  catImg.src = CAT_IMG.awake;
  catSpeech.textContent = '明日もログインするニャ';
  clearTimeout(loginModalCatTimer);
  loginModalCatTimer = setTimeout(() => {
    catImg.src = CAT_IMG.sleeping;
    catSpeech.textContent = 'zzz';
  }, 3000);

  document.getElementById('login-modal-overlay').classList.add('open');
  lockBodyScroll();
}

function closeLoginModal() {
  clearTimeout(loginModalCatTimer);
  document.getElementById('login-modal-overlay').classList.remove('open');
  unlockBodyScroll();
}

function renderBonusArea() {
  const area = document.getElementById('bonus-area');
  if (!area) return;
  if (!isBonusDay() || getTodaysBonusRecord()) { area.innerHTML = ''; return; }

  area.innerHTML = `
    <button class="bonus-banner" id="bonus-claim-btn">
      <svg class="bonus-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" /></svg>
      <div>
        <div class="bonus-text-main">${state.streak}日連続ログインボーナス！</div>
        <div class="bonus-text-sub">タップしてもう1枚めくる</div>
      </div>
      <span class="bonus-arrow">›</span>
    </button>
  `;
  document.getElementById('bonus-claim-btn').addEventListener('click', () => {
    const bonusQuotes = claimBonusQuote();
    const bonusQuote = bonusQuotes[0];
    state.currentQuote = bonusQuote;
    renderHome();
    renderList();
    renderManage();
    if (bonusQuotes.length > 1) {
      showToast(`条件のレア度を集め尽くしていたため、代わりに${bonusQuotes.length}枚解放しました`);
    }
    if (bonusQuote.rarity === 'mythic') {
      setTimeout(() => {
        playMythicSound();
        const quoteCard = document.getElementById('quote-card');
        if (quoteCard) spawnMythicBurst(quoteCard, bonusQuote.themeColors);
      }, typewriterDuration(bonusQuote.text));
    }
    if (bonusQuote.rarity) {
      setTimeout(wakeCat, typewriterDuration(bonusQuote.text));
    }
  });
}

// ── ホームタブ描画 ────────────────────────────────────────
function renderHome() {
  const q = state.currentQuote;
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日（${['日','月','火','水','木','金','土'][today.getDay()]}）`;

  document.getElementById('home-date').textContent = dateStr + '　今日の一言';
  renderStreakIndicator();
  renderBonusArea();

  if (!q) {
    document.getElementById('home-quote-area').innerHTML =
      '<div class="empty-state"><div class="empty-icon">📭</div><p>表示できる名言がありません。</p></div>';
    return;
  }

  const isFav = state.favorites.includes(q.id);
  const rank = RANK_META[q.rarity];
  const cLabel = categoryLabel(q);
  document.getElementById('home-quote-area').innerHTML = `
    <div class="quote-card${rank ? ' ' + rank.class : ''}${characterBgClass(q)}" id="quote-card"${mythicStyleAttr(q, true)}>
      ${rankRingHtml(q.rarity)}
      <button class="card-fav-btn${isFav ? ' active' : ''}" id="card-fav-btn">${isFav ? '★' : '☆'}</button>
      <div class="quote-text" id="quote-text"></div>
      <div class="quote-author-row">
        <span class="quote-author-name">${escapeHtml(q.author)}</span>
      </div>
      <div class="quote-meta-row">
        <button class="card-detail-btn" id="card-detail-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><circle cx="12" cy="8.25" r="0.75" fill="currentColor" stroke="none"/></svg>
          名言の詳細
          <svg class="btn-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
        </button>
        ${cLabel ? `<span class="category-badge">${cLabel}</span>` : ''}
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

  document.getElementById('card-detail-btn').addEventListener('click', () => {
    openDetailModal(q.id);
  });

  // 超シークレットレア：カードタップで演出を何度でも見られる
  if (q.rarity === 'mythic') {
    document.getElementById('quote-card').addEventListener('click', e => {
      if (e.target.closest('#card-fav-btn') || e.target.closest('#card-detail-btn')) return;
      playMythicSound();
      spawnMythicBurst(document.getElementById('quote-card'), q.themeColors);
    });
  }

  if (!document.getElementById('splash')) {
    typewriter(document.getElementById('quote-text'), q.text);
  }
}

// ── 一覧タブ描画 ──────────────────────────────────────────
function renderList() {
  const unlockedIds = state.unlocked.map(u => u.id);
  const search = state.listSearch.trim().toLowerCase();

  const categoryFilterTotal = document.querySelectorAll('.category-filter-checkbox').length;
  const allCategoriesSelected = state.listFilterCategories.length === categoryFilterTotal;
  let unlockedQuotes = state.quotes.filter(q => {
    if (!unlockedIds.includes(q.id)) return false;
    if (state.listFavoriteOnly && !state.favorites.includes(q.id)) return false;
    if (!state.listFilterCategories.includes(q.category)) return false;
    if (search) return q.text.toLowerCase().includes(search) || q.author.toLowerCase().includes(search);
    return true;
  });
  unlockedQuotes = sortQuotes(unlockedQuotes, state.listSort, state.listSortDir);

  const totalLocked = state.quotes.length - unlockedIds.length;
  document.getElementById('progress-count').textContent = `${unlockedIds.length} / ${state.quotes.length}`;
  renderProgressTrack();

  if (unlockedQuotes.length === 0 && (state.listFavoriteOnly || search || !allCategoriesSelected)) {
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
  if (!state.listFavoriteOnly && !search && allCategoriesSelected) {
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
  let quotes = state.isAdmin ? state.quotes : state.quotes.filter(q => unlockedIds.includes(q.id));

  const manageCategoryFilterTotal = document.querySelectorAll('.manage-category-filter-checkbox').length;
  const manageAllCategoriesSelected = state.manageFilterCategories.length === manageCategoryFilterTotal;
  quotes = quotes.filter(q => state.manageFilterCategories.includes(q.category));

  const search = state.manageSearch.trim().toLowerCase();
  if (search) {
    quotes = quotes.filter(q => q.text.toLowerCase().includes(search) || q.author.toLowerCase().includes(search));
  }
  quotes = sortQuotes(quotes, state.manageSort, state.manageSortDir);

  if (quotes.length === 0) {
    document.getElementById('manage-list').innerHTML = (search || !manageAllCategoriesSelected)
      ? '<div class="empty-state"><div class="empty-icon">🔍</div><p>該当する名言が見つかりませんでした。</p></div>'
      : '<div class="empty-state"><div class="empty-icon">✏️</div><p>開放済みの名言がありません。<br>ホームで名言を開放すると表示されます。</p></div>';
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
  document.getElementById('cat-toggle').checked = s.catEnabled;
  renderThemeSwatches();
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

  // 管理：検索
  document.getElementById('manage-search').addEventListener('input', e => {
    state.manageSearch = e.target.value;
    renderManage();
  });

  // 一覧・管理：並び替え（自作ドロップダウン）
  initSortDropdown('list-sort-dropdown', value => {
    state.listSort = value;
    renderList();
  });
  initSortDropdown('manage-sort-dropdown', value => {
    state.manageSort = value;
    renderManage();
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.sort-dropdown.open').forEach(d => d.classList.remove('open'));
  });

  // 並び替え：昇順・降順の切り替え
  document.getElementById('list-sort-direction').addEventListener('click', () => {
    state.listSortDir = state.listSortDir === 'asc' ? 'desc' : 'asc';
    updateSortDirectionBtn('list-sort-direction', state.listSortDir);
    renderList();
  });
  document.getElementById('manage-sort-direction').addEventListener('click', () => {
    state.manageSortDir = state.manageSortDir === 'asc' ? 'desc' : 'asc';
    updateSortDirectionBtn('manage-sort-direction', state.manageSortDir);
    renderManage();
  });

  // ページトップへ戻るボタン
  const scrollTopBtn = document.getElementById('scroll-top-btn');
  const mainEl = document.querySelector('main');
  mainEl.addEventListener('scroll', () => {
    scrollTopBtn.classList.toggle('show', mainEl.scrollTop > 300);
  });
  scrollTopBtn.addEventListener('click', () => {
    mainEl.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // 一覧・管理：カテゴリフィルター（複数選択ドロップダウン）
  initCategoryFilterDropdown('category-filter-dropdown', 'category-filter-label', 'category-filter-checkbox', 'listFilterCategories', renderList);
  initCategoryFilterDropdown('manage-category-filter-dropdown', 'manage-category-filter-label', 'manage-category-filter-checkbox', 'manageFilterCategories', renderManage);

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

  // レア度別内訳モーダル
  document.getElementById('progress-block').addEventListener('click', openRarityModal);
  document.getElementById('rarity-modal-close').addEventListener('click', closeRarityModal);
  document.getElementById('rarity-modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'rarity-modal-overlay') closeRarityModal();
  });

  // 連続ログインボーナス説明モーダル
  document.getElementById('streak-indicator').addEventListener('click', openLoginModal);
  document.getElementById('login-modal-close').addEventListener('click', closeLoginModal);
  document.getElementById('login-modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'login-modal-overlay') closeLoginModal();
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
    if (quote.rarity === 'mythic') {
      setTimeout(() => {
        playMythicSound();
        const quoteCard = document.getElementById('quote-card');
        if (quoteCard) spawnMythicBurst(quoteCard, quote.themeColors);
      }, 450 + typewriterDuration(quote.text));
    }
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

  // 設定：猫の表示トグル
  document.getElementById('cat-toggle').addEventListener('change', e => {
    state.settings.catEnabled = e.target.checked;
    Storage.saveSettings(state.settings);
    updateCatVisibility();
  });

  // 設定：通知時間
  document.getElementById('notif-time').addEventListener('change', e => {
    state.settings.notificationTime = e.target.value;
    Storage.saveSettings(state.settings);
    updateNotificationSchedule();
    showToast(`通知時間を ${e.target.value} に設定しました`);
  });

  // 着せ替え：テーマ選択
  document.getElementById('theme-swatch-list').addEventListener('click', e => {
    const swatch = e.target.closest('.theme-swatch');
    if (!swatch) return;
    const key = swatch.dataset.theme;
    if (!isThemeUnlocked(key)) { showToast('まだ解放されていないテーマです'); return; }
    state.settings.theme = key;
    Storage.saveSettings(state.settings);
    applyTheme(key);
    renderThemeSwatches();
    showToast(`テーマを「${THEMES[key].label}」に変更しました`);
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

  // 設定：最新バージョンを手動確認
  document.getElementById('check-update-btn').addEventListener('click', checkForUpdatesManually);

  // 管理者：次の名言（テスト表示、実際の解放状況には影響しない）
  document.getElementById('admin-next-quote-btn').addEventListener('click', () => {
    if (!state.isAdmin || state.quotes.length === 0) return;
    state.currentQuote = state.quotes[Math.floor(Math.random() * state.quotes.length)];
    renderHome();
    if (state.currentQuote.rarity === 'mythic') {
      const quote = state.currentQuote;
      setTimeout(() => {
        playMythicSound();
        const quoteCard = document.getElementById('quote-card');
        if (quoteCard) spawnMythicBurst(quoteCard, quote.themeColors);
      }, typewriterDuration(quote.text));
    }
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
  if (tab === 'settings') renderSettings();
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

  const detailBox = document.querySelector('.detail-modal-box');
  if (q.characterImage) {
    detailBox.classList.add('has-character-bg');
    detailBox.style.backgroundImage = `linear-gradient(180deg, rgba(10,6,20,0.45) 0%, rgba(10,6,20,0.75) 55%, rgba(10,6,20,0.92) 100%), url('${q.characterImage}')`;
  } else {
    detailBox.classList.remove('has-character-bg');
    detailBox.style.backgroundImage = '';
  }

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

function checkForUpdatesManually() {
  if (!('serviceWorker' in navigator)) { showToast('この環境では更新確認ができません'); return; }
  showToast('確認中...');
  navigator.serviceWorker.getRegistration().then(reg => {
    if (!reg) { showToast('確認できませんでした'); return; }
    reg.update().then(() => {
      setTimeout(() => {
        const banner = document.getElementById('update-banner');
        if (reg.waiting || banner.classList.contains('show')) return;
        showToast('最新バージョンです');
      }, 1500);
    }).catch(() => showToast('確認に失敗しました。通信状況をご確認ください'));
  });
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
    const btn = e.target.closest('.add-btn, .nav-btn, .btn-save, .btn-cancel, .btn-edit, .btn-delete, .admin-lock-btn');
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
      wakeCatIfRareReveal();
    }
  });
}

// ── 超シークレットレア初解放時の演出 ──────────────────────
function typewriterDuration(text, speed = 60) {
  return (text ? text.length : 0) * speed;
}

function revealMythicIfNeeded() {
  if (!dailyQuoteJustRevealed || !state.currentQuote || state.currentQuote.rarity !== 'mythic') return;
  setTimeout(() => {
    playMythicSound();
    const card = document.getElementById('quote-card');
    if (card) spawnMythicBurst(card, state.currentQuote.themeColors);
  }, typewriterDuration(state.currentQuote.text) + 400);
}

// ── 猫ウィジェット ────────────────────────────────────────
const CAT_IMG = {
  sleeping: 'images/animals/cat_sleeping_dot_transparent.png',
  awake:    'images/animals/cat_awake_dot_transparent.png',
  yawn:     'images/animals/cat_yawn_dot_transparent.png'
};
let catIdleTimer = null;
let catActionTimer = null;
let catState = 'sleeping';

function setCatState(nextState) {
  const el = document.getElementById('cat-widget');
  if (!el) return;
  catState = nextState;
  el.src = CAT_IMG[nextState];
  el.classList.remove('cat-awake', 'cat-yawn');
  if (nextState !== 'sleeping') {
    void el.offsetWidth; // アニメーションを再生させるための強制リフロー
    el.classList.add(nextState === 'awake' ? 'cat-awake' : 'cat-yawn');
  }
}

// 気まぐれに眠り続け、稀にあくびだけする（「起きる」は自動では発生させない）
function scheduleCatIdle() {
  if (!state.settings.catEnabled) return;
  clearTimeout(catIdleTimer);
  clearTimeout(catActionTimer);
  setCatState('sleeping');
  const sleepTime = 8000 + Math.random() * 8000;
  catIdleTimer = setTimeout(() => {
    if (Math.random() < 0.15) {
      setCatState('yawn');
      const actionTime = 1200 + Math.random() * 800;
      catActionTimer = setTimeout(scheduleCatIdle, actionTime);
    } else {
      scheduleCatIdle();
    }
  }, sleepTime);
}

// レア以上の名言解放時に確実に起こす（ご褒美イベントなので気まぐれ抽選の対象外）
function wakeCat() {
  if (!state.settings.catEnabled || !document.getElementById('cat-widget')) return;
  clearTimeout(catIdleTimer);
  clearTimeout(catActionTimer);
  setCatState('awake');
  catActionTimer = setTimeout(scheduleCatIdle, 10000);
}

function wakeCatIfRareReveal() {
  if (!dailyQuoteJustRevealed || !state.currentQuote || !state.currentQuote.rarity) return;
  setTimeout(wakeCat, typewriterDuration(state.currentQuote.text));
}

// タップ（3回に1回）への反応：無視60% / どこかへ行く30% / スローまばたき10%
function reactToTap() {
  const el = document.getElementById('cat-widget');
  if (!state.settings.catEnabled || !el) return;
  clearTimeout(catIdleTimer);
  clearTimeout(catActionTimer);

  const roll = Math.random();
  if (roll < 0.6) {
    // 無視：ちらっと目を開けてすぐ寝る
    setCatState('awake');
    catActionTimer = setTimeout(scheduleCatIdle, 500);

  } else if (roll < 0.9) {
    // どこかへ行ってしまう
    setCatState('awake');
    catActionTimer = setTimeout(() => {
      el.classList.add('away');
      catActionTimer = setTimeout(() => {
        el.classList.remove('away');
        scheduleCatIdle();
      }, 2500 + Math.random() * 1500);
    }, 300);

  } else {
    // スローまばたき（レア）：猫の愛情表現とされる仕草
    setCatState('awake');
    el.classList.add('cat-slow-blink');
    catActionTimer = setTimeout(() => {
      el.classList.remove('cat-slow-blink');
      scheduleCatIdle();
    }, 10000);
  }
}

// 設定の「猫の表示」トグルに応じて表示/非表示を切り替える
function updateCatVisibility() {
  const el = document.getElementById('cat-widget');
  if (!el) return;
  if (state.settings.catEnabled) {
    el.classList.remove('hidden');
    scheduleCatIdle();
  } else {
    el.classList.add('hidden');
    clearTimeout(catIdleTimer);
    clearTimeout(catActionTimer);
  }
}

let catTapCount = 0;

function initCatWidget() {
  const el = document.getElementById('cat-widget');
  if (!el) return;
  // 目を開けている（起きている/あくび中）ときは連打防止のためタップを無視する
  // 眠っている時も3回タップに1回だけ起こす（毎回起こすと猫がかわいそうなため）
  el.addEventListener('click', () => {
    if (catState !== 'sleeping') return;
    catTapCount++;
    if (catTapCount < 3) return;
    catTapCount = 0;
    reactToTap();
  });
  updateCatVisibility();
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
    ring.style.animationDelay = (i * 0.2) + 's';
    document.body.appendChild(ring);
    ring.addEventListener('animationend', () => ring.remove());
  }

  // 太めのインパクトライン（少数・不均等な角度で鋭さを出す）
  const count = 16;
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
