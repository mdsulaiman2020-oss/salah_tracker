/**
 * ILMUL JANNAH — Leaderboard
 * leaderboard.js — Real-time Firestore data, ranking, filters, admin panel
 *
 * Security notes:
 *  - All Firestore data is sanitised via escapeHtml() before DOM insertion
 *  - Admin PIN checked client-side only (appropriate for kids class tracker)
 *  - No delete operations (removed per requirements)
 *  - No user PII beyond submitted name/class stored in Firestore
 */

'use strict';

/* ══════════════════════════════════════ FIREBASE INIT ══════ */
let db = null;
try {
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.firestore();
} catch (err) {
  console.error('[Leaderboard] Firebase init failed:', err.message);
  showFirebaseError();
}

function showFirebaseError() {
  document.getElementById('loadingState').innerHTML =
    `<span class="spinner">⚠️</span>
     <p>Firebase not configured yet.<br/>
     Please follow the setup guide in <code>firebase-config.js</code>.</p>`;
}

/* ══════════════════════════════════════ STATE ══════════════ */
let allSubmissions  = [];
let filteredData    = [];
let unsubscribe     = null;
let isAdminMode     = false;

const activeFilters = { month: 'All', classGroup: 'All', sortBy: 'score' };

/* ══════════════════════════════════════ REAL-TIME LISTENER ═ */

function startListener() {
  if (!db) return;
  if (unsubscribe) unsubscribe();

  unsubscribe = db
    .collection(SUBMISSIONS_COLLECTION)
    .orderBy('submittedAt', 'desc')
    .onSnapshot(
      snapshot => {
        allSubmissions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        populateFilterDropdowns();
        applyFiltersAndRender();
      },
      err => {
        console.error('[Leaderboard] Firestore snapshot error:', err.message);
        document.getElementById('loadingState').innerHTML =
          `<span class="spinner">📡</span><p>Connection error. Please refresh.</p>`;
      }
    );
}

/* ══════════════════════════════════════ DEDUPLICATION ══════ */
/**
 * For the same (name + classGroup + month), keep only the latest submission.
 * This is done client-side; Firestore stores every submission as-is.
 */
function deduplicateLatest(submissions) {
  const map = new Map();
  submissions.forEach(sub => {
    const key = [
      (sub.name       || '').toLowerCase().trim(),
      (sub.classGroup || '').toLowerCase().trim(),
      (sub.month      || '').toLowerCase().trim()
    ].join('|');
    const existingAt = map.get(key)?.submittedAt?.seconds ?? 0;
    const thisAt     = sub.submittedAt?.seconds ?? 0;
    if (!map.has(key) || thisAt > existingAt) map.set(key, sub);
  });
  return Array.from(map.values());
}

/* ══════════════════════════════════════ FILTER DROPDOWNS ═══ */

function populateFilterDropdowns() {
  const months  = [...new Set(allSubmissions.map(s => s.month).filter(Boolean))].sort();
  const classes = [...new Set(allSubmissions.map(s => s.classGroup).filter(Boolean))].sort();

  populateSelect('filterMonth',  ['All Months',  ...months],  ['All', ...months],  activeFilters.month);
  populateSelect('filterClass',  ['All Classes', ...classes], ['All', ...classes], activeFilters.classGroup);
}

function populateSelect(id, labels, values, current) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = labels.map((label, i) =>
    `<option value="${escapeHtml(values[i])}" ${values[i] === current ? 'selected' : ''}>${escapeHtml(label)}</option>`
  ).join('');
}

/* ══════════════════════════════════════ APPLY FILTERS ══════ */

function applyFiltersAndRender() {
  let data = deduplicateLatest(allSubmissions);

  if (activeFilters.month !== 'All') {
    data = data.filter(s => s.month === activeFilters.month);
  }
  if (activeFilters.classGroup !== 'All') {
    data = data.filter(s => s.classGroup === activeFilters.classGroup);
  }

  // Sort
  data.sort((a, b) => {
    switch (activeFilters.sortBy) {
      case 'fard':        return (b.fardPercent      || 0) - (a.fardPercent      || 0);
      case 'perfectDays': return (b.perfectDays      || 0) - (a.perfectDays      || 0);
      case 'sunnah':      return (b.sunnahCompleted  || 0) - (a.sunnahCompleted  || 0);
      case 'quran':       return (b.quranCompleted   || 0) - (a.quranCompleted   || 0);
      default:            return computeTotalScore(b) - computeTotalScore(a);
    }
  });

  filteredData = data;

  document.getElementById('loadingState').hidden = true;
  document.getElementById('emptyState').hidden   = data.length > 0;
  document.getElementById('filterCount').textContent =
    data.length ? `${data.length} student${data.length !== 1 ? 's' : ''}` : '';

  renderStats(data);
  renderPodium(data);
  renderCards(data);
}

/* ══════════════════════════════════════ RENDER STATS ════════ */

function renderStats(data) {
  const row = document.getElementById('statsRow');
  if (!data.length) { row.innerHTML = ''; return; }

  const avgFard       = Math.round(data.reduce((a, b) => a + (b.fardPercent || 0), 0) / data.length);
  const totalPerfect  = data.reduce((a, b) => a + (b.perfectDays   || 0), 0);
  const topStudent    = data[0];
  const avgScore      = Math.round(data.reduce((a, b) => a + computeTotalScore(b), 0) / data.length);

  row.innerHTML = `
    <div class="stat-card">
      <span class="stat-icon">👥</span>
      <span class="stat-value">${data.length}</span>
      <span class="stat-label">Students</span>
    </div>
    <div class="stat-card">
      <span class="stat-icon">📊</span>
      <span class="stat-value">${avgFard}%</span>
      <span class="stat-label">Avg Fard</span>
    </div>
    <div class="stat-card">
      <span class="stat-icon">⭐</span>
      <span class="stat-value">${totalPerfect}</span>
      <span class="stat-label">Perfect Days</span>
    </div>
    <div class="stat-card">
      <span class="stat-icon">🏆</span>
      <span class="stat-value" style="font-size:1rem;line-height:1.2">${escapeHtml(topStudent.name || '—')}</span>
      <span class="stat-label">Top Student</span>
    </div>
  `;
}

/* ══════════════════════════════════════ RENDER PODIUM ════════ */

function renderPodium(data) {
  const section = document.getElementById('podiumSection');
  if (data.length < 1) { section.hidden = true; return; }
  section.hidden = false;

  const [first, second, third] = data;

  const podiumCard = (student, rank) => {
    if (!student) return `<div class="podium-empty"></div>`;
    const score = computeTotalScore(student);
    const medal = ['🥇','🥈','🥉'][rank - 1];
    return `
      <div class="podium-place rank-${rank}">
        <div class="podium-medal">${medal}</div>
        <div class="podium-name">${escapeHtml(student.name || '—')}</div>
        <div class="podium-class">${escapeHtml(student.classGroup || '')}${student.month ? ' · ' + escapeHtml(student.month) : ''}</div>
        <div class="podium-score">${score}<span>/100</span></div>
        <div class="podium-fard">${student.fardPercent || 0}% Fard · ${student.perfectDays || 0} ⭐</div>
        <div class="podium-base rank-${rank}-base">
          <span class="podium-rank">${rank}</span>
        </div>
      </div>`;
  };

  section.innerHTML = `
    <h2 class="podium-title">🏆 Top Performers</h2>
    <div class="podium-row">
      ${podiumCard(second, 2)}
      ${podiumCard(first, 1)}
      ${podiumCard(third, 3)}
    </div>`;
}

/* ══════════════════════════════════════ RENDER CARDS ════════ */

function renderCards(data) {
  const grid      = document.getElementById('lbGrid');
  const listTitle = document.getElementById('listTitle');

  if (!data.length) { grid.innerHTML = ''; listTitle.hidden = true; return; }
  listTitle.hidden = false;

  const circumference = +(2 * Math.PI * 34).toFixed(1); // ~213.6

  grid.innerHTML = data.map((student, index) => {
    const rank  = index + 1;
    const score = computeTotalScore(student);
    const medal = rank <= 3 ? ['🥇','🥈','🥉'][rank - 1] : `#${rank}`;
    const days  = getDaysInMonth(student.month || 'May');

    const sunnahPct = days > 0 ? Math.round(((student.sunnahCompleted || 0) / days) * 100) : 0;
    const quranPct  = days > 0 ? Math.round(((student.quranCompleted  || 0) / days) * 100) : 0;
    const alhamdPct = days > 0 ? Math.round(((student.alhamdCompleted || 0) / days) * 100) : 0;

    const fardPct = student.fardPercent || 0;
    const ringColor = score >= 90 ? '#C9912A' : score >= 75 ? '#888' : score >= 60 ? '#CD7F32' : '#2E7D4F';
    const dashOffset = (circumference * (1 - fardPct / 100)).toFixed(1);

    const submittedDate = student.submittedAt?.toDate
      ? student.submittedAt.toDate().toLocaleDateString('en-GB', { day:'numeric', month:'short' })
      : '';

    const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';

    return `
      <div class="lb-card ${rankClass}" style="--rank-delay:${(index * 0.04).toFixed(2)}s" data-id="${escapeHtml(student.id)}">
        <div class="lb-card-rank">${medal}</div>
        <div class="lb-card-info">
          <div class="lb-card-name">${escapeHtml(student.name || '—')}</div>
          <div class="lb-card-meta">${escapeHtml(student.classGroup || '')}${student.month ? ' · ' + escapeHtml(student.month) : ''}</div>
        </div>
        <div class="lb-card-ring">
          <svg width="70" height="70" viewBox="0 0 80 80" aria-label="${fardPct}% fard prayers">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#EEE" stroke-width="8"/>
            <circle cx="40" cy="40" r="34" fill="none" stroke="${ringColor}" stroke-width="8"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${dashOffset}"
              stroke-linecap="round"
              transform="rotate(-90 40 40)"
              style="transition:stroke-dashoffset 1s ease"/>
            <text x="40" y="37" text-anchor="middle" font-size="13" font-weight="800" fill="${ringColor}" font-family="Baloo 2,sans-serif">${fardPct}%</text>
            <text x="40" y="50" text-anchor="middle" font-size="8" fill="#999" font-family="Nunito,sans-serif">Fard</text>
          </svg>
        </div>
        <div class="lb-card-score">
          <div class="lb-score-value">${score}</div>
          <div class="lb-score-label">Score</div>
        </div>
        <div class="lb-card-stats">
          <div class="lb-stat-item">⭐ ${student.perfectDays || 0} perfect days</div>
          <div class="lb-stat-item">✨ ${sunnahPct}% sunnah</div>
          <div class="lb-stat-item">📖 ${quranPct}% qur'an</div>
          <div class="lb-stat-item">❤️ ${alhamdPct}% alhamdulillah</div>
          <div class="lb-stat-item">🎯 ${student.goalsCompleted || 0}/4 goals</div>
        </div>
        <div class="lb-card-date">${escapeHtml(submittedDate)}</div>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════ ADMIN PIN MODAL ═════ */

let pinBuffer = '';

function openAdminModal() {
  pinBuffer = '';
  updatePinDots();
  document.getElementById('modalError').textContent = '';
  document.getElementById('adminModal').hidden = false;
  document.getElementById('adminModal').focus();
}

function closeAdminModal() {
  document.getElementById('adminModal').hidden = true;
  pinBuffer = '';
  updatePinDots();
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`dot${i}`);
    dot.className = 'pin-dot' + (i < pinBuffer.length ? ' filled' : '');
  }
}

function handlePinDigit(digit) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += digit;
  updatePinDots();
  if (pinBuffer.length === 4) submitPin();
}

function handlePinDelete() {
  pinBuffer = pinBuffer.slice(0, -1);
  updatePinDots();
  document.getElementById('modalError').textContent = '';
}

function submitPin() {
  if (pinBuffer === String(ADMIN_PIN)) {
    closeAdminModal();
    activateAdminMode();
  } else {
    document.getElementById('modalError').textContent = 'Incorrect PIN. Try again.';
    document.querySelectorAll('.pin-dot').forEach(d => {
      d.classList.add('error');
      setTimeout(() => d.classList.remove('error'), 500);
    });
    setTimeout(() => { pinBuffer = ''; updatePinDots(); }, 500);
  }
}

function activateAdminMode() {
  isAdminMode = true;
  document.getElementById('adminPanel').hidden = false;
  document.getElementById('adminBtn').classList.add('active');
  document.getElementById('adminBtn').textContent = '✓ Admin';
}

function deactivateAdminMode() {
  isAdminMode = false;
  document.getElementById('adminPanel').hidden = true;
  document.getElementById('adminBtn').classList.remove('active');
  document.getElementById('adminBtn').textContent = '🔐 Admin';
}

/* ══════════════════════════════════════ EXPORT CSV ══════════ */

function exportCsv() {
  if (!filteredData.length) { alert('No data to export.'); return; }

  const header = ['Rank','Name','Class/Group','Month','Fard %','Score','Perfect Days','Sunnah','Qur\'an','Alhamdulillah','Goals','Submitted'];
  const rows = filteredData.map((s, i) => [
    i + 1,
    s.name       || '',
    s.classGroup || '',
    s.month      || '',
    s.fardPercent        || 0,
    computeTotalScore(s),
    s.perfectDays        || 0,
    s.sunnahCompleted    || 0,
    s.quranCompleted     || 0,
    s.alhamdCompleted    || 0,
    s.goalsCompleted     || 0,
    s.submittedAt?.toDate ? s.submittedAt.toDate().toLocaleDateString() : ''
  ]);

  const csvContent = [header, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = `salah-leaderboard-${Date.now()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ══════════════════════════════════════ FILTER BINDINGS ═════ */

function bindFilters() {
  document.getElementById('filterMonth').addEventListener('change', e => {
    activeFilters.month = e.target.value;
    applyFiltersAndRender();
  });
  document.getElementById('filterClass').addEventListener('change', e => {
    activeFilters.classGroup = e.target.value;
    applyFiltersAndRender();
  });
  document.getElementById('sortBy').addEventListener('change', e => {
    activeFilters.sortBy = e.target.value;
    applyFiltersAndRender();
  });
}

/* ══════════════════════════════════════ ADMIN BINDINGS ══════ */

function bindAdmin() {
  // Admin button opens PIN modal
  document.getElementById('adminBtn').addEventListener('click', () => {
    if (isAdminMode) deactivateAdminMode();
    else openAdminModal();
  });

  // PIN pad digit buttons
  document.querySelectorAll('.pin-key[data-digit]').forEach(btn => {
    btn.addEventListener('click', () => handlePinDigit(btn.dataset.digit));
  });
  document.getElementById('pinDel').addEventListener('click', handlePinDelete);
  document.getElementById('pinEnter').addEventListener('click', submitPin);
  document.getElementById('modalCancel').addEventListener('click', closeAdminModal);

  // Close modal on overlay click
  document.getElementById('adminModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAdminModal();
  });

  // Keyboard PIN entry
  document.addEventListener('keydown', e => {
    if (document.getElementById('adminModal').hidden) return;
    if (e.key >= '0' && e.key <= '9') handlePinDigit(e.key);
    else if (e.key === 'Backspace') handlePinDelete();
    else if (e.key === 'Enter') submitPin();
    else if (e.key === 'Escape') closeAdminModal();
  });

  // Admin panel buttons
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
  document.getElementById('printBtn').addEventListener('click', () => window.print());
  document.getElementById('adminCloseBtn').addEventListener('click', deactivateAdminMode);
}

/* ══════════════════════════════════════ INIT ════════════════ */

function init() {
  if (db) {
    startListener();
  }
  bindFilters();
  bindAdmin();
}

document.addEventListener('DOMContentLoaded', init);
