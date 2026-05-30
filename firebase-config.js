/**
 * ILMUL JANNAH — Firebase Configuration
 * ─────────────────────────────────────────────────────────────────
 * SETUP INSTRUCTIONS:
 *  1. Go to https://console.firebase.google.com
 *  2. Create a new project (e.g. "ilmul-jannah-tracker")
 *  3. Add a Web App (</> icon on Project Overview)
 *  4. Copy the firebaseConfig object values below
 *  5. In Firebase console → Build → Firestore Database → Create database
 *     → Start in "test mode" initially → choose your region
 *  6. Replace ALL "REPLACE_WITH_..." placeholders below
 *  7. Save, commit, and push to GitHub
 * ─────────────────────────────────────────────────────────────────
 * Security note: Firebase API keys for web apps are NOT secret.
 * Data access is controlled by Firestore Security Rules (firestore.rules).
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBp5Dz61qB4iA45BkCWNbucSA7pREmyYcA",
  authDomain: "salah-tracker-d4cfe.firebaseapp.com",
  projectId: "salah-tracker-d4cfe",
  storageBucket: "salah-tracker-d4cfe.firebasestorage.app",
  messagingSenderId: "434010203957",
  appId: "1:434010203957:web:a0431bd21df56a20e90e7c",
};

/**
 * Admin PIN — change this to your preferred 4-digit PIN.
 * After changing, commit and push to GitHub to update the live site.
 */
const ADMIN_PIN = "1234";

/** Firestore collection name for leaderboard submissions */
const SUBMISSIONS_COLLECTION = "submissions";

/** Prayer columns tracked */
const PRAYERS = [
  "fajr",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
  "sunnah",
  "quran",
  "alhamd",
];
const PRAYER_LABELS = [
  "Fajr",
  "Dhuhr",
  "Asr",
  "Maghrib",
  "Isha",
  "Sunnah/Extra",
  "Reading Qur'an",
  "Alhamdulillah",
];
const FARD_PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

/** Months list */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Return the number of days in a given month name for the current year.
 * @param {string} monthName
 * @returns {number}
 */
function getDaysInMonth(monthName) {
  const year = new Date().getFullYear();
  const monthIndex = MONTHS.indexOf(monthName);
  if (monthIndex === -1) return 31;
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Compute composite leaderboard score (0–100).
 * Fard completion is 60% weight; Sunnah, Qur'an, Alhamd, Goals split the rest.
 * @param {Object} sub — submission document
 * @returns {number}
 */
function computeTotalScore(sub) {
  const days = getDaysInMonth(sub.month || "May");
  const sunnahPct = days > 0 ? (sub.sunnahCompleted || 0) / days : 0;
  const quranPct = days > 0 ? (sub.quranCompleted || 0) / days : 0;
  const alhamdPct = days > 0 ? (sub.alhamdCompleted || 0) / days : 0;
  const goalsPct = (sub.goalsCompleted || 0) / 4;

  return Math.round(
    (sub.fardPercent || 0) * 0.6 +
      sunnahPct * 100 * 0.15 +
      quranPct * 100 * 0.15 +
      alhamdPct * 100 * 0.05 +
      goalsPct * 100 * 0.05,
  );
}

/**
 * Sanitise a string value to prevent XSS when inserted as text.
 * @param {string} val
 * @param {number} [max=100]
 * @returns {string}
 */
function sanitiseText(val, max = 100) {
  return String(val ?? "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, max);
}

/**
 * Escape HTML special characters for safe innerHTML insertion.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(str ?? "").replace(/[&<>"']/g, (c) => map[c]);
}
