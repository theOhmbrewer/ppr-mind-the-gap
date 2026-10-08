# Mind the Gap

A two-sided reflection tool built on the **Perceived Partner Responsiveness Scale
(PPRS)**.

One partner answers about the other ("how understood and valued I feel"). The other
answers about themselves ("how well I think I do those things"). Both are describing
the *same person's* responsiveness — from the inside and the outside. The tool shows
the distance between the two.

That distance is the point. A large gap usually isn't a story about effort; it's a
story about effort not arriving in a form the other person recognises.

## The two ways to use it

**Sessions.** One of you starts a session and sends the other a link. You each answer
two sheets — one about your partner, one about yourself — whenever suits. Both
comparisons unlock as their halves arrive. This needs the API (below).

**Codes.** No server at all. You each answer one sheet and get a 13-character code
like `56MJ-EZA7-PE2PV` to swap. The comparison is computed in the browser.

Codes always work. If the API isn't configured or can't be reached, the app falls
back to them on its own — the server is an upgrade, never a dependency.

## Running it locally

The page is static, so for the code-based flow you can just open `index.html`.

For the session flow you need the API running too:

```bash
cd api && npx wrangler dev --port 8787
```

Then serve the page from `localhost` (any static server) and it will talk to that
local Worker automatically — `store.js` switches to `127.0.0.1:8787` whenever the
hostname is localhost, so testing never touches deployed data.

Tests:

```bash
node test.js
```

```bash
cd api && node test-api.js
```

`test.js` covers the items, the scoring and the share code. `test-api.js` exercises
the Worker — joining, storing sheets, validation, access control and CORS. Point it
at a URL to test the deployed one: `node test-api.js https://your-worker.workers.dev`.

## Files

| File | What it is |
|---|---|
| `index.html` | All six screens: intro, session hub, quiz, your result, comparison, feeling desired |
| `style.css` | Everything visual. Light and dark follow the device setting |
| `app.js` | Items, scoring, share code. Pure logic, no DOM — this is what `test.js` tests |
| `desire.js` | The optional Feeling desired tab: its two items, prompts and 3-character code. Also pure |
| `store.js` | Browser storage and the API client. **The one line you edit after deploying** |
| `ui.js` | Screens, flow, session hub |
| `test.js` | Checks on the code and the scoring |
| `api/src/index.js` | The Worker. Three routes, about 150 lines |
| `api/wrangler.jsonc` | Worker config. Needs your KV namespace id pasted in |
| `api/test-api.js` | Checks on the API |

## Deploying

### The page (GitHub Pages)

Already done. Commit in GitHub Desktop, press **Push origin**, and the live site
updates a minute or so later.

### The API (Cloudflare Workers)

You need a free Cloudflare account. Then, from inside `api/`:

```bash
npx wrangler login
```

```bash
npx wrangler kv namespace create SESSIONS
```

That prints an id. Paste it into `api/wrangler.jsonc`, replacing
`PASTE_KV_NAMESPACE_ID_HERE`. Then:

```bash
npx wrangler deploy
```

It prints your Worker's URL. Paste that into `store.js` as `API_PRODUCTION`, commit,
and push. Sessions are live.

If you ever change where the page is hosted, update `ALLOWED_ORIGIN` in
`api/wrangler.jsonc` and redeploy — the Worker only accepts calls from listed
origins.

## What gets stored, and where

**In your browser.** Your participant id and your own answer sheets, so the page
remembers you. Cleared with the "Forget everything" button on the first screen.

**On the server, only if you start a session.** A random session id, up to two
anonymous participant ids, and up to four sheets of eighteen numbers. No name, no
email, no account, no analytics, no logging of answers.

Sessions carry a 30-day expiry set on the KV write itself, so they delete themselves.
There is no cleanup job to forget to run, and every write resets the clock — an
active session stays, an abandoned one goes.

**Anyone holding a session link can read that session.** There are no accounts, so
the link is the key. Session ids are 20 characters of Crockford base32 (about 100
bits), so they can't be guessed, but they can be forwarded. Send them accordingly.

Using codes instead sends nothing anywhere at all.

## The optional "Feeling desired" tab

Reachable from the first screen, your result, and the session hub. Separate
from the main sheets and doesn't change them. Gender-neutral by design.

**Part one, scored.** The two "feeling special" items from Birnbaum, Reis et
al. (2016, Study 3; α = .83), on that study's 1–5 scale and averaged as it
averaged them. One partner answers the receiving side, the other the giving
side, and they swap a 3-character code to compare. The giving-side wording
is this tool's mirror of the published items and has never been tested.
These two items are not a full validated scale, and the page says so.

**Part two, unscored.** Conversation prompts built from the themes in Murray,
Milhausen & Sutherland (2014) and Murray & Brotto (2021): saying it, touch,
starting things (asked as both *how often* and *how it lands*, because that's
where the two papers differ), and saying what you want.

Nothing in this tab is saved or sent anywhere; it doesn't touch the session
API. Folding the pair into sessions would mean a new sheet type in the Worker.

## The share code

Your 18 answers in base 9, written in
[Crockford base32](https://www.crockford.com/base32.html) — an alphabet with no
`I`, `L`, `O` or `U`, so there's nothing to misread when you text it. The last
character is a checksum with odd position weights, which catches **every**
single-character typo and about 96% of adjacent transpositions. A mistyped code is
rejected rather than silently decoding to the wrong answers.

Lowercase, missing dashes and stray spaces are all accepted.

## About the instrument

The 18 items are the PPRS, reproduced from the published profile. Two general items,
eight **Understanding** items (feeling accurately known) and eight **Validation**
items (feeling appreciated for who you actually are). Rated 1–9, scored by
summation, as the authors specify.

Two details from the profile that the code deliberately honours:

- **Items are randomised** on every run, and subscale labels are never shown while
  someone is answering. The profile instructs both.
- **No norms are displayed.** The published sources report reliability (α .91–.98)
  and convergent validity, but no population means, percentiles or cutoffs. So the
  tool describes where a score sits on the response scale and nothing more. Any
  version of this scale that tells you your percentile invented it.

The scale also has a validated 12-item short form; those items are flagged with
`in12: true` in `app.js` if you ever want to offer a quicker version.

### A note on permission

The profile states the scale is "freely available to researchers with appropriate
citation," and the scale page is marked "reproduced with permission of Harry Reis" in
a 2018 Wiley volume. A personal reflection tool isn't obviously "research," so if
this ever goes properly public, it's worth an email to Harry Reis at the University
of Rochester to confirm. Citations are on the first screen either way.

## Citations

Reis, H. T., & Carmichael, C. L. (2006). *Perceived Partner Responsiveness Scale*.
Profiled in Reis, H. T., Crasta, D., Rogge, R. D., Maniaci, M. R., & Carmichael, C. L.
(2018), in D. L. Worthington & G. D. Bodie (Eds.), *The Sourcebook of Listening
Research: Methodology and Measures* (pp. 516–521). Wiley.

Reis, H. T., Clark, M. S., & Holmes, J. G. (2004). Perceived partner responsiveness as
an organizing construct in the study of intimacy and closeness. In D. J. Mashek & A.
Aron (Eds.), *Handbook of Closeness and Intimacy* (pp. 201–225). Lawrence Erlbaum.

Birnbaum, G. E., Reis, H. T., Mizrahi, M., Kanat-Maymon, Y., Sass, O., &
Granovski-Milner, C. (2016). Intimately connected: The importance of partner
responsiveness for experiencing sexual desire. *Journal of Personality and Social
Psychology, 111*(4), 530–546. https://doi.org/10.1037/pspi0000069

Murray, S. H., & Brotto, L. (2021). I want you to want me: A qualitative analysis
of heterosexual men's desire to feel desired in intimate relationships. *Journal
of Sex & Marital Therapy, 47*(5), 419–434. https://doi.org/10.1080/0092623X.2021.1888830

Murray, S. H., Milhausen, R. R., & Sutherland, O. (2014). A qualitative comparison
of young women's maintained versus decreased sexual desire in longer-term
relationships. *Women & Therapy, 37*(3–4), 319–341.
https://doi.org/10.1080/02703149.2014.897559

Rice, T. M., Kumashiro, M., & Arriaga, X. B. (2020). Mind the gap: Perceived partner
responsiveness as a bridge between general and partner-specific attachment security.
*International Journal of Environmental Research and Public Health, 17*(19), 7178.

## What this is not

Not a diagnostic instrument, not therapy, and not a verdict on a relationship. It
measures a *perception*, and perceptions are shaped by mood, history and general
attachment security as much as by the other person's behaviour.
