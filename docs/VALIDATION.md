# Validation summary

Recorded October 30, 2026. These results describe the tested build and fixtures;
ChatGPT changes can require new live verification.

## Automated checks

- The full Node suite passes **109 tests**. It covers settings, the storage bridge,
  media timeline and ownership, captured playback cleanup, AAC indexing, queue
  scheduling, manual/automatic admission, cancellation, and error recovery.
- Production JavaScript passes syntax checks. The manifest parses and its
  injected script, stylesheet, popup, and icon paths exist.
- GitHub Actions runs the automated checks on Node 22 and 24. These CI checks do
  not run the local browser fixtures or establish live ChatGPT compatibility.

## Recorded browser checks

| Fixture | Recorded result | Coverage |
| --- | --- | --- |
| `tests/fixtures/reading-queue.html` | 10/10 | Drawer commands, totals, focused controls, snapshots during drag, and cleanup. |
| `tests/fixtures/auto-read-runtime.html` | 23/23 | Native clicks, automatic/manual queues, generation detection, cancellation, source reveal, failure recovery, and invalidation. |
| `tests/fixtures/quiet-player.html` | 2/2 | Focus through minimization, shared transport, skip values, and drawer preference. |

The production modules were also exercised with silent local WAV media for the
first-Pause handoff, paused queue growth, editing and Undo, and light/dark themes.
Both documentation themes were checked to select all five matching image pairs.

## Live results and remaining checks

A live ChatGPT regression run on October 7 confirmed that captured playback
preserves position and usable seek/skip controls across Pause and Resume. It also
exercised speed-adjusted time labels, scrubbing, and response replacement. The
current queue/player update has received positive manual testing feedback.

Physical automated dragging did not establish a successful reorder; synthetic
browser events and controller tests verify the handlers and ordering. Check a
real Chrome drag gesture in both directions before a versioned release. Current
production selectors, autoplay behavior, network failures, background playback,
and actual dictated input also require live checks.

See [DEVELOPMENT.md](DEVELOPMENT.md) for commands, fixture paths, and the live smoke
check. [LONG_AUDIO_DEBUGGING.md](LONG_AUDIO_DEBUGGING.md) records the AAC duration
and seeking investigation.
