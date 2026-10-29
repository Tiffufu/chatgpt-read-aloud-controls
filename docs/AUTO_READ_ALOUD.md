# Automatic Read Aloud

The popup checkbox **Automatically read new responses aloud** is saved globally
in `ae_player_settings.autoReadAloud` and defaults to `false`. Queues, generation
tracking, and start errors remain in memory separately in each tab. There are no
new permissions, services, or dependencies.

## Behavior

- Only a newly generated, completed assistant answer is eligible. Opening,
  hydrating, scrolling, or focusing an existing conversation is never a trigger.
- A submit interaction or an observed native generation control establishes a
  generation cycle. Per-message rendering transitions alone are not sufficient.
- Eligible responses wait in completion order behind the tab's current playback,
  including manually started and paused playback.
- The queue advances on actual completion of the authoritative audio owner.
  Buffer completion and the handoff to captured playback do not advance it.
- Closing the player clears that tab's queue. Disabling automatic reading clears
  pending work in every tab while preserving audio already playing.
- Manual Read Aloud takes precedence and satisfies a matching queued response.
- Navigation and reload discard pending work. Assigning the first conversation
  URL to a new chat preserves its pending generation/start.
- An unavailable native control or missing playback confirmation suspends that
  tab's queue after 15 seconds. The popup's existing status area explains how to
  recover by starting Read Aloud manually or toggling automatic reading.

## Runtime boundary

`auto-read-aloud.js` runs in the isolated extension world. Its DOM adapter owns
ChatGPT selectors and extracts assistant-only content signatures; its controller
owns eligibility, revisions, FIFO ordering, cancellation, and timeouts. It clicks
the native response action. The current main-world player still owns media and
builds its floating controls through the existing playback path.

The private DOM event contract is:

| Event | Detail | Purpose |
| --- | --- | --- |
| `ae-read-aloud-player:playback-request` | none | Request the current snapshot. |
| `ae-read-aloud-player:playback` | `{sessionId, responseId, requestId, state, reason}` | Report starting, playing, paused, ended, closed, or error. |
| `ae-read-aloud-player:playback-intent` | `{responseId, requestId}` | Correlate native synthesis with a response and automatic attempt; manual attempts have a null request ID. |
| `ae-read-aloud-player:playback-cancel` | `{requestId}` | Cancel an automatic attempt still waiting to start. |

Stale session events and events from non-owner audio elements are ignored.
Lifecycle listeners operate in background tabs independently of UI refresh.
The settings bridge retains its existing scoped-event design; it does not use
`window.postMessage`.

## Failure handling and extension reloads

Recoverable playback failures appear in the popup's status area. They are not
written as repeated console warnings. The status distinguishes an unavailable
native button, a 15-second playback confirmation timeout, a rejected audio
request, browser-blocked playback, and media network/decoder/format failures.
The queue remains suspended until manual recovery or a settings reset.

Reloading or updating the extension invalidates its isolated scripts in tabs
that were already open. The settings bridge stops storage work when that happens
and emits `ae-read-aloud-player:extension-invalidated`. The automatic reader
cancels pending starts and stops observing the old tab; audio already playing
continues. Refresh the ChatGPT tab to load the current extension scripts.

Chrome's extension error list retains older entries after a repair. After
reloading the extension and refreshing ChatGPT, clear those historical entries
once when checking whether a new failure occurs.

## Verification

### Known limitation

Automatic playback can intermittently fail to start on certain tabs. The exact
conditions are not yet reproducible. Start native Read Aloud manually when this
happens. For a useful reproduction, record whether the tab predates the extension
reload, whether it was in the background during generation, how the message was
submitted, whether a controller was open or paused, and any popup status error.
Avoid collecting private conversation text when recording these conditions.

Run `node --test tests/*.test.js`, syntax-check every file in `src/js`, and parse
the manifest. Serve the repository locally and open
`tests/fixtures/auto-read-aloud.html` for real-DOM adapter/queue tests.

For live testing, reload the unpacked extension and refresh a ChatGPT tab. Check
that opening old conversations and switching tabs stays silent before testing
new responses, queue progression, pause/resume, close, background playback, and
independent tabs. Test dictated submission with a real speaker; automated typed
submission does not establish microphone-path validation.

## Implementation record

- Implementation scope: automatic Read Aloud with per-tab queues.
- Work is on `codex/auto-read-aloud` in the supplied checkout; no worktree or
  dependency installation was needed. The original 39 runtime tests passed.
- User clarification: tab focus and history loading must never start narration;
  an existing controller retains its playback state.
- Automated tests were added before the queue and lifecycle implementation.
  Real-browser fixtures reproduced and verified corrections to assistant-only
  extraction, user-only turns, empty replies, and fast-response detection.
- The independent read-only review identified history admissions, stale revision
  replay, incorrect first-URL adoption, and late cancellation. Regression tests
  reproduced each finding before its correction. No minor findings were deferred.
- The current live interface uses a composer button labeled `Stop`, and can keep
  a turn marked `complete` while streaming. Native generation state takes
  precedence over that container attribute.
- Startup storage reads cannot overwrite a newer settings change. Browser
  integration fixtures exercise the actual isolated runtime with real DOM events,
  MutationObservers, and a controlled extension-storage boundary.
