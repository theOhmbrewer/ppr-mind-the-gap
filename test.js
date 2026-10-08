/* Round-trip and sanity checks for the share code. Run: node test.js */

const {
  ITEMS, encodeSheet, decodeSheet, score, mean, answersToList, listToAnswers
} = require('./app.js');

let failures = 0;
function check(name, cond, detail) {
  if (!cond) { failures++; console.log('FAIL  ' + name + (detail ? '  — ' + detail : '')); }
  else console.log('ok    ' + name);
}

check('18 items', ITEMS.length === 18, ITEMS.length + ' items');
check('unique ids', new Set(ITEMS.map(i => i.id)).size === 18);
check('8 understanding', ITEMS.filter(i => i.sub === 'understanding').length === 8);
check('8 validation', ITEMS.filter(i => i.sub === 'validation').length === 8);
check('2 general', ITEMS.filter(i => i.sub === 'general').length === 2);
check('12-item subset is 12', ITEMS.filter(i => i.in12).length === 12,
      ITEMS.filter(i => i.in12).length + ' flagged');

// Exhaustive round-trip over random sheets, both roles.
let roundTripFails = 0, lengths = new Set();
for (let trial = 0; trial < 20000; trial++) {
  const answers = {};
  for (const item of ITEMS) answers[item.id] = 1 + Math.floor(Math.random() * 9);
  const role = Math.random() < 0.5 ? 'F' : 'G';

  const code = encodeSheet(role, answers);
  lengths.add(code.length);
  const back = decodeSheet(code);

  if (!back.ok || back.role !== role) { roundTripFails++; continue; }
  for (const item of ITEMS) {
    if (back.answers[item.id] !== answers[item.id]) { roundTripFails++; break; }
  }
}
check('20000 random round-trips', roundTripFails === 0, roundTripFails + ' failed');
check('code length always 13', lengths.size === 1 && lengths.has(13), [...lengths].join(','));

// Extremes.
for (const v of [1, 9]) {
  const answers = {};
  for (const item of ITEMS) answers[item.id] = v;
  for (const role of ['F', 'G']) {
    const back = decodeSheet(encodeSheet(role, answers));
    check('all-' + v + ' ' + role + ' round-trips',
          back.ok && back.role === role && ITEMS.every(i => back.answers[i.id] === v));
  }
}

// Formatting tolerance: dashes, spaces, lowercase, and the ambiguous letters.
const sample = {};
ITEMS.forEach((it, i) => { sample[it.id] = (i % 9) + 1; });
const code = encodeSheet('F', sample);
const pretty = code.slice(0, 4) + '-' + code.slice(4, 8) + '-' + code.slice(8);
check('accepts dashes', decodeSheet(pretty).ok);
check('accepts lowercase', decodeSheet(pretty.toLowerCase()).ok);
check('accepts spaces', decodeSheet(code.split('').join(' ')).ok);

// Corruption must be caught, not silently mis-decoded.
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let caught = 0, missed = 0, total = 0;
for (let trial = 0; trial < 4000; trial++) {
  const answers = {};
  for (const item of ITEMS) answers[item.id] = 1 + Math.floor(Math.random() * 9);
  const good = encodeSheet('F', answers);
  const pos = Math.floor(Math.random() * good.length);
  let ch = ALPHA[Math.floor(Math.random() * 32)];
  if (ch === good[pos]) continue;
  total++;
  const bad = good.slice(0, pos) + ch + good.slice(pos + 1);
  const res = decodeSheet(bad);
  if (!res.ok) caught++;
  else if (ITEMS.some(i => res.answers[i.id] !== answers[i.id])) missed++;
  else caught++; // decoded to the same sheet, harmless
}
check('single-character typos caught', missed === 0,
      missed + ' of ' + total + ' slipped through (' + caught + ' caught)');

// Adjacent transpositions — the other typo people actually make.
let tMissed = 0, tTotal = 0;
for (let trial = 0; trial < 4000; trial++) {
  const answers = {};
  for (const item of ITEMS) answers[item.id] = 1 + Math.floor(Math.random() * 9);
  const good = encodeSheet('G', answers);
  const pos = Math.floor(Math.random() * (good.length - 1));
  if (good[pos] === good[pos + 1]) continue;
  tTotal++;
  const bad = good.slice(0, pos) + good[pos + 1] + good[pos] + good.slice(pos + 2);
  const res = decodeSheet(bad);
  if (res.ok && ITEMS.some(i => res.answers[i.id] !== answers[i.id])) tMissed++;
}
console.log('note  adjacent transpositions: ' + tMissed + ' of ' + tTotal +
            ' slipped through (' + (100 - tMissed / tTotal * 100).toFixed(1) + '% caught)');

// Rejections.
check('rejects empty', !decodeSheet('').ok);
check('rejects short', !decodeSheet('ABC').ok);
check('rejects long', !decodeSheet('ABCDEFGHJKMNPQRST').ok);
check('rejects junk', !decodeSheet('!!!!-!!!!-!!!!!').ok);

// Scoring.
const allSeven = {};
ITEMS.forEach(i => { allSeven[i.id] = 7; });
const s = score(allSeven);
check('total sums to 126', s.total.sum === 126, String(s.total.sum));
check('total mean is 7', mean(s.total) === 7);
check('understanding sums to 56', s.understanding.sum === 56, String(s.understanding.sum));
check('validation sums to 56', s.validation.sum === 56, String(s.validation.sum));
check('general sums to 14', s.general.sum === 14, String(s.general.sum));

const mixed = {};
ITEMS.forEach(i => { mixed[i.id] = i.sub === 'validation' ? 9 : 2; });
const m = score(mixed);
check('subscales separate correctly',
      m.validation.sum === 72 && m.understanding.sum === 16 && m.general.sum === 4,
      'v=' + m.validation.sum + ' u=' + m.understanding.sum + ' g=' + m.general.sum);

// The wire format the Worker stores and validates.
const wire = {};
ITEMS.forEach((it, i) => { wire[it.id] = (i % 9) + 1; });
const list = answersToList(wire);
check('answersToList gives 18 in item order', list.length === 18 && list[0] === 1 && list[8] === 9);
check('listToAnswers round-trips', ITEMS.every(i => listToAnswers(list)[i.id] === wire[i.id]));
check('listToAnswers rejects wrong length', listToAnswers([1, 2, 3]) === null);
check('listToAnswers rejects out-of-range', listToAnswers(list.map((v, i) => (i === 0 ? 10 : v))) === null);
check('listToAnswers rejects non-integers', listToAnswers(list.map((v, i) => (i === 0 ? 4.5 : v))) === null);
check('listToAnswers rejects non-arrays', listToAnswers('nope') === null);

// The id shape the Worker's regex accepts must match what the client mints.
const ID_RE = /^[0-9A-HJKMNP-TV-Z]{20}$/;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let badIds = 0;
for (let t = 0; t < 5000; t++) {
  let id = '';
  for (let i = 0; i < 20; i++) id += CROCKFORD[Math.floor(Math.random() * 32)];
  if (!ID_RE.test(id)) badIds++;
}
check('worker id pattern accepts every client-minted id', badIds === 0, badIds + ' rejected');
check('worker id pattern rejects I/L/O/U', !ID_RE.test('IIIIIIIIIIIIIIIIIIII') && !ID_RE.test('UUUUUUUUUUUUUUUUUUUU'));
check('worker id pattern rejects wrong length', !ID_RE.test('ABCD'));

// ------------------------------------------------ feeling desired tab
const {
  SPECIAL_ITEMS, DESIRE_PROMPTS, encodeSpecial, decodeSpecial, specialMean
} = require('./desire.js');

check('2 feeling-special items', SPECIAL_ITEMS.length === 2);
check('every prompt theme has prompts', DESIRE_PROMPTS.every(t => t.prompts.length > 0));

// Only 50 possible sheets, so check every one rather than sampling.
let dsFails = 0, dsSeen = new Set();
for (const role of ['F', 'G']) {
  for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) {
    const code = encodeSpecial(role, { 1: a, 2: b });
    dsSeen.add(code);
    const back = decodeSpecial(code);
    if (code.length !== 3 || !back.ok || back.role !== role ||
        back.answers[1] !== a || back.answers[2] !== b) dsFails++;
  }
}
check('all 50 special sheets round-trip', dsFails === 0, dsFails + ' failed');
check('all 50 special codes distinct', dsSeen.size === 50, String(dsSeen.size));

// Every single-character change to every valid code must be rejected or
// decode to the same sheet.
let dsMissed = 0;
for (const code of dsSeen) {
  const orig = decodeSpecial(code);
  for (let pos = 0; pos < 3; pos++) for (const ch of ALPHA) {
    if (ch === code[pos]) continue;
    const res = decodeSpecial(code.slice(0, pos) + ch + code.slice(pos + 1));
    if (res.ok && (res.role !== orig.role || res.answers[1] !== orig.answers[1] ||
        res.answers[2] !== orig.answers[2])) dsMissed++;
  }
}
check('special-code typos all caught', dsMissed === 0, dsMissed + ' slipped through');

check('special code tolerates lowercase and spaces',
      decodeSpecial(' ' + encodeSpecial('G', { 1: 4, 2: 2 }).toLowerCase() + ' ').ok);
check('special decoder flags a main code', decodeSpecial(pretty).why === 'main-code');
check('special decoder rejects junk', !decodeSpecial('').ok && !decodeSpecial('ZZZZ').ok);
check('special encoder rejects out-of-range', (() => {
  try { encodeSpecial('F', { 1: 6, 2: 1 }); return false; } catch (e) { return true; }
})());
check('special mean averages the pair', specialMean({ 1: 2, 2: 5 }) === 3.5);

console.log('');
console.log(failures === 0 ? 'All checks passed.' : failures + ' check(s) FAILED.');
console.log('Example code: ' + pretty);
process.exit(failures === 0 ? 0 : 1);
