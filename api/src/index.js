/* Mind the Gap — session API.
 *
 * A deliberately small Worker. It holds two people's answer sheets under one
 * random session id so they can pair by link instead of by code, and it
 * forgets everything after 30 days without being asked.
 *
 * What it deliberately does NOT do: no accounts, no email, no names, no
 * analytics, no logging of answers. A session is a random id, at most two
 * anonymous participant ids, and up to four sheets of 18 numbers.
 *
 * Routes:
 *   PUT  /s/:sid          {pid}                  join or create
 *   GET  /s/:sid?pid=     -                      read state
 *   POST /s/:sid/sheet    {pid, role, answers}   store one sheet
 */

const TTL_SECONDS = 30 * 24 * 60 * 60;   // 30 days, applied by KV itself
const ID_RE = /^[0-9A-HJKMNP-TV-Z]{20}$/; // Crockford base32, as the client mints
const N_ITEMS = 18;
const MAX_BODY = 4096;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin, env) });
    }

    try {
      const res = await route(request, env);
      for (const [k, v] of Object.entries(cors(origin, env))) res.headers.set(k, v);
      return res;
    } catch (err) {
      return json({ error: 'server' }, 500, cors(origin, env));
    }
  }
};

async function route(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);

  // /s/:sid  and  /s/:sid/sheet
  if (parts[0] !== 's' || !parts[1]) return json({ error: 'not-found' }, 404);

  const sid = parts[1];
  if (!ID_RE.test(sid)) return json({ error: 'bad-session' }, 400);

  if (parts.length === 2 && request.method === 'PUT')   return join(sid, request, env);
  if (parts.length === 2 && request.method === 'GET')   return read(sid, url, env);
  if (parts.length === 3 && parts[2] === 'sheet' && request.method === 'POST') {
    return putSheet(sid, request, env);
  }
  return json({ error: 'not-found' }, 404);
}

/* --------------------------------------------------------------- routes */

async function join(sid, request, env) {
  const body = await readJson(request);
  if (!body || !ID_RE.test(body.pid || '')) return json({ error: 'bad-pid' }, 400);

  let session = await load(env, sid);

  if (!session) {
    session = { v: 1, created: Date.now(), updated: Date.now(), members: [body.pid], sheets: {} };
  } else if (!session.members.includes(body.pid)) {
    if (session.members.length >= 2) return json({ error: 'session-full' }, 403);
    session.members.push(body.pid);
  }

  await save(env, sid, session);
  return json(view(session, body.pid));
}

async function read(sid, url, env) {
  const pid = url.searchParams.get('pid') || '';
  if (!ID_RE.test(pid)) return json({ error: 'bad-pid' }, 400);

  const session = await load(env, sid);
  if (!session) return json({ error: 'not-found' }, 404);
  if (!session.members.includes(pid)) return json({ error: 'not-a-member' }, 403);

  return json(view(session, pid));
}

async function putSheet(sid, request, env) {
  const body = await readJson(request);
  if (!body || !ID_RE.test(body.pid || '')) return json({ error: 'bad-pid' }, 400);
  if (body.role !== 'F' && body.role !== 'G') return json({ error: 'bad-role' }, 400);

  const answers = body.answers;
  if (!Array.isArray(answers) || answers.length !== N_ITEMS) {
    return json({ error: 'bad-answers' }, 400);
  }
  for (const v of answers) {
    if (!Number.isInteger(v) || v < 1 || v > 9) return json({ error: 'bad-answers' }, 400);
  }

  const session = await load(env, sid);
  if (!session) return json({ error: 'not-found' }, 404);
  if (!session.members.includes(body.pid)) return json({ error: 'not-a-member' }, 403);

  session.sheets[body.pid + ':' + body.role] = { a: answers, t: Date.now() };
  await save(env, sid, session);

  return json(view(session, body.pid));
}

/* ---------------------------------------------------------------- shape */

/* What a member sees. `you` and `them` are stable labels so the client never
 * has to reason about raw participant ids. */
function view(session, pid) {
  const them = session.members.find(m => m !== pid) || null;

  const sheetFor = (who, role) =>
    who && session.sheets[who + ':' + role] ? session.sheets[who + ':' + role].a : null;

  return {
    sid: undefined,
    created: session.created,
    expiresInDays: Math.max(
      0,
      Math.round((session.created + TTL_SECONDS * 1000 - Date.now()) / 86400000)
    ),
    partnerJoined: Boolean(them),
    you: { F: sheetFor(pid, 'F'), G: sheetFor(pid, 'G') },
    them: { F: sheetFor(them, 'F'), G: sheetFor(them, 'G') }
  };
}

/* ------------------------------------------------------------- plumbing */

async function load(env, sid) {
  const raw = await env.SESSIONS.get('s:' + sid, 'json');
  return raw || null;
}

/* Every write resets the 30-day clock, so an active session stays alive and
 * an abandoned one disappears on its own. KV does the deleting; there is no
 * cleanup job to forget to run. */
async function save(env, sid, session) {
  session.updated = Date.now();
  await env.SESSIONS.put('s:' + sid, JSON.stringify(session), {
    expirationTtl: TTL_SECONDS
  });
}

async function readJson(request) {
  const text = await request.text();
  if (!text || text.length > MAX_BODY) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    return null;
  }
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra }
  });
}

/* Only the deployed site may call this. ALLOWED_ORIGIN is a comma-separated
 * list so localhost can be added while developing. */
function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] || 'null',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
