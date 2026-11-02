# Validation summary

## Unreleased dictation-pause experiment

Recorded November 1, 2026 after increasing automatic-resume rewind to six seconds, with compact settings help and background timing repairs:

- Full Node suite: **147/147 passed**.
- Production JavaScript syntax, manifest asset validation, and whitespace checks passed.
- `tests/fixtures/media-startup.html`: **5/5 passed** in Chrome, including a play request that resolves 21 simulated seconds later, pause/resume six seconds earlier, and verification that audio unready at recording start remains untouched until a new recording starts.
- `tests/fixtures/auto-read-runtime.html`: **29/29 passed** in Chrome, including delayed completion of an acknowledged submission without an intermediate generating state.
- The local settings preview was inspected at its 300-pixel width with help closed and expanded. Click, Enter and Space toggle help; Escape closes it and restores focus. The checkbox remains off by default. Installed toolbar-popup sizing remains a manual check.

A user trial of the earlier experimental version reported working button-based dictation pause/resume. A subsequent user trial confirmed that the three-second rewind works after reloading the updated extension but reported insufficient context. The six-second revision has Node and Chrome fixture coverage; its daily-use trial remains outstanding. Long unattended timeouts, other interface languages, remapped shortcuts with the installed feature, and packaged ZIP installation remain unverified. The latest timing repairs have deterministic regression and browser-fixture coverage; a live background/fullscreen retest remains outstanding. Earlier live dictation inspection established observable button, hotkey, cancellation, and transcription states; it did not validate this installed implementation.

The following release record is historical and does not establish compatibility for this experiment.

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
