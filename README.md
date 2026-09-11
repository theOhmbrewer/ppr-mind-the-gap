# Mind the Gap

A two-sided reflection tool built on the **Perceived Partner Responsiveness Scale
(PPRS)**.

One partner answers about the other ("how understood and valued I feel"). The other
answers about themselves ("how well I think I do those things"). Both are describing
the *same person's* responsiveness — from the inside and the outside. The tool shows
the distance between the two.

That distance is the point. A large gap usually isn't a story about effort; it's a
story about effort not arriving in a form the other person recognises.

## Running it

It's a static page — no build step, no dependencies, no server required.

Open `index.html` in a browser. That's it.

To run the tests for the share-code logic and the scoring:

```bash
node test.js
```

## How the sharing works

There's no backend and nothing is stored anywhere. When you finish, your 18 answers
are packed into a 13-character code like `56MJ-EZA7-PE2PV`, which you send to your
partner. They paste it in and the comparison is computed in their browser.

The code is your answers in base 9, written in
[Crockford base32](https://www.crockford.com/base32.html) — an alphabet with no
`I`, `L`, `O` or `U`, so there's nothing to misread when you text it. The last
character is a checksum. It catches **every** single-character typo and about 96% of
adjacent transpositions, so a mistyped code gets rejected rather than silently
decoding to the wrong answers.

Lowercase, missing dashes and stray spaces are all accepted.

## Files

| File | What it is |
|---|---|
| `index.html` | All four screens: intro, quiz, your result, the comparison |
| `style.css` | Everything visual. Light and dark themes follow the device setting |
| `app.js` | Items, scoring, the share code, and the screen logic |
| `test.js` | Checks on the code and the scoring. Run with `node test.js` |

## Deploying it

Any static host works, since there's nothing to build. GitHub Pages is free:

1. Create an empty repository on GitHub (don't add a README — this folder has one).
2. Connect this folder to it and push.
3. In the repo's **Settings → Pages**, set the source to your `main` branch, root folder.
4. A minute or so later it's live at `https://<your-username>.github.io/<repo-name>/`.

That URL is what you send your partner. They don't need an account for anything.

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

Rice, T. M., Kumashiro, M., & Arriaga, X. B. (2020). Mind the gap: Perceived partner
responsiveness as a bridge between general and partner-specific attachment security.
*International Journal of Environmental Research and Public Health, 17*(19), 7178.

## What this is not

Not a diagnostic instrument, not therapy, and not a verdict on a relationship. It
measures a *perception*, and perceptions are shaped by mood, history and general
attachment security as much as by the other person's behaviour.
