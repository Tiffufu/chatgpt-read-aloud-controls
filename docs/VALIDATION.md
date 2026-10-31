# Validation summary

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
