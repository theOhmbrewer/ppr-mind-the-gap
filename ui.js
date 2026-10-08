/* Mind the Gap — screens and flow.
 *
 * Two ways to run:
 *
 *   Session mode  — you and your partner share a link. Sheets go to the
 *                   Worker, both directions are tracked, and the hub screen
 *                   shows what's still outstanding.
 *   Codes mode    — no server. You each get a 13-character code and paste
 *                   the other's in. Used when no API is configured or when
 *                   the network is having a bad day.
 *
 * Session mode degrades into codes mode by itself. Nothing here assumes the
 * server is reachable.
 */

const POLL_MS = 12000;

const state = {
  mode: 'codes',      // 'session' | 'codes'
  sid: null,
  view: null,         // last server view
  role: null,         // role being answered right now
  order: [],
  index: 0,
  answers: {},
  myCode: null,
  pollTimer: null,
  lastResult: null    // {role, answers} just completed
};

/* ------------------------------------------------------------- helpers */

const $ = sel => document.querySelector(sel);

function show(id) {
  document.querySelectorAll('.screen').forEach(s => { s.hidden = (s.id !== id); });
  window.scrollTo({ top: 0, behavior: 'instant' });
  const h = document.querySelector('#' + id + ' h2, #' + id + ' h1');
  if (h) h.focus();
  // Only poll while the hub is on screen.
  if (id === 'hub') startPolling(); else stopPolling();
}

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== false) node.setAttribute(k, v);
  }
  for (const kid of kids) if (kid) node.append(kid);
  return node;
}

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sessionLink(sid) {
  return location.origin + location.pathname + '#s=' + sid;
}

/* ---------------------------------------------------------------- boot */

async function boot() {
  const match = location.hash.match(/^#s=([0-9A-HJKMNP-TV-Z]{20})$/);

  if (match && apiConfigured()) {
    await enterSession(match[1]);
    return;
  }
  if (match && !apiConfigured()) {
    // Someone shared a link but the server isn't set up. Say so rather than
    // silently dropping them on the intro screen.
    $('#intro-api-note').hidden = false;
  }
  $('#start-session-wrap').hidden = !apiConfigured();
  show('intro');
}

async function enterSession(sid) {
  state.mode = 'session';
  state.sid = sid;
  renderHubLoading();
  show('hub');

  const res = await apiJoin(sid);
  if (!res.ok) {
    renderHubError(res);
    return;
  }
  state.view = res.data;
  renderHub();
}

async function startSession() {
  const sid = randomId(20);
  history.replaceState(null, '', '#s=' + sid);
  await enterSession(sid);
}

async function refreshSession() {
  if (state.mode !== 'session' || !state.sid) return;
  const res = await apiFetch(state.sid);

  // A refusal here is not a blip: this browser is no longer recognised as a
  // member (its saved id was cleared, or the session filled up without it).
  // Silently ignoring it leaves a hub that looks fine and quietly does
  // nothing, which is worse than saying so.
  if (!res.ok && !res.offline) {
    stopPolling();
    if (!$('#hub').hidden) renderHubError(res);
    return;
  }
  if (!res.ok) return;

  // Only redraw when something actually changed. Rebuilding the hub on every
  // poll throws away the scroll position and anything the reader had open,
  // which is maddening if you're halfway down the page.
  const before = signature(state.view);
  state.view = res.data;
  if (signature(state.view) !== before && !$('#hub').hidden) renderHub();
}

/* A cheap comparison of the parts of the view the hub actually draws.
 * Deliberately excludes expiresInDays, which ticks down on its own and would
 * otherwise force a redraw once a day for no reason. */
function signature(view) {
  if (!view) return '';
  const has = side => ['F', 'G'].map(r => (side && side[r] ? '1' : '0')).join('');
  return [view.partnerJoined ? 'j' : '-', has(view.you), has(view.them)].join('|');
}

function startPolling() {
  stopPolling();
  if (state.mode !== 'session') return;
  state.pollTimer = setInterval(refreshSession, POLL_MS);
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
}

/* ----------------------------------------------------------------- hub */

function renderHubLoading() {
  $('#hub-body').replaceChildren(el('p', { class: 'aside', text: 'Opening your session…' }));
}

function renderHubError(res) {
  const offline = res.offline;
  $('#hub-body').replaceChildren(
    el('div', { class: 'card' },
      el('h3', { text: offline ? 'Can’t reach the server' : 'That session isn’t available' }),
      el('p', { text: offline
        ? 'Your answers are safe on this device. You can keep going with share codes instead, and the session will pick up when the connection is back.'
        : res.error === 'session-full'
          ? 'This session already has two people in it. If you opened it on a different device or browser before, use that one — or start a fresh session.'
          : 'It may have expired — sessions are deleted automatically after 30 days.' }),
      el('div', { class: 'row' },
        el('button', { class: 'ghost', type: 'button', onclick: () => refreshSession().then(renderHub) }, document.createTextNode('Try again')),
        el('button', { class: 'primary', type: 'button', onclick: leaveToCodes }, document.createTextNode('Use codes instead')))
    )
  );
}

function leaveToCodes() {
  state.mode = 'codes';
  state.sid = null;
  history.replaceState(null, '', location.pathname);
  show('intro');
}

function renderHub() {
  const v = state.view;
  const body = $('#hub-body');

  // What each side still owes. `you` and `them` come straight from the server.
  const mine = v.you || { F: null, G: null };
  const theirs = v.them || { F: null, G: null };

  const tasks = el('div', { class: 'card' },
    el('h3', { text: 'Your two answer sheets' }),
    el('p', { class: 'aside', text: 'Each is 18 questions and about four minutes. You can do one now and the other later — this page remembers.' }),
    taskRow('How my partner is with me', 'You rate how understood and valued you feel.', Boolean(mine.F), 'F'),
    taskRow('How I show up for my partner', 'You rate how well you think you understand and value them.', Boolean(mine.G), 'G')
  );

  const partner = el('div', { class: 'card' },
    el('h3', { text: 'Your partner' }),
    !v.partnerJoined
      ? el('p', { text: 'They haven’t opened the link yet. Send it to them and this page will update on its own.' })
      : el('div', {},
          statusLine('Their sheet about you', Boolean(theirs.F)),
          statusLine('Their sheet about themselves', Boolean(theirs.G))),
    el('label', { class: 'sr-only', for: 'share-link' }, document.createTextNode('Session link')),
    el('div', { class: 'code-box' },
      el('input', { id: 'share-link', type: 'text', readonly: 'readonly', value: sessionLink(state.sid) }),
      el('button', { id: 'copy-link', class: 'ghost', type: 'button', onclick: copyLink }, document.createTextNode('Copy'))),
    el('p', { class: 'aside', text: 'Anyone with this link can see this session, so send it only to them. It deletes itself after 30 days — ' + v.expiresInDays + ' left.' })
  );

  // The two directions. Each needs one person's "felt" and the other's "given".
  const directions = el('div', {},
    el('h3', { class: 'section-head', text: 'The two comparisons' }),
    directionCard(
      'How they come across to you',
      'Their intent against your experience of it.',
      mine.F, theirs.G, 'them'),
    directionCard(
      'How you come across to them',
      'Your intent against their experience of it.',
      theirs.F, mine.G, 'you')
  );

  const extra = el('div', { class: 'card extra-card' },
    el('p', { class: 'eyebrow', text: 'Optional extra' }),
    el('h3', { text: 'Feeling desired' }),
    el('p', { text: 'Two quick questions you compare by swapping a short code, and a few to talk about. Not stored in the session.' }),
    el('button', { class: 'ghost open-desire', type: 'button' }, document.createTextNode('Open')));

  body.replaceChildren(tasks, partner, directions, extra);
}

function taskRow(title, note, done, role) {
  return el('div', { class: 'task' + (done ? ' done' : '') },
    el('div', { class: 'task-main' },
      el('h4', { text: title }),
      el('p', { class: 'task-note', text: note })),
    el('button', {
      class: done ? 'ghost' : 'primary',
      type: 'button',
      onclick: () => startQuiz(role)
    }, document.createTextNode(done ? 'Redo' : 'Answer'))
  );
}

function statusLine(label, done) {
  return el('p', { class: 'status' + (done ? ' done' : '') },
    el('span', { class: 'tick', text: done ? '●' : '○' }),
    document.createTextNode(' ' + label + (done ? ' — done' : ' — not yet')));
}

function directionCard(title, note, feltList, givenList, which) {
  const ready = Boolean(feltList && givenList);
  const felt = feltList && listToAnswers(feltList);
  const given = givenList && listToAnswers(givenList);

  return el('div', { class: 'card direction' + (ready ? ' ready' : '') },
    el('h4', { text: title }),
    el('p', { class: 'task-note', text: note }),
    ready
      ? el('button', { class: 'primary', type: 'button',
          onclick: () => openComparison(felt, given, which) },
          document.createTextNode('See the comparison'))
      : el('p', { class: 'waiting', text: missingText(feltList, givenList, which) })
  );
}

function missingText(feltList, givenList, which) {
  const needFelt = !feltList;
  const needGiven = !givenList;
  if (which === 'them') {
    if (needFelt && needGiven) return 'Waiting on your sheet about them, and theirs about themselves.';
    if (needFelt) return 'Waiting on your sheet about them.';
    return 'Waiting on their sheet about themselves.';
  }
  if (needFelt && needGiven) return 'Waiting on their sheet about you, and yours about yourself.';
  if (needFelt) return 'Waiting on their sheet about you.';
  return 'Waiting on your sheet about yourself.';
}

function copyLink() {
  const input = $('#share-link');
  input.select();
  const value = input.value;
  const flash = t => {
    const b = $('#copy-link');
    b.textContent = t;
    setTimeout(() => { b.textContent = 'Copy'; }, 1600);
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(value).then(() => flash('Copied'), () => flash('Press Ctrl+C'));
  } else {
    flash('Press Ctrl+C');
  }
}

/* ---------------------------------------------------------------- quiz */

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

  $('#progress-bar').style.width = (state.index / n * 100) + '%';
  $('#progress-text').textContent = 'Question ' + (state.index + 1) + ' of ' + n;
  $('#item-text').textContent = state.role === 'F' ? item.f : item.g;

  const scale = $('#scale');
  scale.replaceChildren();
  for (let v = 1; v <= 9; v++) {
    const anchor = ANCHORS.find(a => a.v === v);
    scale.append(el('button', {
      class: 'dot' + (state.answers[item.id] === v ? ' chosen' : ''),
      type: 'button',
      'aria-label': v + (anchor ? ' — ' + anchor.label : ''),
      onclick: () => answer(item.id, v)
    }, el('span', { class: 'dot-num', text: String(v) }),
       anchor ? el('span', { class: 'dot-label', text: anchor.label }) : null));
  }

  $('#back').disabled = state.index === 0;
}

function answer(itemId, value) {
  state.answers[itemId] = value;
  renderQuestion();
  setTimeout(() => {
    if (state.index < state.order.length - 1) {
      state.index++;
      renderQuestion();
    } else {
      finish();
    }
  }, 180);
}

async function finish() {
  const role = state.role;
  const answers = state.answers;
  state.lastResult = { role, answers };

  // Remember it on this device first — that must not depend on the network.
  saveLocalSheet(state.sid || 'local', role, answers);

  state.myCode = encodeSheet(role, answers);
  renderOwnResult();
  show('result');

  if (state.mode === 'session') {
    $('#sync-note').hidden = false;
    $('#sync-note').textContent = 'Saving to your session…';
    const res = await apiPutSheet(state.sid, role, answers);
    if (res.ok) {
      state.view = res.data;
      $('#sync-note').textContent = 'Saved. Your partner will see it when they open the link.';
      $('#sync-note').className = 'sync ok';
    } else {
      $('#sync-note').textContent = 'Couldn’t reach the server, so this is saved on this device only. Your code below still works.';
      $('#sync-note').className = 'sync warn-text';
    }
  }
}

function renderOwnResult() {
  const { role, answers } = state.lastResult;
  const s = score(answers);
  const isF = role === 'F';

  $('#result-title').textContent = isF
    ? 'How responsive your partner feels to you'
    : 'How responsive you believe you are';

  $('#result-lede').textContent = isF
    ? 'This is your experience of being understood and valued by your partner. It is a reading of how things land for you — not a measurement of what your partner intends.'
    : 'This is your own account of how you show up for your partner. Where it differs from their experience is the interesting part.';

  // The subscales mean different things depending on which side you answered.
  const notes = isF
    ? {
        total: 'All 18 items',
        understanding: 'Feeling accurately known — that your partner “gets things right” about you',
        validation: 'Feeling appreciated and valued for who you actually are'
      }
    : {
        total: 'All 18 items',
        understanding: 'How accurately you believe you read them — whether you “get things right” about who they are',
        validation: 'How much you believe you show them they’re appreciated and valued'
      };

  $('#own-scores').replaceChildren(
    scoreRow('Overall', s.total, notes.total),
    scoreRow('Understanding', s.understanding, notes.understanding),
    scoreRow('Validation', s.validation, notes.validation)
  );

  $('#code-out').textContent = prettyCode(state.myCode);

  // In session mode the codes are a fallback, so they stay out of the way.
  $('#share').hidden = false;
  $('#codes-detail').open = state.mode !== 'session';
  $('#compare-box').hidden = state.mode === 'session';
  $('#to-hub').hidden = state.mode !== 'session';
  $('#restart').hidden = state.mode === 'session';
  if (state.mode !== 'session') $('#sync-note').hidden = true;
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
    el('p', { class: 'score-note',
      text: note + ' — ' + describe(m) + '. Sum: ' + part.sum + '/' + (part.n * 9) + '.' })
  );
}

/* ---------------------------------------------------------- comparison */

function openComparison(felt, given, which) {
  renderComparison(felt, given, which);
  show('comparison');
}

function renderComparison(felt, given, which) {
  const sf = score(felt);
  const sg = score(given);

  $('#comparison-title').textContent = which === 'them'
    ? 'How they come across to you'
    : 'How you come across to them';

  $('#comparison-lede').textContent = which === 'them'
    ? 'Two readings of your partner’s responsiveness. Experienced is what lands with you. Intended is what they believe they’re giving.'
    : 'Two readings of your responsiveness. Experienced is what lands with them. Intended is what you believe you’re giving.';

  $('#gap-summary').replaceChildren(
    gapRow('Overall', sf.total, sg.total),
    gapRow('Understanding', sf.understanding, sg.understanding),
    gapRow('Validation', sf.validation, sg.validation)
  );

  $('#gap-read').textContent = readGap(mean(sg.total) - mean(sf.total), which);

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
  $('#back-to-hub').hidden = state.mode !== 'session';
  $('#back-to-result').hidden = state.mode === 'session';
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

function readGap(d, which) {
  const giver = which === 'them' ? 'They' : 'You';
  const receiver = which === 'them' ? 'you' : 'they';

  if (Math.abs(d) < 0.5) {
    return 'These two readings sit close together. What is being given is landing about the way it was meant to — which is worth noticing, not just the gaps.';
  }
  if (d > 0) {
    return giver + ' read higher on the giving side than ' + receiver + ' did on the receiving side. That usually is not a story about effort; it is a story about effort not arriving in a form the other person recognises. The per-item view below is where that gets specific.';
  }
  return 'More is landing than is being claimed — the receiving side reads higher than the giving side. People often underrate what they actually provide, and this is a good thing to say out loud.';
}

/* ----------------------------------------------- codes-mode comparison */

function compareByCode() {
  const theirs = decodeSheet($('#partner-code').value);
  const msg = $('#compare-error');

  if (!theirs.ok) {
    msg.textContent = theirs.why === 'check'
      ? 'That code doesn’t look right — there may be a typo. Check it against what they sent you.'
      : 'That doesn’t look like a complete code. It should be 13 characters, like ABCD-EFGH-JKMNP.';
    msg.hidden = false;
    return;
  }
  if (theirs.role === state.lastResult.role) {
    msg.textContent = state.lastResult.role === 'F'
      ? 'You both answered about your partner. For a comparison, one of you needs to answer the “how I show up” version instead.'
      : 'You both answered about yourselves. For a comparison, one of you needs to answer the “how my partner is with me” version instead.';
    msg.hidden = false;
    return;
  }
  msg.hidden = true;

  const felt = state.lastResult.role === 'F' ? state.lastResult.answers : theirs.answers;
  const given = state.lastResult.role === 'G' ? state.lastResult.answers : theirs.answers;
  openComparison(felt, given, state.lastResult.role === 'F' ? 'them' : 'you');
}

function copyCode() {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(prettyCode(state.myCode))
      .then(() => flashCopyBtn('Copied'), selectCode);
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
  flashCopyBtn('Press Ctrl+C', 2600);
}

function flashCopyBtn(text, ms = 1400) {
  const b = $('#copy-btn');
  if (b.dataset.label === undefined) b.dataset.label = b.textContent;
  b.textContent = text;
  clearTimeout(flashCopyBtn.timer);
  flashCopyBtn.timer = setTimeout(() => { b.textContent = b.dataset.label; }, ms);
}

/* ------------------------------------------------- feeling desired tab */

/* Kept apart from `state` on purpose: nothing here is saved, sent, or mixed
 * into the main sheets. */
const ds = { from: 'intro', role: null, answers: {}, code: null };

function openDesire() {
  const current = document.querySelector('.screen:not([hidden])');
  ds.from = current && current.id !== 'desire' ? current.id : 'intro';
  if (!ds.code) resetDesire();
  show('desire');
}

function resetDesire() {
  ds.role = null;
  ds.answers = {};
  ds.code = null;
  $('#ds-choose').hidden = false;
  $('#ds-items').hidden = true;
  $('#ds-result').hidden = true;
  $('#ds-comparison').hidden = true;
  $('#ds-error').hidden = true;
  $('#ds-partner-code').value = '';
}

function startDesire(role) {
  ds.role = role;
  ds.answers = {};
  $('#ds-choose').hidden = true;
  $('#ds-result').hidden = true;
  $('#ds-items').hidden = false;
  renderDesireItems();
  $('#ds-items h4').focus();
}

/* Both items on one page: two questions don't need a one-at-a-time flow,
 * and seeing both makes the pair read as one thing. */
function renderDesireItems() {
  const blocks = SPECIAL_ITEMS.map(item => {
    const scale = el('div', { class: 'scale five', role: 'group',
      'aria-label': 'Rate from 1, not at all, to 5, very much' });
    for (let v = 1; v <= 5; v++) {
      const anchor = SPECIAL_ANCHORS.find(a => a.v === v);
      scale.append(el('button', {
        class: 'dot' + (ds.answers[item.id] === v ? ' chosen' : ''),
        type: 'button',
        'aria-label': v + (anchor ? ' — ' + anchor.label : ''),
        'aria-pressed': ds.answers[item.id] === v ? 'true' : 'false',
        onclick: () => answerDesire(item.id, v)
      }, el('span', { class: 'dot-num', text: String(v) }),
         anchor ? el('span', { class: 'dot-label', text: anchor.label }) : null));
    }
    return el('div', { class: 'ds-item' },
      el('h4', { tabindex: '-1', text: ds.role === 'F' ? item.f : item.g }),
      scale);
  });
  $('#ds-items').replaceChildren(...blocks);
}

function answerDesire(itemId, v) {
  ds.answers[itemId] = v;
  renderDesireItems();
  if (SPECIAL_ITEMS.every(i => ds.answers[i.id])) setTimeout(finishDesire, 180);
}

function finishDesire() {
  ds.code = encodeSpecial(ds.role, ds.answers);
  const m = specialMean(ds.answers);
  const isF = ds.role === 'F';

  $('#ds-score').replaceChildren(el('div', { class: 'score-row' },
    el('div', { class: 'score-head' },
      el('h4', { text: isF ? 'How special your partner makes you feel' : 'How special you believe you make them feel' }),
      el('div', { class: 'score-num' },
        el('strong', { text: m.toFixed(1) }),
        el('span', { text: ' / 5' }))),
    el('div', { class: 'meter' },
      el('div', { class: 'meter-fill', style: 'width:' + ((m - 1) / 4 * 100) + '%' })),
    el('p', { class: 'score-note', text: 'Average of the two — ' + describeSpecial(m) + '.' })));

  $('#ds-code-out').textContent = ds.code;
  $('#ds-items').hidden = true;
  $('#ds-result').hidden = false;
  $('#ds-comparison').hidden = true;
  $('#ds-score h4').setAttribute('tabindex', '-1');
  $('#ds-score h4').focus();
}

function compareDesire() {
  const theirs = decodeSpecial($('#ds-partner-code').value);
  const msg = $('#ds-error');
  const fail = text => { msg.textContent = text; msg.hidden = false; };

  if (!theirs.ok) {
    return fail(theirs.why === 'main-code'
      ? 'That’s a code from the main sheets. This part has its own three-character code.'
      : theirs.why === 'check'
        ? 'That code doesn’t look right — there may be a typo.'
        : 'This part’s codes are three characters, like 4KX.');
  }
  if (theirs.role === ds.role) {
    return fail(ds.role === 'F'
      ? 'You both answered the receiving side. For a comparison, one of you needs the giving side.'
      : 'You both answered the giving side. For a comparison, one of you needs the receiving side.');
  }
  msg.hidden = true;

  const felt = ds.role === 'F' ? ds.answers : theirs.answers;
  const given = ds.role === 'G' ? ds.answers : theirs.answers;
  const which = ds.role === 'F' ? 'them' : 'you';

  const line = (label, f, g) => {
    const d = g - f;
    return el('div', { class: 'gap-row' },
      el('h4', { text: label }),
      el('div', { class: 'gap-bars' },
        fiveBar('Experienced', f, 'felt'),
        fiveBar('Intended', g, 'given')),
      el('p', { class: 'gap-delta ' + (Math.abs(d) < 0.5 ? 'close' : d > 0 ? 'over' : 'under'),
        text: Math.abs(d) < 0.5
          ? 'Closely matched'
          : (d > 0 ? '+' : '') + d.toFixed(1) + ' point gap' }));
  };

  const d = specialMean(given) - specialMean(felt);
  const read = Math.abs(d) < 0.5
    ? 'These sit close together. What’s being given is landing about the way it’s meant to.'
    : d > 0
      ? (which === 'them' ? 'They' : 'You') + ' believe more is being given than ' +
        (which === 'them' ? 'you feel' : 'they feel') +
        '. The questions below are a good place to find out what would land.'
      : 'More is landing than is being claimed. Worth saying out loud.';

  $('#ds-comparison').replaceChildren(
    el('h4', { class: 'section-head', text: which === 'them' ? 'How special they make you feel' : 'How special you make them feel' }),
    ...SPECIAL_ITEMS.map(i => line(i.short, felt[i.id], given[i.id])),
    el('p', { class: 'read', text: read }));
  $('#ds-comparison').hidden = false;
}

function fiveBar(label, v, cls) {
  return el('div', { class: 'bar-line' },
    el('span', { class: 'bar-label', text: label }),
    el('span', { class: 'bar-track' },
      el('span', { class: 'bar-fill ' + cls, style: 'width:' + ((v - 1) / 4 * 100) + '%' })),
    el('span', { class: 'bar-val', text: String(v) }));
}

function renderDesirePrompts() {
  $('#ds-prompts').replaceChildren(...DESIRE_PROMPTS.map(t =>
    el('div', { class: 'prompt-group' },
      el('h4', { text: t.theme }),
      el('ul', {}, ...t.prompts.map(p => el('li', { text: p }))))));
}

function copyDesireCode() {
  const b = $('#ds-copy');
  const flash = t => { b.textContent = t; setTimeout(() => { b.textContent = 'Copy'; }, 1600); };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(ds.code).then(() => flash('Copied'), () => flash('Select and copy'));
  } else {
    flash('Select and copy');
  }
}

/* ---------------------------------------------------------------- wire */

function init() {
  $('#start-f').addEventListener('click', () => { state.mode = 'codes'; startQuiz('F'); });
  $('#start-g').addEventListener('click', () => { state.mode = 'codes'; startQuiz('G'); });
  $('#start-session').addEventListener('click', startSession);

  $('#back').addEventListener('click', () => {
    if (state.index > 0) { state.index--; renderQuestion(); }
  });

  $('#copy-btn').addEventListener('click', copyCode);
  $('#compare-btn').addEventListener('click', compareByCode);
  $('#restart').addEventListener('click', () => { location.hash = ''; location.reload(); });
  $('#to-hub').addEventListener('click', () => { renderHub(); show('hub'); });
  $('#back-to-hub').addEventListener('click', () => { renderHub(); show('hub'); });
  $('#back-to-result').addEventListener('click', () => show('result'));
  $('#partner-code').addEventListener('input', () => { $('#compare-error').hidden = true; });

  document.addEventListener('click', e => {
    if (e.target.closest('.open-desire')) openDesire();
  });
  $('#ds-start-f').addEventListener('click', () => startDesire('F'));
  $('#ds-start-g').addEventListener('click', () => startDesire('G'));
  $('#ds-copy').addEventListener('click', copyDesireCode);
  $('#ds-compare').addEventListener('click', compareDesire);
  $('#ds-partner-code').addEventListener('input', () => { $('#ds-error').hidden = true; });
  $('#ds-redo').addEventListener('click', () => { resetDesire(); $('#ds-start-f').focus(); });
  $('#ds-back').addEventListener('click', () => {
    if (ds.from === 'hub') renderHub();
    show(ds.from);
  });
  renderDesirePrompts();

  $('#forget').addEventListener('click', () => {
    if (!confirm('Forget every answer this browser has saved? This cannot be undone.')) return;
    forgetEverything();
    location.hash = '';
    location.reload();
  });

  // Pick up a partner's submission as soon as the tab is looked at again.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !$('#hub').hidden) refreshSession();
  });

  // Changing only the fragment does NOT reload the page, so opening a session
  // link while already here — or pressing Back — would otherwise leave the app
  // sitting on the previous session with the URL saying something else.
  window.addEventListener('hashchange', () => {
    stopPolling();
    state.view = null;
    state.sid = null;
    state.mode = 'codes';
    boot();
  });

  if (!storageWorks()) $('#storage-note').hidden = false;

  boot();
}

document.addEventListener('DOMContentLoaded', init);
