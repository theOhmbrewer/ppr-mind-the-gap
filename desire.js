/* Mind the Gap — the optional "Feeling desired" tab: items, prompts, code.
 *
 * Pure, like app.js: no DOM, no network, no storage, so test.js can load it.
 *
 * Two parts, and they are held to different standards on purpose:
 *
 *   1. Scored — the two "feeling special" items from Birnbaum, Reis et al.
 *      (2016), Study 3 (alpha = .83), on that study's 1-5 scale. These are
 *      the only items here with a published reliability, so they are the
 *      only ones that get a number. The receiving wording is theirs; the
 *      giving wording is our mirror of it and has never been tested.
 *
 *   2. Unscored — conversation prompts drawn from the themes in Murray,
 *      Milhausen & Sutherland (2014) and Murray & Brotto (2021). Those are
 *      qualitative studies, not scales, so nothing here is rated or summed.
 *
 * Gender-neutral throughout. The studies behind it are of heterosexual
 * couples; the page says so rather than pretending otherwise.
 *
 * Nothing in this tab touches the session API or the main 13-character
 * code. It has its own 3-character code instead.
 */

/* ---------------------------------------------------------------- items */

/* The original items are worded as daily diary questions. Here they are
 * answered about "lately", which the page states. */
const SPECIAL_ITEMS = [
  { id: 1,
    f: 'My partner has made me feel special.',
    g: 'I have made my partner feel special.',
    short: 'Feeling special' },
  { id: 2,
    f: 'My partner has made me feel that our relationship is special and unique.',
    g: 'I have made my partner feel that our relationship is special and unique.',
    short: 'Relationship feels special and unique' }
];

/* Birnbaum et al. label only the ends: 1 = not at all, 5 = very much. */
const SPECIAL_ANCHORS = [
  { v: 1, label: 'Not at all' },
  { v: 5, label: 'Very much' }
];

/* ------------------------------------------------------------- prompts */

/* Each theme is something both Murray papers found mattered to feeling
 * desired, worded so either partner can answer it about either side.
 * Initiation is split in two because that is where the papers diverge:
 * the men mostly wanted their partner to start things more OFTEN, the women
 * mostly wanted the way things were started to land BETTER. */
const DESIRE_PROMPTS = [
  { theme: 'Saying it',
    prompts: [
      'What has your partner said — out loud, by text, in passing — that made you feel wanted?',
      'Is there something you wish they said more, or said differently?'
    ] },
  { theme: 'Touch',
    prompts: [
      'Which touch makes you feel wanted when it isn’t leading anywhere — a hand on the arm, leaning in, a kiss on the way past?',
      'Does that kind of touch ever get read as an invitation when it isn’t meant as one? Either direction.'
    ] },
  { theme: 'Starting things — how often',
    prompts: [
      'Who usually starts things between you? Is that how you’d both like it?',
      'What would it feel like if the other person started more often?'
    ] },
  { theme: 'Starting things — how it lands',
    prompts: [
      'When an approach works for you, what does it look like? When it doesn’t, what’s off — too hesitant, too direct, the wrong moment?',
      'Is there an approach you’d warm up to even if it didn’t land straight away?'
    ] },
  { theme: 'Saying what you want',
    prompts: [
      'Is there something you like that you’ve never quite said?',
      'What makes it easier — or harder — to tell each other what you want?'
    ] }
];

/* ------------------------------------------------------------- the code */

/* Two answers of 1-5 plus a role flag is 50 possibilities, which fits in two
 * Crockford base32 characters. One check character on top, with odd weights
 * for the same reason as the main code: every single-character typo changes
 * it. Three characters can't be mistaken for a 13-character main code. */

const SPECIAL_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function specialCheck(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += SPECIAL_ALPHABET.indexOf(data[i]) * (2 * i + 1);
  return SPECIAL_ALPHABET[sum % 32];
}

function encodeSpecial(role, answers) {
  let n = 0;
  for (const item of SPECIAL_ITEMS) {
    const a = answers[item.id];
    if (!(Number.isInteger(a) && a >= 1 && a <= 5)) throw new Error('answer out of range for item ' + item.id);
    n = n * 5 + (a - 1);
  }
  n = n * 2 + (role === 'G' ? 1 : 0);
  const data = SPECIAL_ALPHABET[Math.floor(n / 32)] + SPECIAL_ALPHABET[n % 32];
  return data + specialCheck(data);
}

function decodeSpecial(raw) {
  const cleaned = String(raw || '')
    .toUpperCase()
    .replace(/[ILO]/g, c => (c === 'O' ? '0' : '1'))
    .replace(/[^0-9A-Z]/g, '');

  if (cleaned.length === 13) return { ok: false, why: 'main-code' };
  if (cleaned.length !== 3) return { ok: false, why: 'length' };
  if ([...cleaned].some(c => SPECIAL_ALPHABET.indexOf(c) === -1)) return { ok: false, why: 'chars' };

  const data = cleaned.slice(0, 2);
  if (cleaned[2] !== specialCheck(data)) return { ok: false, why: 'check' };

  let n = SPECIAL_ALPHABET.indexOf(data[0]) * 32 + SPECIAL_ALPHABET.indexOf(data[1]);
  if (n >= 50) return { ok: false, why: 'check' };

  const role = n % 2 === 1 ? 'G' : 'F';
  n = Math.floor(n / 2);

  const answers = {};
  for (let i = SPECIAL_ITEMS.length - 1; i >= 0; i--) {
    answers[SPECIAL_ITEMS[i].id] = (n % 5) + 1;
    n = Math.floor(n / 5);
  }
  return { ok: true, role, answers };
}

/* -------------------------------------------------------------- scoring */

/* Birnbaum et al. averaged the two items. Same here, on the same 1-5 scale. */
function specialMean(answers) {
  return SPECIAL_ITEMS.reduce((t, i) => t + answers[i.id], 0) / SPECIAL_ITEMS.length;
}

/* Like describe() in app.js: where the number sits on the scale just used,
 * and nothing more. There are no norms for this pair either. */
function describeSpecial(m) {
  if (m >= 4.5) return 'close to “very much”';
  if (m >= 3.5) return 'toward “very much”';
  if (m >= 2.5) return 'around the middle of the scale';
  if (m >= 1.5) return 'toward “not at all”';
  return 'close to “not at all”';
}

if (typeof module !== 'undefined') {
  module.exports = {
    SPECIAL_ITEMS, SPECIAL_ANCHORS, DESIRE_PROMPTS,
    encodeSpecial, decodeSpecial, specialMean, describeSpecial
  };
}
