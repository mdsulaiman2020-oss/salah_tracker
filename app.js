/**
 * ILMUL JANNAH — SALAH TRACKER
 * app.js — Interactive logic, localStorage persistence, animations
 *
 * Security notes:
 *  - All user inputs are sanitised before storage (textContent only, no innerHTML from user data)
 *  - localStorage keys are namespaced to avoid collisions
 *  - No external data is fetched; app is fully offline-capable
 */

'use strict';

/* ══════════════════════════════════════ CONSTANTS ══════════ */
const STORAGE_KEY   = 'ilmulJannah_salahTracker_v1';
const PRAYERS       = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'sunnah', 'quran', 'alhamd'];
const PRAYER_LABELS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Sunnah/Extra', "Reading Qur'an", 'Alhamdulillah'];
const DAYS_IN_MONTH = 31;
const CONFETTI_COLORS = ['#C9912A','#2E7D4F','#1A2F7A','#B02020','#6A2D9F','#1A7A6A','#A01A6A','#F0C96C'];

/* ══════════════════════════════════════ STATE ══════════════ */
let state = {
  name:       '',
  month:      'May',
  classGroup: '',
  prayers:    {}, // { "day-prayer": true/false }
  goals:      { goal1: false, goal2: false, goal3: false, goal4: false },
  reflections:{ ref1: '', ref2: '', ref3: '', ref4: '' }
};

/* ══════════════════════════════════════ UTILS ══════════════ */

/**
 * Safely sanitise a string for text display (no HTML injection risk).
 * @param {string} val
 * @returns {string}
 */
function sanitiseText(val) {
  return String(val ?? '').slice(0, 200);
}

/**
 * Get the current day of month (1-indexed) for the current real date.
 * @returns {number}
 */
function getTodayDay() {
  return new Date().getDate();
}

/**
 * Get days in a given month name for current year.
 * Returns 31 for months with 31 days, 30 for others, 28/29 for Feb.
 * @param {string} monthName
 * @returns {number}
 */
function getDaysInMonth(monthName) {
  const year = new Date().getFullYear();
  const monthIndex = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ].indexOf(monthName);
  if (monthIndex === -1) return 31;
  return new Date(year, monthIndex + 1, 0).getDate();
}

/* ══════════════════════════════════════ PERSISTENCE ════════ */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    // Merge safely — only pick known keys to avoid prototype pollution
    if (typeof parsed.name  === 'string') state.name  = sanitiseText(parsed.name);
    if (typeof parsed.month === 'string') state.month = sanitiseText(parsed.month);
    if (typeof parsed.classGroup === 'string') state.classGroup = sanitiseText(parsed.classGroup);
    if (parsed.prayers && typeof parsed.prayers === 'object' && !Array.isArray(parsed.prayers)) {
      for (const [k, v] of Object.entries(parsed.prayers)) {
        if (/^\d{1,2}-[a-z]+$/.test(k) && typeof v === 'boolean') {
          state.prayers[k] = v;
        }
      }
    }
    if (parsed.goals && typeof parsed.goals === 'object') {
      ['goal1','goal2','goal3','goal4'].forEach(g => {
        if (typeof parsed.goals[g] === 'boolean') state.goals[g] = parsed.goals[g];
      });
    }
    if (parsed.reflections && typeof parsed.reflections === 'object') {
      ['ref1','ref2','ref3','ref4'].forEach(r => {
        if (typeof parsed.reflections[r] === 'string') {
          state.reflections[r] = sanitiseText(parsed.reflections[r]);
        }
      });
    }
  } catch (err) {
    console.warn('[SalahTracker] Could not load state from localStorage:', err.message);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[SalahTracker] Could not save state to localStorage:', err.message);
  }
}

/* ══════════════════════════════════════ BUILD TABLE ════════ */

function buildTable() {
  const tbody   = document.getElementById('trackerBody');
  const month   = document.getElementById('monthSelect')?.value ?? 'May';
  const days    = getDaysInMonth(month);
  const today   = getTodayDay();
  const todayMonth = new Date().toLocaleString('default', { month: 'long' });
  const isCurrentMonth = (month === todayMonth);

  tbody.innerHTML = '';

  for (let day = 1; day <= days; day++) {
    const tr = document.createElement('tr');
    tr.className = 'tracker-row';
    tr.id = `row-${day}`;

    // Day cell
    const tdDay = document.createElement('td');
    tdDay.className = 'day-cell';
    if (isCurrentMonth && day === today) {
      tdDay.classList.add('today');
      tdDay.innerHTML = `${day}<span class="today-badge">Today</span>`;
    } else {
      tdDay.textContent = day;
    }
    tr.appendChild(tdDay);

    // Prayer cells
    PRAYERS.forEach((prayer, idx) => {
      const td  = document.createElement('td');
      td.className = 'prayer-cell';

      const key = `${day}-${prayer}`;
      const isChecked = state.prayers[key] === true;

      const btn = document.createElement('button');
      btn.type  = 'button';
      btn.id    = `btn-${key}`;
      btn.setAttribute('aria-label', `${PRAYER_LABELS[idx]} on day ${day}`);
      btn.setAttribute('aria-pressed', isChecked ? 'true' : 'false');
      btn.setAttribute('role', 'checkbox');
      btn.className = `prayer-btn ${prayer}-btn ${isChecked ? 'checked' : ''}`;
      btn.dataset.day    = day;
      btn.dataset.prayer = prayer;

      // Inner elements
      const ringIcon  = document.createElement('span');
      ringIcon.className = 'ring-icon';
      ringIcon.setAttribute('aria-hidden', 'true');

      const checkIcon = document.createElement('span');
      checkIcon.className = 'check-icon';
      checkIcon.textContent = '✓';
      checkIcon.setAttribute('aria-hidden', 'true');

      btn.appendChild(ringIcon);
      btn.appendChild(checkIcon);
      btn.addEventListener('click', onPrayerClick);
      td.appendChild(btn);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
    updateRowCompletion(day);
  }
}

/* ══════════════════════════════════════ INTERACTIONS ═══════ */

function onPrayerClick(e) {
  const btn   = e.currentTarget;
  const day   = parseInt(btn.dataset.day, 10);
  const prayer = btn.dataset.prayer;
  const key   = `${day}-${prayer}`;

  // Toggle
  const wasChecked = state.prayers[key] === true;
  state.prayers[key] = !wasChecked;
  saveState();

  // Update UI
  btn.classList.toggle('checked', !wasChecked);
  btn.setAttribute('aria-pressed', !wasChecked ? 'true' : 'false');

  // Pop animation
  btn.classList.remove('pop');
  void btn.offsetWidth; // reflow
  btn.classList.add('pop');
  btn.addEventListener('animationend', () => btn.classList.remove('pop'), { once: true });

  // Sparkle burst on check
  if (!wasChecked) spawnSparkles(btn);

  updateRowCompletion(day);
  updateProgressBar();
}

function updateRowCompletion(day) {
  const row = document.getElementById(`row-${day}`);
  if (!row) return;

  // Check all 5 fard (obligatory) prayers are done: fajr, dhuhr, asr, maghrib, isha
  const fardPrayers = ['fajr','dhuhr','asr','maghrib','isha'];
  const allFardDone = fardPrayers.every(p => state.prayers[`${day}-${p}`] === true);

  // Check all 8 items done
  const allDone = PRAYERS.every(p => state.prayers[`${day}-${p}`] === true);

  row.classList.toggle('row-complete', allFardDone);

  // Row star
  let starCell = row.querySelector('.row-star-cell');
  const dayCell = row.querySelector('.day-cell');

  if (allFardDone && !row.querySelector('.row-star-cell')) {
    // Add star to day cell
    if (!dayCell.querySelector('.row-star')) {
      const star = document.createElement('span');
      star.className = 'row-star';
      star.textContent = ' ⭐';
      star.setAttribute('title', allDone ? 'All complete! MashaAllah!' : 'All prayers done! MashaAllah!');
      dayCell.appendChild(star);
    }
    if (allDone) triggerCelebration(day, 'all');
    else triggerCelebration(day, 'fard');
  } else if (!allFardDone) {
    const star = dayCell.querySelector('.row-star');
    if (star) star.remove();
  }
}

function updateProgressBar() {
  const month  = document.getElementById('monthSelect')?.value ?? 'May';
  const days   = getDaysInMonth(month);
  const total  = days * 5; // Only count the 5 fard prayers for progress
  const fardPrayers = ['fajr','dhuhr','asr','maghrib','isha'];
  let done = 0;

  for (let d = 1; d <= days; d++) {
    fardPrayers.forEach(p => {
      if (state.prayers[`${d}-${p}`]) done++;
    });
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  document.getElementById('progressCount').textContent = `${done} / ${total}`;
  document.getElementById('progressBarFill').style.width = `${pct}%`;
  document.getElementById('progressPct').textContent = `${pct}%`;
}

/* ══════════════════════════════════════ CELEBRATIONS ═══════ */

let celebrationTimeout = null;

function triggerCelebration(day, type) {
  // Avoid duplicate celebrations
  if (celebrationTimeout) return;

  const overlay = document.getElementById('celebrationOverlay');
  const text    = document.getElementById('celebrationText');

  if (type === 'all') {
    document.getElementById('celebrationMessage').querySelector('h2').textContent = 'MashaAllah!';
    text.textContent = `Day ${day}: All prayers & goals completed! 🌟`;
  } else {
    document.getElementById('celebrationMessage').querySelector('h2').textContent = 'MashaAllah!';
    text.textContent = `Day ${day}: All 5 prayers completed! 🤲`;
  }

  overlay.classList.add('active');
  spawnConfetti();

  celebrationTimeout = setTimeout(() => {
    overlay.classList.remove('active');
    celebrationTimeout = null;
  }, 2400);
}

function spawnConfetti() {
  const count = 60;
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      const x = Math.random() * 100;
      const duration = 1.5 + Math.random() * 1.5;
      const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      const size  = 6 + Math.random() * 10;
      piece.style.cssText = `
        left: ${x}vw;
        top: -20px;
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        animation-duration: ${duration}s;
      `;
      document.body.appendChild(piece);
      piece.addEventListener('animationend', () => piece.remove());
    }, i * 25);
  }
}

function spawnSparkles(btn) {
  const rect = btn.getBoundingClientRect();
  const cx = rect.left + rect.width  / 2;
  const cy = rect.top  + rect.height / 2;
  const emojis = ['✨','⭐','🌟','💫','✦'];
  const count  = 5;

  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    const angle  = (i / count) * 360;
    const dist   = 40 + Math.random() * 30;
    const dx = Math.cos((angle * Math.PI) / 180) * dist;
    const dy = Math.sin((angle * Math.PI) / 180) * dist;

    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    el.style.cssText = `
      position: fixed;
      left: ${cx}px; top: ${cy}px;
      font-size: ${0.7 + Math.random() * 0.6}rem;
      pointer-events: none;
      z-index: 500;
      transition: transform ${0.5 + Math.random() * 0.3}s ease-out, opacity 0.5s;
      transform: translate(0,0) scale(1);
      opacity: 1;
    `;
    document.body.appendChild(el);

    requestAnimationFrame(() => {
      el.style.transform = `translate(${dx}px, ${dy}px) scale(0)`;
      el.style.opacity   = '0';
    });
    setTimeout(() => el.remove(), 900);
  }
}

/* ══════════════════════════════════════ PARTICLES ══════════ */

function createParticles() {
  const container = document.getElementById('particles');
  const count = 18;
  const symbols = ['✦','★','◆','✿','❋','⬡'];

  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.className = 'particle';
    el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    const size = 0.5 + Math.random() * 1.2;
    el.style.cssText = `
      left: ${Math.random() * 100}%;
      font-size: ${size}rem;
      color: ${CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]};
      animation-duration: ${12 + Math.random() * 20}s;
      animation-delay: ${-Math.random() * 20}s;
    `;
    container.appendChild(el);
  }
}

/* ══════════════════════════════════════ INPUT BINDING ══════ */

function bindInputs() {
  // Name
  const nameEl = document.getElementById('studentName');
  nameEl.value = state.name;
  nameEl.addEventListener('input', () => {
    state.name = sanitiseText(nameEl.value);
    saveState();
  });

  // Month
  const monthEl = document.getElementById('monthSelect');
  monthEl.value = state.month || 'May';
  monthEl.addEventListener('change', () => {
    state.month = monthEl.value;
    saveState();
    buildTable();
    updateProgressBar();
  });

  // Class
  const classEl = document.getElementById('classGroup');
  classEl.value = state.classGroup;
  classEl.addEventListener('input', () => {
    state.classGroup = sanitiseText(classEl.value);
    saveState();
  });

  // Sunnah goals
  ['goal1','goal2','goal3','goal4'].forEach(id => {
    const el = document.getElementById(id);
    el.checked = state.goals[id] === true;
    el.addEventListener('change', () => {
      state.goals[id] = el.checked;
      saveState();
    });
  });

  // Reflections
  ['ref1','ref2','ref3','ref4'].forEach(id => {
    const el = document.getElementById(id);
    el.value = state.reflections[id] ?? '';
    el.addEventListener('input', () => {
      state.reflections[id] = sanitiseText(el.value);
      saveState();
    });
  });
}

/* ══════════════════════════════════════ MONTH SELECT ═══════ */

function initMonthSelect() {
  const monthEl = document.getElementById('monthSelect');
  // Set to current month by default if no saved state
  if (!state.month) {
    const currentMonth = new Date().toLocaleString('default', { month: 'long' });
    monthEl.value = currentMonth;
    state.month = currentMonth;
  } else {
    monthEl.value = state.month;
  }
}

/* ══════════════════════════════════════ CELEBRATION CLICK ══ */

function bindCelebrationDismiss() {
  const overlay = document.getElementById('celebrationOverlay');
  overlay.addEventListener('click', () => {
    overlay.classList.remove('active');
    if (celebrationTimeout) {
      clearTimeout(celebrationTimeout);
      celebrationTimeout = null;
    }
  });
}

/* ══════════════════════════════════════ INIT ═══════════════ */

function init() {
  loadState();
  initMonthSelect();
  createParticles();
  buildTable();
  bindInputs();
  bindCelebrationDismiss();
  updateProgressBar();

  // Keyboard accessibility: allow Space/Enter to toggle prayer buttons
  document.addEventListener('keydown', e => {
    if ((e.code === 'Space' || e.code === 'Enter') && e.target.classList.contains('prayer-btn')) {
      e.preventDefault();
      e.target.click();
    }
  });

  console.info('[SalahTracker] Initialised. May Allah accept our prayers. 🤲');
}

document.addEventListener('DOMContentLoaded', init);
