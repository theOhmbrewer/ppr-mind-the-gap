/* Mind the Gap — core logic: the items, the scoring, and the share code.
 *
 * This file is deliberately pure. No DOM, no network, no storage — so it can
 * be tested with `node test.js`. The UI lives in ui.js and the storage and
 * API client in store.js.
 *
 * The instrument is the Perceived Partner Responsiveness Scale (PPRS),
 * Reis & Carmichael (2006), as profiled in Reis, Crasta, Rogge, Maniaci &
 * Carmichael (2018). 18 items, 9-point scale, scored by summation.
 *
 * Two roles, and the distinction is the whole point of the tool:
 *   F ("felt")  — you rate your PARTNER's responsiveness to you.
 *   G ("given") — you rate YOUR OWN responsiveness to your partner.
 * One of each, about the same person, gives the gap between what someone
 * intends and what the other actually experiences.
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
 * one check character.
 *
 * Codes still exist even now that sessions are stored: they are the fallback
 * when the API is unreachable, and they keep the tool usable with no server
 * at all. */

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

/* Answers move over the wire as a plain array in item order, which is what
 * the Worker validates and stores. */
function answersToList(answers) {
  return ITEMS.map(i => answers[i.id]);
}

function listToAnswers(list) {
  if (!Array.isArray(list) || list.length !== ITEMS.length) return null;
  const answers = {};
  for (let i = 0; i < ITEMS.length; i++) {
    const v = list[i];
    if (!Number.isInteger(v) || v < 1 || v > 9) return null;
    answers[ITEMS[i].id] = v;
  }
  return answers;
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

/* Exported for test.js; harmless in the browser. */
if (typeof module !== 'undefined') {
  module.exports = {
    ITEMS, ANCHORS, encodeSheet, decodeSheet, checkChar, prettyCode,
    answersToList, listToAnswers, score, mean, describe
  };
}
