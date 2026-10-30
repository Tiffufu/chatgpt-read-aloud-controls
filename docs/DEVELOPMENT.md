# Development and verification

The extension is plain Manifest V3 HTML, CSS, and JavaScript. Load the repository unpacked in Chrome; no build or package installation is required. Use Node.js 18 or newer for the built-in test runner and `Blob` support.

## Runtime map

| Area | Files | Responsibility |
| --- | --- | --- |
| Settings contract | `src/js/player-settings.js` | Defaults, speed options, bounds, and normalization. |
| Popup | `src/popup.html`, `src/js/popup.js`, `src/css/popup.css` | Settings form and local storage. |
| Isolated bridge | `src/js/settings-bridge.js` | Storage updates and scoped settings events. |
| Automatic reading and queue | `src/js/auto-read-aloud.js` | ChatGPT adapter, eligibility, ordering, cancellation, and recovery. |
| Player | `src/js/content-script.js` | Media ownership, capture, player controls, and queue integration. |
| Drawer | `src/js/reading-queue.js` | Presentation, source reveal and editing commands; no audio or ChatGPT selectors. |
| Player styles | `src/css/player.css`, `src/css/reading-queue.css` | Scoped layout, themes, responsiveness, and minimized state. |
| Media helpers | `src/js/media-timeline.js`, `src/js/aac-container.js`, `src/js/captured-playback.js` | Timeline, AAC indexing, resumable playback readiness, and cleanup. |

See the [codebase guide](CODEBASE.md), [architecture](ARCHITECTURE.md), and [queue event contract](AUTO_READ_ALOUD.md) before changing runtime boundaries.

## Run checks

From the repository root:

```sh
node --test tests/*.test.js
for file in src/js/*.js; do node --check "$file" || exit; done
node -e 'JSON.parse(require("node:fs").readFileSync("manifest.json", "utf8"))'
git diff --check
```

## Local browser fixtures

Start a local server from the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

| Page on `http://127.0.0.1:8000/` | Exercises |
| --- | --- |
| `tests/fixtures/reading-queue-preview.html` | Interactive production player, scheduler, drawer, and adapter with synthetic silent WAV media and local storage boundary. |
| `tests/fixtures/reading-queue.html` | Real-DOM drawer commands, totals, focus, drag handlers, minimized preferences, and cleanup. |
| `tests/fixtures/quiet-player.html` | Focus across minimization, shared transport, skip values, and drawer preference. |
| `tests/fixtures/auto-read-runtime.html` | Native clicks, queue operations, generation detection, cancellation, failures, and invalidation. |
| `tests/fixtures/auto-read-aloud.html` | DOM adapter and controller integration. |
| `tests/fixtures/long-audio.html` | Production capture and playback using a local recording selected by the tester. |
| `src/popup.html` | Actual settings UI; uses defaults when extension storage is unavailable. |

`preview.html` is a lightweight layout harness. For example:

```text
http://127.0.0.1:8000/preview.html?ae-theme=dark&ae-duration=420&ae-current=80&ae-rate=2&ae-back=10&ae-forward=15&ae-download=ready
```

Parameters: `ae-theme=light|dark`, `ae-duration=<seconds>`, `ae-current=<seconds>`, `ae-rate=<supported speed>`, `ae-back=<seconds>`, `ae-forward=<seconds>`, and `ae-download=loading|ready|failed`.

This static preview does not complete the captured-player readiness lifecycle, so Play/Pause can remain disabled with **Preparing resumable playback**. Use the interactive queue preview for local playback interaction and live ChatGPT for compatibility validation.

## Live smoke check

After runtime changes, reload the unpacked extension and refresh a ChatGPT tab:

1. Start native Read Aloud and verify the player appears.
2. Pause at a nonzero position without scrubbing; resume and confirm the position is preserved.
3. Seek within available ranges; test both skip controls and speed-adjusted time labels.
4. Queue other responses while playing and paused. Test removal, Clear, Undo, arrows, physical drag in both directions, and source reveal without resuming audio.
5. Minimize and expand with the drawer both open and closed. Confirm the same skip values, position, and drawer preference.
6. Finish a response and confirm progression keeps the player mounted.
7. Turn automatic reading on; generate a new response. Opening history and focusing a tab must stay silent.
8. Check independent tabs, background completion, turning automatic reading off, Close, conversation navigation, and an extension reload.
9. Check light/dark appearance, long titles, narrow viewports, keyboard controls, and download states.
10. Check failure recovery and unexpected console errors. Use actual speech input separately when validating dictated submissions.

Local fixtures cannot establish compatibility with ChatGPT’s current production DOM, network behavior, autoplay policy, or microphone path. Historical validation reports are dated snapshots, not a guarantee for later site changes.

## Maintainability

Keep ChatGPT selectors in the adapter and media ownership in the player/session helpers. The drawer should consume snapshots and emit semantic commands. Its styles should depend on the extension root and theme variables, not page layout classes.

Preserve the idle native Read Aloud gesture. A different selection during busy playback may be suppressed only after successful queue admission. Do not prefetch queued audio or move queue state across tabs as part of a UI change.

Use the shared settings schema. Keep the player’s last-resort stale-manifest fallback synchronized. Keep settings traffic on scoped DOM events; do not replace it with `window.postMessage`.

## Debug logs

Logs are off by default. In the ChatGPT tab’s console:

```js
localStorage.setItem('ae_debug', '1')
// Disable again:
localStorage.removeItem('ae_debug')
```

Player logs use `[AE Player]`. Avoid publishing private response text in bug reports.

## Documentation images

Follow [images/README.md](../images/README.md) to refresh actual UI captures. Keep the original project and contributor attribution in [CREDITS.md](../CREDITS.md) when replacing legacy visuals.
