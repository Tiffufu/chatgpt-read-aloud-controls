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
- Closing the player clears that tab's queue. Disabling automatic reading removes
  automatic entries in every tab while preserving explicit selections and playing audio.
- Selecting another completed message's Read Aloud adds it to the queue, including
  when automatic reading is disabled. Duplicate selections are ignored. The current
  response's pressed native control can still perform its native stop action.
- The attached drawer shows the current response and ordered upcoming snippets.
  Its toggle sits beside Download and counts the current response plus waiting
  responses. The Up next count includes only waiting entries; ended responses and
  duplicate retry entries are excluded. Drag or arrow buttons reorder entries;
  Remove and Clear support one-level Undo for valid responses. Source
  previews scroll to and briefly highlight their original messages.
- Minimizing hides the drawer while retaining its expansion preference. The drawer
  starts closed and retains its preference through player-session rebuilds.
- Queue progression keeps the same player mounted. While the next response's audio
  element is being created, playback controls are temporarily disabled and show
  `Starting next response`; position and minimized/drawer state are preserved.
- Navigation and reload discard pending work. Assigning the first conversation
  URL to a new chat preserves its pending generation/start.
- An unavailable native control or missing playback confirmation suspends that
  tab's queue after 15 seconds. The drawer and popup show the failure; Retry
  restarts the pending response. Playback errors restore the interrupted response
  ahead of later entries. Clearing a failed queue releases its suspension.

## Runtime boundary

`auto-read-aloud.js` runs in the isolated extension world. Its DOM adapter owns
ChatGPT selectors and extracts assistant-only content signatures; its controller
owns eligibility, revisions, FIFO ordering, cancellation, and timeouts. It clicks
the native response action. The current main-world player still owns media and
builds its floating controls through the existing playback path.

`reading-queue.js` is a separate main-world presentation module. It receives only
bounded value snapshots, sends commands, and never starts audio or scans ChatGPT.
The controller exposes explicit admission and editing operations. Idle user clicks
pass through unchanged. Scheduled native clicks are deferred to a cancellable
microtask because a browser suppresses a reentrant `.click()` on the button whose
user click is being intercepted. A busy selection is suppressed only after a
different response has successfully joined the queue.

The private DOM event contract is:

| Event | Detail | Purpose |
| --- | --- | --- |
| `ae-read-aloud-player:playback-request` | none | Request the current snapshot. |
| `ae-read-aloud-player:playback` | `{sessionId, responseId, requestId, state, reason}` | Report starting, playing, paused, ended, closed, or error. |
| `ae-read-aloud-player:playback-intent` | `{responseId, requestId}` | Correlate native synthesis with a response and automatic attempt; manual attempts have a null request ID. |
| `ae-read-aloud-player:playback-cancel` | `{requestId}` | Cancel an automatic attempt still waiting to start. |
| `ae-read-aloud-player:queue-request` | none | Request the latest queue snapshot. |
| `ae-read-aloud-player:queue` | `{items,current,state,suspended,error,canUndo,enabled}` | Publish serializable queue/current state. |
| `ae-read-aloud-player:queue-command` | `{action,id?,direction?,targetId?}` | Remove, move, reorder, clear, undo, retry, or reveal a source. |

Snapshots retain IDs, revision/signature tokens, source, and snippets capped around
104 Unicode code points plus an ellipsis. Full response bodies, DOM nodes, and
prefetched media are never copied into the queue snapshot. Queues and Undo remain
in memory in one tab; navigation, close, reload, and extension invalidation clear them.

Stale session events and events from non-owner audio elements are ignored.
Lifecycle listeners operate in background tabs independently of UI refresh.
The settings bridge retains its existing scoped-event design; it does not use
`window.postMessage`.

## Failure handling and extension reloads

Recoverable playback failures appear in the popup's status area. They are not
written as repeated console warnings. The status distinguishes an unavailable
native button, a 15-second playback confirmation timeout, a rejected audio
request, browser-blocked playback, and media network/decoder/format failures.
The queue remains suspended until Retry, a successful manual recovery, clearing
the failed queue, or a settings reset.

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
independent tabs. Use actual speech input when checking dictated submission.

## Regression coverage

The Node and browser fixtures cover history hydration, stale revisions, initial
conversation URL assignment, cancellation, assistant-only excerpts, empty replies,
fast responses, and settings changes racing startup reads. A native generation
control takes precedence over a turn container marked complete while streaming.

Current verification instructions are in [DEVELOPMENT.md](DEVELOPMENT.md), with
recorded results in [VALIDATION.md](VALIDATION.md).
