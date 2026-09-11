/* Mind the Gap — storage.
 *
 * Two layers, and they are independent on purpose:
 *
 *   1. This device. localStorage remembers who you are, which sheets you've
 *      filled in and what you scored. Costs nothing, needs no server, and
 *      keeps working if the API is down.
 *
 *   2. The shared session. A Cloudflare Worker holds both partners' sheets
 *      under one random id so you can pair by link instead of by code.
 *
 * If API_BASE is empty, or the API is unreachable, everything still works —
 * the app falls back to share codes. The server is an upgrade, never a
 * dependency.
 */

/* ------------------------------------------------------------- config */

/* AFTER DEPLOYING THE WORKER, paste its URL on the next line. That is the
 * only edit needed — e.g. 'https://mind-the-gap-api.yourname.workers.dev'.
 * Left empty, the app runs in codes-only mode and never calls out. */
const API_PRODUCTION = '';

/* When the page is opened from localhost, talk to `wrangler dev` instead, so
 * testing never touches the deployed data. */
const API_LOCAL = 'http://127.0.0.1:8787';

const API_BASE = (typeof location !== 'undefined' &&
                  ['localhost', '127.0.0.1'].includes(location.hostname))
  ? API_LOCAL
  : API_PRODUCTION;

const LS_ME = 'mtg.me.v1';
const LS_SESSIONS = 'mtg.sessions.v1';

/* ------------------------------------------------------- local storage */

/* Every read and write is guarded. localStorage throws outright in some
 * privacy modes, and a tool that dies because it couldn't remember something
 * optional would be a bad trade. */

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

function storageWorks() {
  try {
    localStorage.setItem('mtg.probe', '1');
    localStorage.removeItem('mtg.probe');
    return true;
  } catch (e) {
    return false;
  }
}

/* A random id with no meaning attached to it. Used both for participant ids
 * and session ids: 20 characters of Crockford base32 is about 100 bits, far
 * past anything that could be guessed. */
function randomId(len = 20) {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = new Uint8Array(len);
  (crypto || window.crypto).getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % 32];
  return out;
}

/* This browser's identity. Not an account — just a way for the server to tell
 * the two of you apart without knowing anything about either of you. */
function myId() {
  let me = lsGet(LS_ME, null);
  if (!me || !me.pid) {
    me = { pid: randomId(20), since: Date.now() };
    lsSet(LS_ME, me);
  }
  return me.pid;
}

function allLocalSessions() {
  return lsGet(LS_SESSIONS, {});
}

function localSession(sid) {
  return allLocalSessions()[sid] || null;
}

/* Remember one of my own sheets. Kept separately from the server copy so the
 * results screen still works offline and after the session expires. */
function saveLocalSheet(sid, role, answers, meta = {}) {
  const all = allLocalSessions();
  const entry = all[sid] || { sheets: {}, created: Date.now() };
  entry.sheets[role] = answersToList(answers);
  entry.updated = Date.now();
  Object.assign(entry, meta);
  all[sid] = entry;
  pruneSessions(all);
  lsSet(LS_SESSIONS, all);
  return entry;
}

function localSheet(sid, role) {
  const entry = localSession(sid);
  if (!entry || !entry.sheets || !entry.sheets[role]) return null;
  return listToAnswers(entry.sheets[role]);
}

function forgetSession(sid) {
  const all = allLocalSessions();
  delete all[sid];
  lsSet(LS_SESSIONS, all);
}

function forgetEverything() {
  try {
    localStorage.removeItem(LS_SESSIONS);
    localStorage.removeItem(LS_ME);
    return true;
  } catch (e) {
    return false;
  }
}

/* Mirror the server's 30-day expiry locally, and cap the number kept, so this
 * can't grow without bound on a shared machine. */
function pruneSessions(all) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const [sid, entry] of Object.entries(all)) {
    if ((entry.updated || entry.created || 0) < cutoff) delete all[sid];
  }
  const keys = Object.keys(all).sort(
    (a, b) => (all[b].updated || 0) - (all[a].updated || 0)
  );
  for (const sid of keys.slice(25)) delete all[sid];
}

/* ------------------------------------------------------------- the API */

function apiConfigured() {
  return typeof API_BASE === 'string' && API_BASE.length > 0;
}

async function apiCall(path, options = {}) {
  if (!apiConfigured()) return { ok: false, offline: true, error: 'no-api' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(API_BASE + path, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: body.error || 'http-' + res.status };
    return { ok: true, data: body };
  } catch (e) {
    // A timeout, a DNS failure, an offline laptop — all the same to the caller.
    return { ok: false, offline: true, error: e.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/* Create the session if it's new, or join it as the second person. Returns
 * the session state including which slot is mine. */
function apiJoin(sid) {
  return apiCall('/s/' + encodeURIComponent(sid), {
    method: 'PUT',
    body: JSON.stringify({ pid: myId() })
  });
}

function apiFetch(sid) {
  return apiCall('/s/' + encodeURIComponent(sid) + '?pid=' + encodeURIComponent(myId()));
}

function apiPutSheet(sid, role, answers) {
  return apiCall('/s/' + encodeURIComponent(sid) + '/sheet', {
    method: 'POST',
    body: JSON.stringify({ pid: myId(), role, answers: answersToList(answers) })
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    API_BASE, apiConfigured, randomId, myId, storageWorks,
    allLocalSessions, localSession, saveLocalSheet, localSheet,
    forgetSession, forgetEverything, pruneSessions
  };
}
