/* Mind the Gap — a two-sided perceived partner responsiveness tool.
 *
 * The instrument is the Perceived Partner Responsiveness Scale (PPRS),
 * Reis & Carmichael (2006), as profiled in Reis, Crasta, Rogge, Maniaci &
 * Carmichael (2018). 18 items, 9-point scale, scored by summation.
 *
 * Two roles:
 *   F ("felt")  — you rate your partner's responsiveness to you.
 *   G ("given") — you rate your own responsiveness to your partner.
 * Pair one of each and the difference is the gap between what one person
 * intends and what the other actually experiences.
 *
 * Nothing is stored and nothing is sent anywhere. Results travel as a short
 * code that you choose to share.
 */

/* ---------------------------------------------------------------- items */

/* The scale profile says: "Labels should be removed and items randomized
 * prior to administration." So `sub` is used only for scoring and results,
 * never shown while someone is answering, and order is shuffled per run. */

const ITEMS = [
  { id: 1,  sub: 'general',       in12: true,
    f: 'really listens to me.',
    g: 'really listen to my partner.',
    short: 'Really listens' },
  { id: 2,  sub: 'general',       in12: true,
    f: 'is responsive to my needs.',
    g: 'am responsive to my partner’s needs.',
    short: 'Responsive to needs' },

  { id: 3,  sub: 'understanding', in12: false,
    f: 'is an excellent judge of my character.',
    g: 'am an excellent judge of my partner’s character.',
    short: 'Judges character well' },
  { id: 4,  sub: 'understanding', in12: true,
    f: 'sees the “real” me.',
    g: 'see the “real” them.',
    short: 'Sees the “real” me' },
  { id: 5,  sub: 'understanding', in12: false,
    f: 'sees the same virtues and faults in me as I see in myself.',
    g: 'see the same virtues and faults in them as they see in themselves.',
    short: 'Same virtues and faults' },
  { id: 6,  sub: 'understanding', in12: true,
    f: '“gets the facts right” about me.',
    g: '“get the facts right” about them.',
    short: 'Gets the facts right' },
  { id: 7,  sub: 'understanding', in12: false,
    f: 'is aware of what I am thinking and feeling.',
    g: 'am aware of what they are thinking and feeling.',
    short: 'Aware of my inner state' },
  { id: 8,  sub: 'understanding', in12: true,
    f: 'understands me.',
    g: 'understand them.',
    short: 'Understands me' },
  { id: 9,  sub: 'understanding', in12: true,
    f: 'is on “the same wavelength” with me.',
    g: 'am on “the same wavelength” with them.',
    short: 'Same wavelength' },
  { id: 10, sub: 'understanding', in12: true,
    f: 'knows me well.',
    g: 'know them well.',
    short: 'Knows me well' },

  { id: 11, sub: 'validation',    in12: true,
    f: 'esteems me, shortcomings and all.',
    g: 'esteem them, shortcomings and all.',
    short: 'Esteems me, flaws and all' },
  { id: 12, sub: 'validation',    in12: true,
    f: 'values and respects the whole package that is the “real” me.',
    g: 'value and respect the whole package that is the “real” them.',
    short: 'Values the whole package' },
  { id: 13, sub: 'validation',    in12: false,
    f: 'seems to focus on the “best side” of me.',
    g: 'focus on the “best side” of them.',
    short: 'Focuses on my best side' },
  { id: 14, sub: 'validation',    in12: true,
    f: 'expresses liking and encouragement for me.',
    g: 'express liking and encouragement for them.',
    short: 'Expresses encouragement' },
  { id: 15, sub: 'validation',    in12: true,
    f: 'seems interested in what I am thinking and feeling.',
    g: 'am interested in what they are thinking and feeling.',
    short: 'Interested in my thoughts' },
  { id: 16, sub: 'validation',    in12: false,
    f: 'seems interested in doing things with me.',
    g: 'am interested in doing things with them.',
    short: 'Wants to do things with me' },
  { id: 17, sub: 'validation',    in12: true,
    f: 'values my abilities and opinions.',
    g: 'value their abilities and opinions.',
    short: 'Values my abilities' },
  { id: 18, sub: 'validation',    in12: false,
    f: 'respects me.',
    g: 'respect them.',
    short: 'Respects me' }
];

const ANCHORS = [
  { v: 1, label: 'Not at all true' },
  { v: 3, label: 'Somewhat true' },
  { v: 5, label: 'Moderately true' },
  { v: 7, label: 'Very true' },
  { v: 9, label: 'Completely true' }
];

/* ------------------------------------------------------------- the code */

/* An answer sheet is 18 values of 1-9 plus a role flag. Packed as a single
 * number in base 9, then written in Crockford base32 (no I, L, O or U, so
 * there is nothing to misread when you text it). 12 characters of data plus
 * one check character. */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DATA_LEN = 12;

function encodeSheet(role, answers) {
  let n = 0n;
  for (const item of ITEMS) {
    const a = answers[item.id];
    if (!(a >= 1 && a <= 9)) throw new Error('answer out of range for item ' + item.id);
    n = n * 9n + BigInt(a - 1);
  }
  n = n * 2n + (role === 'G' ? 1n : 0n);

  let out = '';
  for (let i = 0; i < DATA_LEN; i++) {
    out = ALPHABET[Number(n % 32n)] + out;
    n = n / 32n;
  }
  return out + checkChar(out);
}

function decodeSheet(raw) {
  const cleaned = String(raw || '')
    .toUpperCase()
    .replace(/[ILO]/g, c => (c === 'O' ? '0' : '1'))
    .replace(/[^0-9A-Z]/g, '');

  if (cleaned.length !== DATA_LEN + 1) return { ok: false, why: 'length' };

  const data = cleaned.slice(0, DATA_LEN);
  if ([...cleaned].some(c => ALPHABET.indexOf(c) === -1)) return { ok: false, why: 'chars' };
  if (cleaned[DATA_LEN] !== checkChar(data)) return { ok: false, why: 'check' };

  let n = 0n;
  for (const c of data) n = n * 32n + BigInt(ALPHABET.indexOf(c));

  const role = (n % 2n) === 1n ? 'G' : 'F';
  n = n / 2n;

  const answers = {};
  for (let i = ITEMS.length - 1; i >= 0; i--) {
    answers[ITEMS[i].id] = Number(n % 9n) + 1;
    n = n / 9n;
  }
  if (n !== 0n) return { ok: false, why: 'overflow' };

  return { ok: true, role, answers };
}

/* Weights must be ODD. An odd number is invertible modulo 32, so changing any
 * single character always changes the checksum — with even weights, some
 * typos cancel out and decode silently to the wrong answers. */
function checkChar(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += ALPHABET.indexOf(data[i]) * (2 * i + 1);
  return ALPHABET[sum % 32];
}

function prettyCode(code) {
  return code.slice(0, 4) + '-' + code.slice(4, 8) + '-' + code.slice(8);
}

/* -------------------------------------------------------------- scoring */

/* The published scoring is simple summation. Totals are reported alongside
 * the per-item mean, because the mean sits on the same 1-9 scale the person
 * just answered on and is far easier to read than a number out of 162. */

function score(answers) {
  const sum = ids => ids.reduce((t, id) => t + answers[id], 0);
  const idsOf = sub => ITEMS.filter(i => i.sub === sub).map(i => i.id);

  const all = ITEMS.map(i => i.id);
  const understanding = idsOf('understanding');
  const validation = idsOf('validation');
  const general = idsOf('general');

  return {
    total:         { sum: sum(all),           n: all.length },
    understanding: { sum: sum(understanding), n: understanding.length },
    validation:    { sum: sum(validation),    n: validation.length },
    general:       { sum: sum(general),       n: general.length }
  };
}

function mean(part) {
  return part.sum / part.n;
}

/* The scale's own anchors are the only honest labels available. The papers
 * report reliability and correlations but no norms, percentiles or cutoffs,
 * so this describes where a score sits on the response scale and nothing
 * more. It is deliberately not a diagnosis. */
function describe(m) {
  if (m >= 8)   return 'close to “completely true”';
  if (m >= 6.5) return 'between “very true” and “completely true”';
  if (m >= 5.5) return 'around “very true”';
  if (m >= 4.5) return 'around “moderately true”';
  if (m >= 3)   return 'between “somewhat” and “moderately true”';
  return 'toward “not at all true”';
}

/* ----------------------------------------------------------------- state */

const state = {
  role: null,
  order: [],
  index: 0,
  answers: {},
  myCode: null
};

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------------------------------------- rendering */

const $ = sel => document.querySelector(sel);
const screens = () => document.querySelectorAll('.screen');

function show(id) {
  screens().forEach(s => { s.hidden = (s.id !== id); });
  window.scrollTo({ top: 0, behavior: 'instant' });
  const h = document.querySelector('#' + id + ' h2, #' + id + ' h1');
  if (h) h.focus();
}

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const kid of kids) if (kid) node.append(kid);
  return node;
}

/* ---- the quiz ---- */

function startQuiz(role) {
  state.role = role;
  state.order = shuffled(ITEMS);
  state.index = 0;
  state.answers = {};
  state.myCode = null;
  $('#stem').textContent = role === 'F' ? 'My partner usually…' : 'I usually…';
  renderQuestion();
  show('quiz');
}

function renderQuestion() {
  const item = state.order[state.index];
  const n = state.order.length;

  $('#progress-bar').style.width = ((state.index) / n * 100) + '%';
  $('#progress-text').textContent = 'Question ' + (state.index + 1) + ' of ' + n;

  $('#item-text').textContent = state.role === 'F' ? item.f : item.g;

  const scale = $('#scale');
  scale.replaceChildren();
  for (let v = 1; v <= 9; v++) {
    const anchor = ANCHORS.find(a => a.v === v);
    const btn = el('button', {
      class: 'dot' + (state.answers[item.id] === v ? ' chosen' : ''),
      type: 'button',
      'aria-label': v + (anchor ? ' — ' + anchor.label : ''),
      onclick: () => answer(item.id, v)
    }, el('span', { class: 'dot-num', text: String(v) }),
       anchor ? el('span', { class: 'dot-label', text: anchor.label }) : null);
    scale.append(btn);
  }

  $('#back').disabled = state.index === 0;
}

function answer(itemId, value) {
  state.answers[itemId] = value;
  renderQuestion();
  // A short pause so the choice visibly registers before the next item.
  setTimeout(() => {
    if (state.index < state.order.length - 1) {
      state.index++;
      renderQuestion();
    } else {
      finish();
    }
  }, 180);
}

function finish() {
  state.myCode = encodeSheet(state.role, state.answers);
  renderOwnResult();
  show('result');
}

/* ---- your own result ---- */

function renderOwnResult() {
  const s = score(state.answers);
  const isF = state.role === 'F';

  $('#result-title').textContent = isF
    ? 'How responsive your partner feels to you'
    : 'How responsive you believe you are';

  $('#result-lede').textContent = isF
    ? 'This is your experience of being understood and valued by your partner. It is a reading of how things land for you — not a measurement of what your partner intends.'
    : 'This is your own account of how you show up for your partner. Where it differs from their experience is the interesting part.';

  const box = $('#own-scores');
  box.replaceChildren(
    scoreRow('Overall', s.total, 'All 18 items'),
    scoreRow('Understanding', s.understanding, 'Feeling accurately known — that someone “gets things right” about you'),
    scoreRow('Validation', s.validation, 'Feeling appreciated and valued for who you actually are')
  );

  $('#code-out').textContent = prettyCode(state.myCode);
}

function scoreRow(label, part, note) {
  const m = mean(part);
  return el('div', { class: 'score-row' },
    el('div', { class: 'score-head' },
      el('h4', { text: label }),
      el('div', { class: 'score-num' },
        el('strong', { text: m.toFixed(1) }),
        el('span', { text: ' / 9' }))),
    el('div', { class: 'meter' },
      el('div', { class: 'meter-fill', style: 'width:' + ((m - 1) / 8 * 100) + '%' })),
    el('p', { class: 'score-note', text: note + ' — ' + describe(m) + '. Sum: ' + part.sum + '/' + (part.n * 9) + '.' })
  );
}

/* ---- the comparison ---- */

function compare() {
  const theirs = decodeSheet($('#partner-code').value);
  const msg = $('#compare-error');

  if (!theirs.ok) {
    msg.textContent = theirs.why === 'check'
      ? 'That code doesn’t look right — there may be a typo. Check it against what they sent you.'
      : 'That doesn’t look like a complete code. It should be 13 characters, like ABCD-EFGH-JKMNP.';
    msg.hidden = false;
    return;
  }
  if (theirs.role === state.role) {
    msg.textContent = state.role === 'F'
      ? 'You both answered about your partner. For a comparison, one of you needs to answer the “how I show up” version instead.'
      : 'You both answered about yourselves. For a comparison, one of you needs to answer the “how my partner is with me” version instead.';
    msg.hidden = false;
    return;
  }
  msg.hidden = true;

  const felt  = state.role === 'F' ? state.answers : theirs.answers;
  const given = state.role === 'G' ? state.answers : theirs.answers;
  renderComparison(felt, given);
  show('comparison');
}

function renderComparison(felt, given) {
  const sf = score(felt);
  const sg = score(given);

  $('#gap-summary').replaceChildren(
    gapRow('Overall', sf.total, sg.total),
    gapRow('Understanding', sf.understanding, sg.understanding),
    gapRow('Validation', sf.validation, sg.validation)
  );

  const overall = mean(sg.total) - mean(sf.total);
  $('#gap-read').textContent = readGap(overall);

  // Item detail stays collapsed until someone deliberately opens it.
  const rows = ITEMS
    .map(item => ({ item, f: felt[item.id], g: given[item.id], d: given[item.id] - felt[item.id] }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));

  $('#item-rows').replaceChildren(...rows.map(r => el('tr', {},
    el('td', { class: 'item-label', text: r.item.short }),
    el('td', { class: 'num', text: String(r.f) }),
    el('td', { class: 'num', text: String(r.g) }),
    el('td', { class: 'num gap ' + (r.d > 0 ? 'over' : r.d < 0 ? 'under' : 'even'),
               text: (r.d > 0 ? '+' : '') + r.d })
  )));

  $('#detail').open = false;
}

function gapRow(label, feltPart, givenPart) {
  const f = mean(feltPart);
  const g = mean(givenPart);
  const d = g - f;

  return el('div', { class: 'gap-row' },
    el('h4', { text: label }),
    el('div', { class: 'gap-bars' },
      barLine('Experienced', f, 'felt'),
      barLine('Intended', g, 'given')),
    el('p', { class: 'gap-delta ' + (Math.abs(d) < 0.5 ? 'close' : d > 0 ? 'over' : 'under'),
              text: Math.abs(d) < 0.5
                ? 'Closely matched (' + (d >= 0 ? '+' : '') + d.toFixed(1) + ')'
                : (d > 0 ? '+' : '') + d.toFixed(1) + ' point gap' })
  );
}

function barLine(label, m, cls) {
  return el('div', { class: 'bar-line' },
    el('span', { class: 'bar-label', text: label }),
    el('span', { class: 'bar-track' },
      el('span', { class: 'bar-fill ' + cls, style: 'width:' + ((m - 1) / 8 * 100) + '%' })),
    el('span', { class: 'bar-val', text: m.toFixed(1) }));
}

function readGap(d) {
  if (Math.abs(d) < 0.5) {
    return 'These two readings sit close together. What one of you is trying to give is landing about the way it was meant to — which is worth noticing, not just the gaps.';
  }
  if (d > 0) {
    return 'The giving side reads higher than the receiving side. That usually is not a story about effort; it is a story about effort not arriving in a form the other person recognises. The per-item view below is where that gets specific.';
  }
  return 'The receiving side reads higher than the giving side — more is landing than is being claimed. People often underrate what they are actually providing, and this is a good thing to say out loud.';
}

/* ------------------------------------------------------------------ wire */

function copyCode() {
  const done = () => {
    const b = $('#copy-btn');
    const was = b.textContent;
    b.textContent = 'Copied';
    setTimeout(() => { b.textContent = was; }, 1400);
  };
  // Clipboard API needs a secure context; fall back to a manual selection.
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(prettyCode(state.myCode)).then(done, selectCode);
  } else {
    selectCode();
  }
}

function selectCode() {
  const range = document.createRange();
  range.selectNodeContents($('#code-out'));
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function init() {
  $('#start-f').addEventListener('click', () => startQuiz('F'));
  $('#start-g').addEventListener('click', () => startQuiz('G'));

  $('#back').addEventListener('click', () => {
    if (state.index > 0) { state.index--; renderQuestion(); }
  });

  $('#copy-btn').addEventListener('click', copyCode);
  $('#compare-btn').addEventListener('click', compare);
  $('#restart').addEventListener('click', () => show('intro'));
  $('#back-to-result').addEventListener('click', () => show('result'));

  $('#partner-code').addEventListener('input', () => { $('#compare-error').hidden = true; });

  show('intro');
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}

/* Exported only so the test script can check the codec and scoring. */
if (typeof module !== 'undefined') {
  module.exports = { ITEMS, encodeSheet, decodeSheet, score, mean, describe, checkChar };
}
