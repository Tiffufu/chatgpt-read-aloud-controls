# Validation summary

## Unreleased queue preservation

Recorded November 13, 2026:

- Full Node suite: **173/173 passed**, including unloading/remounting, empty
  shells, unavailable-head timeout/Retry, Undo, revision invalidation, and a
  settings/navigation race. Five initial new controller cases failed before the
  retention repair; the two added navigation-race cases also failed before their fix.
- Production and modified fixture JavaScript syntax, manifest assets, and
  whitespace checks passed.
- `tests/fixtures/auto-read-runtime.html`: **41/41 passed** in Chrome. An old-code
  control run with the first 40 cases passed **37/40** and failed the three new
  unloading, timeout/recovery, and off-screen Undo cases.
- `tests/fixtures/auto-read-journey.html`: **6/6 passed** in Chrome after each
  scenario was extended to unload a queued assistant message and remount its
  wrapper before real silent-WAV progression. These checks use invented sample
  content and accelerated completion, not uninterrupted long-form listening.
- Independent review found no remaining important issues after the
  settings/navigation-race correction.

The repaired runtime has not yet been reloaded and trialled on live ChatGPT or
installed from a packaged ZIP. Missing/deleted messages are indistinguishable
without a mounted revision: an unavailable queue head stays recoverable, and a
truly deleted selection must be removed manually. The first-project-message URL
alias defect is tracked separately and is not repaired by this change.

## v0.4.0 release verification

Recorded November 2, 2026 after repairing first-message admission when a project chat URL arrives before or with its user message, in addition to seek-completion gating, durable generation acknowledgement, and playback completion:

- Full Node suite: **163/163 passed**. The two new admission regressions failed before the repair; all three user/URL orderings now start once, including an earlier generation control without a user message. Mismatched prompts, other projects, expired submissions, and cancelled submissions remain silent. Existing user-before-URL acknowledgement remains available when prompt text markup is unrecognized.
- Production JavaScript syntax, manifest asset validation, and whitespace checks passed.
- `tests/fixtures/media-startup.html`: **6/6 passed** in Chrome, including a play request that resolves 21 simulated seconds later, completion of the six-second rewind before Play at both 1× and 2×, and verification that audio unready at recording start remains untouched until a new recording starts.
- `tests/fixtures/auto-read-runtime.html`: **36/36 passed** in Chrome, including first-answer admission with all three user/URL orderings and an earlier generation control, rejection of unrelated project history after Send, and cancellation on explicit link or Back/Forward navigation even when an old prompt is identical.
- `tests/fixtures/auto-read-journey.html`: **6/6 passed** in Chrome. Scenarios use 40/400/2,400-word responses, 3/30/180-second silent WAV media, and 0/120 earlier responses. They check paused queueing, progression, native completion/reset, and another new response. The prior production code failed the native-cleanup checks in a negative-control run. Completion is accelerated by seeking near the end; this does not establish uninterrupted three-minute playback.
- The local settings preview was inspected at its 300-pixel width with help closed and expanded. Click, Enter and Space toggle help; Escape closes it and restores focus. The checkbox remains off by default. Installed toolbar-popup sizing remains a manual check.

A user trial of the earlier experimental version reported working button-based dictation pause/resume. A subsequent user trial confirmed that the three-second rewind works after reloading the updated extension but reported insufficient context. The six-second revision has Node and Chrome fixture coverage; its daily-use trial remains outstanding. Long unattended timeouts, other interface languages, remapped shortcuts with the installed feature, and packaged ZIP installation remain unverified. The latest admission/completion repairs have deterministic regression and browser-fixture coverage. A live failure inspection found two recognized completed turns with the older player paused at zero and the next response absent from the queue; its original transitions were not captured. Live generation and background/fullscreen retests remain outstanding. Earlier live dictation inspection established observable button, hotkey, cancellation, and transcription states; it did not validate this installed implementation.

The release ZIP is checked for integrity, version, included manifest assets, and
byte-for-byte agreement with the verified runtime sources. This archive check
does not replace a fresh unpacked-install smoke check in Chrome. GitHub CI checks
the release commit on Node 22 and 24.

The following release record is historical and does not establish compatibility for v0.4.0.

## v0.3.1 release record

Updated October 31, 2026 for v0.3.1.

## Automated checks

- The full Node suite passes **121 tests**. It covers settings, the storage bridge,
  media timeline and ownership, captured playback cleanup, AAC indexing, queue
  scheduling, manual/automatic admission, cancellation, and error recovery.
- Production JavaScript passes syntax checks. The manifest parses and its
  injected script, stylesheet, popup, and icon paths exist.
- GitHub Actions runs the automated checks on Node 22 and 24.

## Recorded browser checks

| Fixture | Recorded result | Checked | Coverage |
| --- | --- | --- | --- |
| `tests/fixtures/reading-queue.html` | 10/10 | October 30 | Drawer commands, totals, focused controls, snapshots during drag, and cleanup. |
| `tests/fixtures/auto-read-runtime.html` | 25/25 | October 31 | Native clicks, automatic/manual queues, current assistant markup, generation detection, cancellation, source reveal, failure recovery, and invalidation. |
| `tests/fixtures/auto-read-aloud.html` | 10/10 | October 31 | Current and legacy response bodies, excerpt selection, signatures, empty answers, and streaming state. |
| `tests/fixtures/media-startup.html` | 2/2 | October 31 | Production player with real silent WAV audio: cached and early playback, stable sessions, Pause/Resume, and download readiness. |
| `tests/fixtures/quiet-player.html` | 2/2 | October 30 | Focus through minimization, shared transport, skip values, and drawer preference. |

The production modules were also exercised with silent local WAV media for the
first-Pause handoff, paused queue growth, editing and Undo, and light/dark themes.
Both documentation themes were checked to select all five matching image pairs.

## Live verification

Manual testing on October 31 confirmed the v0.3.1 repair works in ChatGPT Plus
and Edu accounts, including response excerpts and automatic reading with the
floating player.

An earlier live regression run also confirmed position-preserving Pause/Resume,
seek and skip controls, speed-adjusted time labels, scrubbing, and response
replacement.

See [DEVELOPMENT.md](DEVELOPMENT.md) for commands, fixture paths, and the live smoke
check. [LONG_AUDIO_DEBUGGING.md](LONG_AUDIO_DEBUGGING.md) records the AAC duration
and seeking investigation.
