'use strict';

// iOSのホーム画面追加（standalone）時、window.innerHeightがステータスバー分だけ実際の画面より
// 短く報告される不具合があるため、standalone時のみwindow.screen.height（実際の画面の高さ）を使う
function updateRealViewportHeight() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const h = isStandalone ? window.screen.height : window.innerHeight;
  document.documentElement.style.setProperty('--real-vh', h + 'px');
}
updateRealViewportHeight();
window.addEventListener('resize', updateRealViewportHeight);

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
  snow: {
    label: '雪',
    seasonal: { start: [12, 1], end: [2, 28] },
    icon: 'images/winter/snowflake_1_transparent.png',
    stops: '#0a1428, #16233f, #2a3f5f, #A8C8E8, #F0F8FF',
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
    icon: 'images/Halloween/pumpkin_1_transparent.png',
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

  if (key === 'halloween') startHalloweenEffects();
  else stopHalloweenEffects();

  if (key === 'snow') startSnowEffect();
  else stopSnowEffect();
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
    minSize: 14, maxSize: 20, minDuration: 32, maxDuration: 44, sway: 35, opacity: 0.5,
    glow: '0 0 3px rgba(255, 170, 210, 0.7)'
  }), 2800);
  petalIntervalFront = setInterval(() => spawnPetal(layer, {
    minSize: 22, maxSize: 30, minDuration: 20, maxDuration: 28, sway: 60,
    glow: '0 0 6px rgba(255, 170, 210, 0.9)'
  }), 2800);
}

function stopSakuraPetals() {
  clearInterval(petalIntervalBack);
  clearInterval(petalIntervalFront);
  petalIntervalBack = null;
  petalIntervalFront = null;
  const layer = document.getElementById('petal-layer');
  if (layer) layer.innerHTML = '';
}

// ── ハロウィンテーマ：コウモリが横切り、お化けが浮かび上がる演出 ──
let batInterval = null;
let ghostInterval = null;

function spawnBat(layer) {
  const bat = document.createElement('div');
  bat.className = 'bat';
  bat.style.backgroundImage = "url('images/Halloween/bat_1_transparent.png')";
  const size = 70 + Math.random() * 30;
  bat.style.width = size + 'px';
  bat.style.top = (10 + Math.random() * 60) + '%';
  bat.style.opacity = 0.55;

  const layerWidth = layer.clientWidth || window.innerWidth;
  const leftToRight = Math.random() < 0.5;
  const startX = leftToRight ? -80 : layerWidth + 80;
  const endX = leftToRight ? layerWidth + 80 : -80;
  bat.style.setProperty('--start-x', startX + 'px');
  bat.style.setProperty('--end-x', endX + 'px');
  bat.style.setProperty('--flip', leftToRight ? 1 : -1);
  bat.style.setProperty('--bob', ((Math.random() < 0.5 ? -1 : 1) * (15 + Math.random() * 15)) + 'px');

  const duration = 6 + Math.random() * 4;
  bat.style.animationDuration = duration + 's';

  layer.appendChild(bat);
  setTimeout(() => bat.remove(), duration * 1000 + 100);
}

function spawnGhost(layer) {
  const ghost = document.createElement('div');
  ghost.className = 'ghost';
  ghost.style.backgroundImage = "url('images/Halloween/ghost_1_transparent.png')";
  const size = 32 + Math.random() * 18;
  ghost.style.width = size + 'px';
  ghost.style.left = (10 + Math.random() * 80) + '%';

  const layerHeight = layer.clientHeight || window.innerHeight;
  ghost.style.setProperty('--float-height', (layerHeight * 0.6 + Math.random() * layerHeight * 0.3) + 'px');
  ghost.style.setProperty('--sway', (((Math.random() * 2) - 1) * 20) + 'px');

  const duration = 8 + Math.random() * 4;
  ghost.style.animationDuration = duration + 's';

  layer.appendChild(ghost);
  setTimeout(() => ghost.remove(), duration * 1000 + 100);
}

function startHalloweenEffects() {
  stopHalloweenEffects();
  const layer = document.getElementById('halloween-layer');
  if (!layer) return;
  batInterval = setInterval(() => spawnBat(layer), 24000 + Math.random() * 10000);
  ghostInterval = setInterval(() => spawnGhost(layer), 24000 + Math.random() * 10000);
}

function stopHalloweenEffects() {
  clearInterval(batInterval);
  clearInterval(ghostInterval);
  batInterval = null;
  ghostInterval = null;
  const layer = document.getElementById('halloween-layer');
  if (layer) layer.innerHTML = '';
}

// ── 雪テーマ：雪が降る演出 ────────────────────────────
let snowIntervalFront = null;
let snowIntervalBack = null;

const SNOW_IMAGE_TYPES = [
  { key: 'snowflake', url: 'images/winter/snowflake_1_transparent.png' },
  { key: 'snowball', url: 'images/winter/snowball_1_transparent.png' }
];

function spawnSnow(layer, opts) {
  const flake = document.createElement('div');
  flake.className = 'snow-particle';
  const imageType = SNOW_IMAGE_TYPES[Math.floor(Math.random() * SNOW_IMAGE_TYPES.length)];
  flake.style.backgroundImage = `url('${imageType.url}')`;
  const sizeRange = opts.sizeByType[imageType.key];
  const size = sizeRange.min + Math.random() * (sizeRange.max - sizeRange.min);
  flake.style.width = size + 'px';
  flake.style.left = Math.random() * 100 + '%';
  const glow = opts.glow || '0 0 3px rgba(255, 255, 255, 0.8)';
  flake.style.filter = (opts.blur ? `blur(${opts.blur}px) ` : '') + `drop-shadow(${glow})`;
  if (opts.opacity) flake.style.opacity = opts.opacity;

  flake.style.setProperty('--base-rotate', (Math.random() * 360) + 'deg');

  const duration = opts.minDuration + Math.random() * (opts.maxDuration - opts.minDuration);
  const fallHeight = layer.clientHeight || window.innerHeight;
  const rotateDir = Math.random() < 0.5 ? 1 : -1;
  flake.style.setProperty('--mid-x', ((Math.random() * 2 - 1) * opts.sway) + 'px');
  flake.style.setProperty('--fall-mid', (fallHeight * 0.5) + 'px');
  flake.style.setProperty('--fall-end', (fallHeight + 30) + 'px');
  flake.style.setProperty('--rotate-dir', rotateDir);
  flake.style.animationDuration = duration + 's';

  layer.appendChild(flake);
  setTimeout(() => flake.remove(), duration * 1000 + 100);
}

function startSnowEffect() {
  stopSnowEffect();
  const layer = document.getElementById('snow-layer');
  if (!layer) return;
  snowIntervalBack = setInterval(() => spawnSnow(layer, {
    sizeByType: { snowflake: { min: 10, max: 16 }, snowball: { min: 5, max: 8 } },
    minDuration: 32, maxDuration: 44, sway: 20, opacity: 0.5,
    glow: '0 0 2px rgba(255, 255, 255, 0.6)'
  }), 2800);
  snowIntervalFront = setInterval(() => spawnSnow(layer, {
    sizeByType: { snowflake: { min: 16, max: 24 }, snowball: { min: 8, max: 12 } },
    minDuration: 20, maxDuration: 28, sway: 30,
    glow: '0 0 4px rgba(255, 255, 255, 0.9)'
  }), 2800);
}

function stopSnowEffect() {
  clearInterval(snowIntervalBack);
  clearInterval(snowIntervalFront);
  snowIntervalBack = null;
  snowIntervalFront = null;
  const layer = document.getElementById('snow-layer');
  if (layer) layer.innerHTML = '';
}

// 管理者モードの特別扱いを含まない、本当の解放状況。設定として保存してよいかの判定に使う
function isThemeGenuinelyUnlocked(key) {
  const theme = THEMES[key];
  if (theme.seasonal) return state.seasonalUnlocked.includes(key);
  if (!theme.unlockId) return true;
  return state.unlocked.some(u => u.id === theme.unlockId);
}

function isThemeUnlocked(key) {
  if (state.isAdmin) return true;
  return isThemeGenuinelyUnlocked(key);
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
  saveSeasonalUnlocked(list) { localStorage.setItem('meigen_seasonal_unlocked', JSON.stringify(list)); },
  // 猫の懐き度 { total, todayDate, todayCount }
  getCatAffection() { const s = localStorage.getItem('meigen_cat_affection'); return s ? JSON.parse(s) : { total: 0, todayDate: '', todayCount: 0 }; },
  saveCatAffection(a) { localStorage.setItem('meigen_cat_affection', JSON.stringify(a)); }
};

// ── アプリ状態 ────────────────────────────────────────────
let state = {
  currentTab: 'home',
  quotes: [],
  settings: {},
  currentQuote: null,
  listFilterCategories: ['historical', 'philosophy', 'business', 'sports', 'special'],
  listSearch: '',
  listSort: 'default',
  listSortDir: 'asc',
  editingId: null,
  favorites: [],
  listFavoriteOnly: false,
  listAdminStatusFilter: 'all', // 管理者モード時のみ使用：all / unlocked / locked
  unlocked: [],   // [{ id, date }, ...]
  diary: {},      // { [quoteId]: "text" }
  isAdmin: false, // セッション中のみ有効（再読み込みでリセット）
  streak: 0,
  seasonalUnlocked: [], // 解放済み季節限定テーマのキー一覧
  catAffection: { total: 0, todayDate: '', todayCount: 0 },
  // 一覧タブの小分け描画用（スクロールに応じて追加描画する）
  listRenderItems: [],
  listRenderedCount: 0
};

let audioCtx = null;
let preAdminPreviewQuote = null; // 管理者モードのプレビュー中に、本来ホームに出ていた名言を退避しておく
let preReplayQuote = null; // 一般ユーザーがReplayした際に、本来ホームに出ていた名言を退避しておく（ホームタブを離れた時点で復元）

// ホームのカード演出（著者名表示・超シークレットレアの効果音等）用の予約タイマー。
// renderHome()のたびに前回分を解除しないと、古いカード向けのタイマーが新しいカードに対して誤発火する
let pendingRevealTimers = [];
function clearPendingRevealTimers() {
  pendingRevealTimers.forEach(t => clearTimeout(t));
  pendingRevealTimers = [];
}
function scheduleRevealTimer(fn, delay) {
  const t = setTimeout(fn, delay);
  pendingRevealTimers.push(t);
  return t;
}

// ── 初期化 ────────────────────────────────────────────────
function init() {
  state.quotes    = Storage.getQuotes();
  state.settings  = Storage.getSettings();
  state.favorites = Storage.getFavorites();
  state.unlocked  = Storage.getUnlocked();
  state.diary     = Storage.getDiary();
  state.seasonalUnlocked = Storage.getSeasonalUnlocked();
  state.catAffection = Storage.getCatAffection();
  updateStreak();
  state.currentQuote = getDailyQuote();
  checkSeasonalThemeUnlocks();

  // 管理者モードで一時的にロック中のテーマを選んだまま保存されてしまった場合に備え、
  // 起動時は必ず本来の解放状況で検証し、未解放なら初期テーマに戻す
  if (!isThemeGenuinelyUnlocked(state.settings.theme)) {
    state.settings.theme = 'default';
    Storage.saveSettings(state.settings);
  }

  applyTheme(state.settings.theme);
  renderHome();
  renderList();
  renderSettings();
  bindEvents();
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

const STREAK_MILESTONE_TIER = { 3: 'r', 7: 'sr', 10: 'ur' };

function renderStreakIndicator() {
  const el = document.getElementById('streak-indicator');
  if (!el) return;
  if (state.streak <= 0) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = 'block';

  const pos = getCyclePosition(state.streak);
  const claimedToday = isBonusDay() && !!getTodaysBonusRecord();
  const fillPct = ((pos - 1) / (BONUS_CYCLE - 1)) * 100;

  const dots = [];
  for (let day = 1; day <= BONUS_CYCLE; day++) {
    if (day === pos) continue;
    const tier = STREAK_MILESTONE_TIER[day];
    const leftPct = ((day - 1) / (BONUS_CYCLE - 1)) * 100;
    let cls = 'streak-dot' + (tier ? ` tier-${tier}` : '');
    if (day < pos || (day === pos && claimedToday)) cls += ' done';
    dots.push(`<span class="${cls}" style="left:${leftPct}%"></span>`);
  }

  el.innerHTML = `
    <div class="streak-top">
      <span class="streak-badge">LOGIN BONUS</span>
      <div class="streak-day">
        <span class="cur">${pos}</span><span class="slash">/</span><span class="total">${BONUS_CYCLE}</span><span class="unit">日目</span>
      </div>
    </div>
    <div class="streak-line-wrap">
      <div class="streak-line">
        <div class="streak-line-fill" style="width:${fillPct}%"></div>
        ${dots.join('')}
        <div class="streak-current" style="left:${fillPct}%"></div>
      </div>
    </div>
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
    const isClaimable = isCurrent && !!info && !claimedToday;
    let cls = 'login-day-cell' + (info ? ` milestone ${info.cls}` : '');
    if (day < pos || (isCurrent && (!info || claimedToday))) cls += ' done';
    else if (isCurrent) cls += ' current';
    if (isClaimable) cls += ' claimable';
    cells.push(`
      <div class="${cls}"${isClaimable ? ' id="login-day-claim-cell"' : ''}>
        <span class="login-day-num">${day}</span>
        <span class="login-day-reward">${info ? info.reward : ''}</span>
      </div>
    `);
  }

  document.getElementById('login-modal-rows').innerHTML = `
    <div class="login-day-grid">${cells.join('')}</div>
  `;

  const claimCell = document.getElementById('login-day-claim-cell');
  if (claimCell) {
    claimCell.addEventListener('click', () => {
      performBonusClaim();
      closeLoginModal();
    });
  }

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

// ログインボーナスの受け取り処理（Home画面のバナー・ログインモーダル内タップ、共通で呼び出す）
function performBonusClaim() {
  const bonusQuotes = claimBonusQuote();
  const bonusQuote = bonusQuotes[bonusQuotes.length - 1]; // 2枚引けた場合は、最後に引いた方＝最新の1枚を表示する
  // 本物の新しい解放なので、Preview/Replay用に退避していた「戻し先」は古い情報になる。破棄する
  preAdminPreviewQuote = null;
  preReplayQuote = null;
  state.currentQuote = bonusQuote;
  renderHome();
  renderList();
  if (bonusQuotes.length > 1) {
    showToast(`条件のレア度を集め尽くしていたため、代わりに${bonusQuotes.length}枚解放しました`);
  }
  if (bonusQuote.rarity === 'mythic') {
    scheduleRevealTimer(() => {
      playMythicSound();
      const quoteCard = document.getElementById('quote-card');
      if (quoteCard) spawnMythicBurst(quoteCard, bonusQuote.themeColors);
    }, typewriterDuration(bonusQuote.text) + 2100); // レア度演出（+2秒後）が反映された後に鳴らす
  }
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
  document.getElementById('bonus-claim-btn').addEventListener('click', performBonusClaim);
}

// ── ホームタブ描画 ────────────────────────────────────────
function renderHome() {
  clearPendingRevealTimers(); // 前回のカード向けに予約されていた演出タイマーを解除してから作り直す
  const q = state.currentQuote;
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日（${['日','月','火','水','木','金','土'][today.getDay()]}）`;

  document.getElementById('home-date').textContent = dateStr;
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
  // レア度演出・著者名・詳細ボタンは、本文のタイプ演出が終わってから遅れて見せる（ネタバレ防止）ため、
  // ここでは付与せず、revealCardDetails()で後から反映する
  document.getElementById('home-quote-area').innerHTML = `
    <span class="home-today-badge">今日の名言</span>
    <div class="quote-card${characterBgClass(q)}" id="quote-card">
      <span id="quote-rank-ring"></span>
      <button class="card-fav-btn${isFav ? ' active' : ''}" id="card-fav-btn">${isFav ? '★' : '☆'}</button>
      <div class="quote-text" id="quote-text"></div>
      <div class="quote-author-row quote-reveal" id="quote-author-reveal">
        <span class="quote-author-name">${escapeHtml(q.author)}</span>
      </div>
      <div class="quote-meta-row" id="quote-meta-row">
        <button class="card-detail-btn quote-reveal" id="card-detail-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><circle cx="12" cy="8.25" r="0.75" fill="currentColor" stroke="none"/></svg>
          名言の詳細
          <svg class="btn-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
        </button>
        ${cLabel ? `<span class="category-badge quote-reveal" id="quote-category-badge">${cLabel}</span>` : ''}
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
    scheduleCardDetailsReveal(q);
  }
}

// 本文のタイプ演出が終わってから、著者名（＋レア度演出）→ カテゴリバッジ → 詳細ボタンの順に段階的に見せる
function scheduleCardDetailsReveal(q) {
  const base = typewriterDuration(q.text);
  scheduleRevealTimer(() => revealCardAuthor(q), base + 2000);
  scheduleRevealTimer(() => revealCardBadge(), base + 3000);
  scheduleRevealTimer(() => revealCardDetailButton(), base + 5000);
}

function revealCardAuthor(q) {
  const card = document.getElementById('quote-card');
  if (!card) return; // タブ切り替え等で既に描画し直されている場合は何もしない
  const rank = RANK_META[q.rarity];
  if (rank) card.classList.add(rank.class);
  if (q.rarity === 'mythic') {
    const c = (q.themeColors && q.themeColors.length) ? q.themeColors : MYTHIC_DEFAULT_COLORS;
    card.style.setProperty('--mc1', c[0]);
    card.style.setProperty('--mc2', c[1]);
    card.style.setProperty('--mc3', c[2] || c[0]);
    if (q.characterImage) {
      card.style.backgroundImage = `linear-gradient(180deg, rgba(10,6,20,0.35) 0%, rgba(10,6,20,0.65) 55%, rgba(10,6,20,0.92) 100%), url('${q.characterImage}')`;
    }
  }
  const ringEl = document.getElementById('quote-rank-ring');
  if (ringEl) ringEl.outerHTML = rankRingHtml(q.rarity) || '<span id="quote-rank-ring"></span>';
  const authorEl = document.getElementById('quote-author-reveal');
  if (authorEl) authorEl.classList.add('show');
}

function revealCardBadge() {
  const badgeEl = document.getElementById('quote-category-badge');
  if (badgeEl) badgeEl.classList.add('show');
}

function revealCardDetailButton() {
  const btnEl = document.getElementById('card-detail-btn');
  if (btnEl) btnEl.classList.add('show');
}

// ── 一覧タブ描画 ──────────────────────────────────────────
const RENDER_BATCH_SIZE = 20;
const LOCKED_CARD_HTML = '<div class="quote-list-item locked"><div class="locked-content"><svg class="lock-svg"><use href="#icon-lock"></use></svg></div></div>';

function quoteListItemHtml(q, isLocked) {
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
        <span class="quote-list-author">${escapeHtml(q.author)}${isLocked ? ' <span class="locked-tag">未開放</span>' : ''}</span>
        ${cLabel ? `<span class="category-badge">${cLabel}</span>` : ''}
      </div>
      ${hasDiary ? '<div class="diary-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> コメントあり</div>' : ''}
    </div>
  `;
}

// 一覧・管理タブ共通：描画済みの続きから次の1バッチだけを追記する
function appendRenderBatch(items, renderedCount, containerId, htmlFn) {
  const container = document.getElementById(containerId);
  const end = Math.min(renderedCount + RENDER_BATCH_SIZE, items.length);
  let html = '';
  for (let i = renderedCount; i < end; i++) {
    html += htmlFn(items[i]);
  }
  container.insertAdjacentHTML('beforeend', html);
  return end;
}

function renderList() {
  document.querySelector('main').scrollTop = 0; // 並び替え・絞り込み直後に古いスクロール位置が残らないようにする
  const unlockedIds = state.unlocked.map(u => u.id);
  const search = state.listSearch.trim().toLowerCase();

  const categoryFilterTotal = document.querySelectorAll('.category-filter-checkbox').length;
  const allCategoriesSelected = state.listFilterCategories.length === categoryFilterTotal;

  // 管理者モード中は未解放の名言も本文込みで表示し、編集・削除の対象にできるようにする
  const baseQuotes = state.isAdmin ? state.quotes : state.quotes.filter(q => unlockedIds.includes(q.id));
  let quotes = baseQuotes.filter(q => {
    if (state.listFavoriteOnly && !state.favorites.includes(q.id)) return false;
    if (!state.listFilterCategories.includes(q.category)) return false;
    if (state.isAdmin) {
      const isUnlocked = unlockedIds.includes(q.id);
      if (state.listAdminStatusFilter === 'unlocked' && !isUnlocked) return false;
      if (state.listAdminStatusFilter === 'locked' && isUnlocked) return false;
    }
    if (search) return q.text.toLowerCase().includes(search) || q.author.toLowerCase().includes(search);
    return true;
  });
  quotes = sortQuotes(quotes, state.listSort, state.listSortDir);

  const totalLocked = state.quotes.length - unlockedIds.length;
  document.getElementById('progress-count').textContent = `${unlockedIds.length} / ${state.quotes.length}`;
  renderProgressTrack();

  const adminStatusFiltered = state.isAdmin && state.listAdminStatusFilter !== 'all';
  if (quotes.length === 0 && (state.listFavoriteOnly || search || !allCategoriesSelected || adminStatusFiltered)) {
    document.getElementById('quote-list').innerHTML = state.listFavoriteOnly
      ? '<div class="empty-state"><div class="empty-icon">☆</div><p>お気に入りがまだありません。<br>ホームの星マークで追加してください。</p></div>'
      : '<div class="empty-state"><div class="empty-icon">🔍</div><p>該当する名言が見つかりませんでした。</p></div>';
    state.listRenderItems = [];
    state.listRenderedCount = 0;
    return;
  }

  // 実際のカードと未解放プレースホルダーを1本の配列にまとめ、まとめて少しずつ描画する
  // アイコンはindex.html側で1つだけ定義したSVGシンボルをuseで参照し、生成コストを抑える
  const items = quotes.map(q => ({ locked: false, quote: q, isLocked: state.isAdmin && !unlockedIds.includes(q.id) }));
  if (!state.isAdmin && !state.listFavoriteOnly && !search && allCategoriesSelected) {
    for (let i = 0; i < totalLocked; i++) items.push({ locked: true });
  }

  state.listRenderItems = items;
  document.getElementById('quote-list').innerHTML = '';
  state.listRenderedCount = appendRenderBatch(items, 0, 'quote-list', item => item.locked ? LOCKED_CARD_HTML : quoteListItemHtml(item.quote, item.isLocked));
}

// スクロールが下に近づいたら、一覧タブの続きを1バッチ追加描画する
function loadMoreListItems() {
  if (state.listRenderedCount >= state.listRenderItems.length) return;
  state.listRenderedCount = appendRenderBatch(state.listRenderItems, state.listRenderedCount, 'quote-list', item => item.locked ? LOCKED_CARD_HTML : quoteListItemHtml(item.quote, item.isLocked));
}

// ── 管理者モード ロック/解除ボタン（設定タブ） ──
const ADMIN_LOCK_OPEN_PATH = 'M8 11V7a4 4 0 018 0v4';
const ADMIN_LOCK_CLOSED_PATH = 'M8 11V7a4 4 0 017.75-1.5';

function updateAdminLockUI() {
  const label = state.isAdmin ? 'ロックする' : '管理者モードにする';
  const path = state.isAdmin ? ADMIN_LOCK_CLOSED_PATH : ADMIN_LOCK_OPEN_PATH;

  document.getElementById('admin-lock-path-settings').setAttribute('d', path);
  document.getElementById('admin-lock-btn-settings').setAttribute('aria-label', label);
  document.getElementById('admin-lock-btn-settings').classList.toggle('unlocked', state.isAdmin);
  document.getElementById('admin-settings-sublabel').textContent = state.isAdmin
    ? '管理者モード中です'
    : 'PINコードを入力して管理者モードにします';
  document.getElementById('admin-settings-sublabel').classList.toggle('is-active', state.isAdmin);

  document.getElementById('add-quote-btn').style.display = state.isAdmin ? 'flex' : 'none';
  document.getElementById('admin-next-quote-btn').style.display = state.isAdmin ? 'block' : 'none';
  document.getElementById('admin-filter-row').style.display = state.isAdmin ? 'flex' : 'none';

  renderCompanionTestRow();
  renderThemeSwatches();
}

function toggleAdminLock() {
  if (state.isAdmin) {
    state.isAdmin = false;
    // 管理者モード中に本来未解放のテーマを選んでいた場合は、解除と同時に元に戻す
    let message = '管理者モードを終了しました';
    if (!isThemeGenuinelyUnlocked(state.settings.theme)) {
      state.settings.theme = 'default';
      Storage.saveSettings(state.settings);
      applyTheme(state.settings.theme);
      renderThemeSwatches();
      message = '管理者モードを終了しました（未解放のテーマだったため表示を元に戻しました）';
    }
    // 管理者モード中にホームでプレビュー表示していた場合は、本来の表示に戻す
    if (preAdminPreviewQuote !== null) {
      state.currentQuote = preAdminPreviewQuote;
      preAdminPreviewQuote = null;
      renderHome();
    }
    updateAdminLockUI();
    renderList();
    showToast(message);
  } else {
    openAdminPinModal();
  }
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
    updateAdminLockUI();
    renderList();
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
  updateAdminLockUI();
  renderCatAffectionUI();
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

  // 管理者モード ロック/解除ボタン（設定タブ）
  document.getElementById('admin-lock-btn-settings').addEventListener('click', toggleAdminLock);

  // 一覧：並び替え（自作ドロップダウン）
  initSortDropdown('list-sort-dropdown', value => {
    state.listSort = value;
    renderList();
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

  // 画面回転・リサイズ時に固定バーの高さが変わる場合があるので、本文側の余白を再計算する
  window.addEventListener('resize', () => {
    if (state.currentTab === 'list') {
      const toolbar = document.getElementById('list-toolbar');
      const section = document.getElementById('tab-list');
      pinStickyToolbarSpacing(toolbar, section);
    }
  });

  // ページトップへ戻るボタン／一覧タブの追加読み込み
  const scrollTopBtn = document.getElementById('scroll-top-btn');
  const mainEl = document.querySelector('main');
  mainEl.addEventListener('scroll', () => {
    scrollTopBtn.classList.toggle('show', mainEl.scrollTop > 300);

    const nearBottom = mainEl.scrollTop + mainEl.clientHeight > mainEl.scrollHeight - 400;
    if (!nearBottom) return;
    if (state.currentTab === 'list') loadMoreListItems();
  });
  scrollTopBtn.addEventListener('click', () => {
    mainEl.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // 一覧：カテゴリフィルター（複数選択ドロップダウン）
  initCategoryFilterDropdown('category-filter-dropdown', 'category-filter-label', 'category-filter-checkbox', 'listFilterCategories', renderList);

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

  // 一覧：管理者専用の開放状況フィルター（すべて／開放済／未開放）
  document.getElementById('admin-status-filter').addEventListener('click', e => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    state.listAdminStatusFilter = btn.dataset.value;
    document.querySelectorAll('#admin-status-filter .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
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

  // 一覧：追加ボタン（管理者モード時のみ表示）
  document.getElementById('add-quote-btn').addEventListener('click', openAddModal);

  // 名言の詳細モーダル：管理者用（プレビュー・編集・削除）
  document.getElementById('detail-preview-btn').addEventListener('click', () => {
    const id = parseInt(document.getElementById('detail-modal-overlay').dataset.quoteId);
    const quote = state.quotes.find(q => q.id === id);
    if (!quote) return;
    const isAdminPreview = state.isAdmin;
    closeDetailModal();
    if (isAdminPreview) {
      // 管理者モード終了時に本来の表示へ戻せるよう、プレビュー前の状態を退避しておく
      if (preAdminPreviewQuote === null) preAdminPreviewQuote = state.currentQuote;
    } else {
      // ホームタブを離れた時点で本来の表示へ戻せるよう、Replay前の状態を退避しておく
      if (preReplayQuote === null) preReplayQuote = state.currentQuote;
    }
    state.currentQuote = quote;
    renderHome();
    switchTab('home');
    showToast(isAdminPreview ? 'ホームにテスト表示しました' : 'ホームで演出を再生します');
    if (quote.rarity === 'mythic') {
      scheduleRevealTimer(() => {
        playMythicSound();
        const quoteCard = document.getElementById('quote-card');
        if (quoteCard) spawnMythicBurst(quoteCard, quote.themeColors);
      }, typewriterDuration(quote.text) + 2100); // レア度演出（+2秒後）が反映された後に鳴らす
    }
  });
  document.getElementById('detail-edit-btn').addEventListener('click', () => {
    const id = parseInt(document.getElementById('detail-modal-overlay').dataset.quoteId);
    closeDetailModal();
    openEditModal(id);
  });
  document.getElementById('detail-delete-btn').addEventListener('click', () => {
    const id = parseInt(document.getElementById('detail-modal-overlay').dataset.quoteId);
    closeDetailModal();
    deleteQuote(id);
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
      scheduleRevealTimer(() => {
        playMythicSound();
        const quoteCard = document.getElementById('quote-card');
        if (quoteCard) spawnMythicBurst(quoteCard, quote.themeColors);
      }, typewriterDuration(quote.text) + 2100); // レア度演出（+2秒後）が反映された後に鳴らす
    }
  });
}

// ── タブ切り替え ──────────────────────────────────────────
const TAB_LABELS = { home: 'ホーム', list: '一覧', companion: '相棒', settings: '設定' };

function switchTab(tab) {
  // 既に表示中のタブへの切り替えは何もしない。
  // ここで何もせず素通りしないと、表示中のタブの display を一瞬 none→block と
  // 再トグルしてしまい、直前にrenderHome()等で始まったCSSアニメーションがリセットされてズレる
  if (state.currentTab === tab) return;

  // Replayで一時的にホームへ表示していた名言は、ホームタブを離れた時点で本来の表示に戻す
  if (state.currentTab === 'home' && tab !== 'home' && preReplayQuote !== null) {
    state.currentQuote = preReplayQuote;
    preReplayQuote = null;
    renderHome();
  }

  state.currentTab = tab;
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  // 検索・並び替えバーはposition:fixedでtab-sectionの外にあるため、別途表示を切り替える
  document.querySelectorAll('.sticky-toolbar').forEach(t => t.classList.remove('active'));
  const newSection = document.getElementById(`tab-${tab}`);
  newSection.classList.add('active');
  const newBtn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
  newBtn.classList.add('active');
  document.getElementById('header-title-text').textContent = TAB_LABELS[tab] || TAB_LABELS.home;
  if (tab === 'list') {
    const toolbar = document.getElementById('list-toolbar');
    toolbar.classList.add('active');
    // position:fixedにした検索・並び替えバーは通常のレイアウトの流れから外れるため、
    // 隠れてしまわないよう本文側に固定バーの高さぶんの余白を確保する
    pinStickyToolbarSpacing(toolbar, newSection);
    // 一覧タブはカード枚数が多く描画量が多いため、
    // スライドアニメーションが再生を始めてから重い再描画を行うよう1フレーム遅らせる
    requestAnimationFrame(renderList);
  }
  if (tab === 'settings') renderSettings();
}

function pinStickyToolbarSpacing(toolbar, section) {
  const body = section.querySelector('.tab-body-pad');
  if (!toolbar || !body) return;
  body.style.paddingTop = (toolbar.offsetHeight + 20) + 'px';
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
  renderList();
}

function deleteQuote(id) {
  const q = state.quotes.find(q => q.id === id);
  if (!q) return;
  if (!confirm(`「${q.text.substring(0, 20)}…」を削除しますか？`)) return;
  state.quotes = state.quotes.filter(q => q.id !== id);
  Storage.saveQuotes(state.quotes);
  renderList();
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

  const adminStatus = document.getElementById('detail-admin-status');
  const editBtn = document.getElementById('detail-edit-btn');
  const deleteBtn = document.getElementById('detail-delete-btn');
  const isUnlocked = !!unlockInfo;

  // Preview/Replayボタンは常設。開放済みなら演出の再生、未開放（管理者のみ到達）なら試し見せ、と呼び方を変える
  document.getElementById('detail-preview-label').textContent = isUnlocked ? 'Replay' : 'Preview';

  if (state.isAdmin) {
    adminStatus.textContent = isUnlocked ? '開放済' : '未開放';
    adminStatus.className = 'detail-admin-status ' + (isUnlocked ? 'unlocked' : 'locked');
    adminStatus.style.display = 'flex';
    editBtn.style.display = 'flex';
    deleteBtn.style.display = 'flex';
  } else {
    adminStatus.style.display = 'none';
    editBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
  }

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
      if (el && state.currentQuote) {
        typewriter(el, state.currentQuote.text);
        scheduleCardDetailsReveal(state.currentQuote);
      }
      revealMythicIfNeeded();
    }
  });
}

// ── 超シークレットレア初解放時の演出 ──────────────────────
const TYPEWRITER_SPEED = 85; // 1文字あたりのミリ秒。読み終わる前に著者名等でネタバレしないよう調整

function typewriterDuration(text, speed = TYPEWRITER_SPEED) {
  return (text ? text.length : 0) * speed;
}

function revealMythicIfNeeded() {
  if (!dailyQuoteJustRevealed || !state.currentQuote || state.currentQuote.rarity !== 'mythic') return;
  scheduleRevealTimer(() => {
    playMythicSound();
    const card = document.getElementById('quote-card');
    if (card) spawnMythicBurst(card, state.currentQuote.themeColors);
  }, typewriterDuration(state.currentQuote.text) + 2100); // レア度演出（+2秒後）が反映された後に鳴らす
}

// ── 猫ウィジェット ────────────────────────────────────────
const CAT_IMG = {
  sleeping:   'images/animals/cat_sleeping_dot_transparent.png',
  awake:      'images/animals/cat_awake_dot_transparent.png',
  yawn:       'images/animals/cat_yawn_dot_transparent.png',
  grooming:   'images/animals/cat_grooming_dot_transparent.png',
  stretching: 'images/animals/cat_stretching_dot_transparent.png'
};
const CAT_NON_SLEEP_STATES = ['cat-awake', 'cat-yawn', 'cat-grooming', 'cat-stretching'];
let catIdleTimer = null;
let catActionTimer = null;
let catState = 'sleeping';
let catInputLockedUntil = 0; // 見た目は変わらない「無視」反応後も、一定時間タップを受け付けないようにするためのタイムスタンプ

function setCatState(nextState) {
  const el = document.getElementById('cat-widget');
  if (!el) return;
  catState = nextState;
  el.src = CAT_IMG[nextState];
  el.classList.remove(...CAT_NON_SLEEP_STATES);
  if (nextState !== 'sleeping') {
    void el.offsetWidth; // アニメーションを再生させるための強制リフロー
    el.classList.add('cat-' + nextState);
  }
}

// 気まぐれな寝姿バリエーション（あくび・毛づくろい・伸び）。管理者テスト表示からも呼び出せるよう共通化
const CAT_IDLE_ACTIONS = {
  yawn:       { minDuration: 1200, maxDuration: 2000 },
  grooming:   { minDuration: 2000, maxDuration: 3000 },
  stretching: { minDuration: 2000, maxDuration: 3000 }
};

function triggerCatIdleAction(key) {
  const { minDuration, maxDuration } = CAT_IDLE_ACTIONS[key];
  setCatState(key);
  const actionTime = minDuration + Math.random() * (maxDuration - minDuration);
  catActionTimer = setTimeout(scheduleCatIdle, actionTime);
}

// 気まぐれに眠り続け、稀にあくび・毛づくろい・伸びをする（「起きる」は自動では発生させない）
function scheduleCatIdle() {
  if (!state.settings.catEnabled) return;
  clearTimeout(catIdleTimer);
  clearTimeout(catActionTimer);
  setCatState('sleeping');
  const sleepTime = 8000 + Math.random() * 8000;
  catIdleTimer = setTimeout(() => {
    const roll = Math.random();
    if (roll < 0.1) triggerCatIdleAction('yawn');
    else if (roll < 0.15) triggerCatIdleAction('grooming');
    else if (roll < 0.2) triggerCatIdleAction('stretching');
    else scheduleCatIdle();
  }, sleepTime);
}

// タップへの反応。管理者テスト表示からも呼び出せるよう共通化
const CAT_TAP_REACTIONS = {
  ignore(el) {
    // 無視：本当に何も反応しない（見た目は一切変えないが、連打で無限に消費できないよう一定時間タップを受け付けない）
    catInputLockedUntil = Date.now() + 1000;
    scheduleCatIdle();
  },
  away(el) {
    // どこかへ行ってしまう
    setCatState('awake');
    catActionTimer = setTimeout(() => {
      el.classList.add('away');
      catActionTimer = setTimeout(() => {
        el.classList.remove('away');
        scheduleCatIdle();
      }, 2500 + Math.random() * 1500);
    }, 300);
  },
  blink(el) {
    // スローまばたき（レア）：猫の愛情表現とされる仕草
    setCatState('awake');
    el.classList.add('cat-slow-blink');
    catActionTimer = setTimeout(() => {
      el.classList.remove('cat-slow-blink');
      scheduleCatIdle();
    }, 10000);
  },
  heart(el) {
    // ハート（レア）：懐いている合図
    setCatState('awake');
    spawnCatHeart(el);
    catActionTimer = setTimeout(scheduleCatIdle, 1800);
  }
};

// タップ（3回に1回）への反応：無視55% / どこかへ行く30% / スローまばたき10% / ハート5%
function reactToTap() {
  const el = document.getElementById('cat-widget');
  if (!state.settings.catEnabled || !el) return;
  clearTimeout(catIdleTimer);
  clearTimeout(catActionTimer);
  gainCatAffection(1);

  const roll = Math.random();
  const key = roll < 0.55 ? 'ignore' : roll < 0.85 ? 'away' : roll < 0.95 ? 'blink' : 'heart';
  CAT_TAP_REACTIONS[key](el);
}

// ── 猫の懐き度 ────────────────────────────────────────────
const CAT_AFFECTION_DAILY_CAP = 10;
const CAT_AFFECTION_PER_LEVEL = 20;

function gainCatAffection(amount) {
  const today = new Date().toDateString();
  if (state.catAffection.todayDate !== today) {
    state.catAffection.todayDate = today;
    state.catAffection.todayCount = 0;
  }
  const grant = Math.min(amount, CAT_AFFECTION_DAILY_CAP - state.catAffection.todayCount);
  if (grant <= 0) return;
  state.catAffection.total += grant;
  state.catAffection.todayCount += grant;
  Storage.saveCatAffection(state.catAffection);
  renderCatAffectionUI();
}

function renderCatAffectionUI() {
  const levelEl = document.getElementById('cat-affection-level');
  if (!levelEl) return;
  const level = Math.floor(state.catAffection.total / CAT_AFFECTION_PER_LEVEL) + 1;
  const intoLevel = state.catAffection.total % CAT_AFFECTION_PER_LEVEL;
  levelEl.textContent = `Lv.${level}`;
  document.getElementById('cat-affection-fill').style.width = (intoLevel / CAT_AFFECTION_PER_LEVEL * 100) + '%';
  document.getElementById('cat-affection-count').textContent = `${intoLevel} / ${CAT_AFFECTION_PER_LEVEL}pt`;
}

// ハートが猫の上にふわっと浮かんで消える演出（ヘッダーのoverflow:hiddenで見切れないよう画面基準の固定配置にする）
function spawnCatHeart(catEl) {
  const rect = catEl.getBoundingClientRect();
  const heart = document.createElement('div');
  heart.className = 'cat-heart-pop';
  heart.style.left = (rect.left + rect.width / 2 - 10) + 'px';
  heart.style.top = (rect.top - 6) + 'px';
  heart.innerHTML = '<svg viewBox="0 0 24 24" fill="#ff5c8a"><path d="M12 21s-6.7-4.3-9.5-8.4C.7 9.4 1.7 5.7 5 4.4c2-.8 4.2-.1 5.5 1.6C11.8 4.3 14 3.6 16 4.4c3.3 1.3 4.3 5 2.5 8.2C18.7 16.7 12 21 12 21z"/></svg>';
  document.body.appendChild(heart);
  setTimeout(() => heart.remove(), 1500);
}

// タップした瞬間に毎回出す波紋（猫が反応するかどうかに関係なく、タップが効いたことを伝える）
function spawnCatTapRipple(catEl) {
  const rect = catEl.getBoundingClientRect();
  const ripple = document.createElement('div');
  ripple.className = 'cat-tap-ripple';
  ripple.style.left = (rect.left + rect.width / 2) + 'px';
  ripple.style.top = (rect.top + rect.height / 2) + 'px';
  document.body.appendChild(ripple);
  setTimeout(() => ripple.remove(), 500);
}

// ── 管理者モード：相棒の反応テスト表示（懐き度には影響させない） ──
// key は CAT_TAP_REACTIONS または CAT_IDLE_ACTIONS のいずれかに対応させる
const COMPANION_TEST_ACTIONS = [
  { key: 'ignore',     label: '無視' },
  { key: 'away',       label: 'どこかへ行く' },
  { key: 'blink',      label: 'スローまばたき' },
  { key: 'heart',      label: 'ハート' },
  { key: 'yawn',       label: 'あくび' },
  { key: 'grooming',   label: '毛づくろい' },
  { key: 'stretching', label: '伸び' }
];

function renderCompanionTestRow() {
  const row = document.getElementById('companion-test-row');
  if (!row) return;
  row.style.display = state.isAdmin ? 'block' : 'none';
  if (!state.isAdmin || row.dataset.rendered) return;

  const container = document.getElementById('companion-test-buttons');
  container.innerHTML = COMPANION_TEST_ACTIONS.map(a =>
    `<button class="companion-test-btn" data-test-key="${a.key}">${a.label}</button>`
  ).join('');
  container.querySelectorAll('.companion-test-btn').forEach(btn => {
    btn.addEventListener('click', () => testCompanionAction(btn.dataset.testKey));
  });
  row.dataset.rendered = '1';
}

function testCompanionAction(key) {
  const el = document.getElementById('cat-widget');
  if (!state.isAdmin || !state.settings.catEnabled || !el) return;
  clearTimeout(catIdleTimer);
  clearTimeout(catActionTimer);
  if (CAT_TAP_REACTIONS[key]) CAT_TAP_REACTIONS[key](el);
  else if (CAT_IDLE_ACTIONS[key]) triggerCatIdleAction(key);
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
    if (catState !== 'sleeping' || Date.now() < catInputLockedUntil) return; // 反応中・クールダウン中のタップは受け付けないため、波紋も出さない
    spawnCatTapRipple(el); // タップが受け付けられたことが毎回わかるよう波紋を出す
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
// 文字を後から追加するのではなく、完成形の文章を最初からDOMに置いた上で
// 1文字ずつ透明度を上げて見せる（カードの高さが最初から確定し、演出中にレイアウトが動かない）
function typewriter(el, text, speed = TYPEWRITER_SPEED) {
  const chars = Array.from(text);
  el.innerHTML = chars.map((ch, i) => `<span style="animation-delay:${i * speed}ms">${escapeHtml(ch)}</span>`).join('');
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
