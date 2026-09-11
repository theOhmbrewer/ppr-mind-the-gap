/* Checks for the session API.
 *
 * Against a local Worker (start it first with `npx wrangler dev --port 8787`):
 *   node test-api.js
 * Against the deployed one:
 *   node test-api.js https://mind-the-gap-api.<subdomain>.workers.dev
 */

const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const ORIGIN = 'http://localhost:5179';   // must be in ALLOWED_ORIGIN

let failures = 0;
function check(name, cond, detail) {
  if (!cond) { failures++; console.log('FAIL  ' + name + (detail ? '  — ' + detail : '')); }
  else console.log('ok    ' + name);
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function id() {
  let s = '';
  for (let i = 0; i < 20; i++) s += CROCKFORD[Math.floor(Math.random() * 32)];
  return s;
}
function sheet(v) { return Array(18).fill(v); }

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  return { status: res.status, data, headers: res.headers };
}

(async () => {
  const sid = id();
  const alice = id();
  const bob = id();
  const carol = id();

  // --- creating and joining
  let r = await call('PUT', '/s/' + sid, { pid: alice });
  check('alice creates the session', r.status === 200, 'got ' + r.status);
  check('partner not joined yet', r.data && r.data.partnerJoined === false);
  check('expiry is about 30 days', r.data && r.data.expiresInDays === 30, String(r.data && r.data.expiresInDays));

  r = await call('PUT', '/s/' + sid, { pid: alice });
  check('re-joining as alice is idempotent', r.status === 200 && r.data.partnerJoined === false);

  r = await call('PUT', '/s/' + sid, { pid: bob });
  check('bob joins', r.status === 200 && r.data.partnerJoined === true);

  r = await call('PUT', '/s/' + sid, { pid: carol });
  check('third person is refused', r.status === 403 && r.data.error === 'session-full',
        r.status + ' ' + JSON.stringify(r.data));

  // --- sheets
  r = await call('POST', '/s/' + sid + '/sheet', { pid: alice, role: 'F', answers: sheet(4) });
  check('alice stores her F sheet', r.status === 200);
  check('alice sees her own F sheet', r.data.you.F && r.data.you.F[0] === 4);
  check('alice does not yet see a G from bob', r.data.them.G === null);

  r = await call('POST', '/s/' + sid + '/sheet', { pid: bob, role: 'G', answers: sheet(8) });
  check('bob stores his G sheet', r.status === 200);

  r = await call('GET', '/s/' + sid + '?pid=' + alice);
  check('alice now sees bob\'s G sheet', r.data.them.G && r.data.them.G[0] === 8);
  check('perspectives are mirrored for bob', true);

  const rb = await call('GET', '/s/' + sid + '?pid=' + bob);
  check('bob sees alice\'s F as "them"', rb.data.them.F && rb.data.them.F[0] === 4);
  check('bob sees his own G as "you"', rb.data.you.G && rb.data.you.G[0] === 8);

  // overwrite
  r = await call('POST', '/s/' + sid + '/sheet', { pid: alice, role: 'F', answers: sheet(6) });
  check('redoing a sheet overwrites it', r.data.you.F[0] === 6);

  // --- validation
  const bad = [
    ['answers too short', { pid: alice, role: 'F', answers: sheet(5).slice(0, 17) }],
    ['answer out of range', { pid: alice, role: 'F', answers: sheet(5).map((v, i) => (i ? v : 10)) }],
    ['answer not an integer', { pid: alice, role: 'F', answers: sheet(5).map((v, i) => (i ? v : 4.5)) }],
    ['bad role', { pid: alice, role: 'X', answers: sheet(5) }],
    ['bad pid', { pid: 'nope', role: 'F', answers: sheet(5) }],
    ['answers not an array', { pid: alice, role: 'F', answers: 'five' }]
  ];
  for (const [label, body] of bad) {
    const res = await call('POST', '/s/' + sid + '/sheet', body);
    check('rejects ' + label, res.status === 400, 'got ' + res.status);
  }

  r = await call('POST', '/s/' + sid + '/sheet', { pid: carol, role: 'F', answers: sheet(5) });
  check('rejects a sheet from a non-member', r.status === 403, 'got ' + r.status);

  r = await call('GET', '/s/' + sid + '?pid=' + carol);
  check('non-member cannot read', r.status === 403, 'got ' + r.status);

  r = await call('GET', '/s/' + 'short?pid=' + alice);
  check('rejects a malformed session id', r.status === 400, 'got ' + r.status);

  r = await call('GET', '/s/' + id() + '?pid=' + alice);
  check('unknown session is not found', r.status === 404, 'got ' + r.status);

  // --- CORS
  const pre = await fetch(BASE + '/s/' + sid, {
    method: 'OPTIONS',
    headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'PUT' }
  });
  check('preflight succeeds', pre.status === 204, 'got ' + pre.status);
  check('preflight allows our origin',
        pre.headers.get('access-control-allow-origin') === ORIGIN,
        pre.headers.get('access-control-allow-origin'));

  const evil = await fetch(BASE + '/s/' + sid, {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'PUT' }
  });
  check('unknown origin is not echoed back',
        evil.headers.get('access-control-allow-origin') !== 'https://evil.example',
        evil.headers.get('access-control-allow-origin'));

  // --- no answer data leaks in an error
  r = await call('GET', '/s/' + sid + '?pid=' + carol);
  check('refusal carries no session data', JSON.stringify(r.data).indexOf('you') === -1,
        JSON.stringify(r.data));

  console.log('');
  console.log(failures === 0 ? 'All API checks passed.' : failures + ' API check(s) FAILED.');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => {
  console.error('Could not reach ' + BASE + ' — is the Worker running?');
  console.error(e.message);
  process.exit(1);
});
