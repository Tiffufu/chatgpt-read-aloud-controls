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

GitHub Actions runs the Node suite, production JavaScript syntax checks, and manifest
asset validation on Node 22 and 24 for pushes and pull requests. No package install
is required. Live browser checks remain part of the manual smoke check below.

## Local browser fixtures

Start a local server from the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

| Page on `http://127.0.0.1:8000/` | Exercises |
| --- | --- |
| `tests/fixtures/auto-read-journey.html` | Click **Run six journey checks** for the production adapter, queue, player, and silent WAV media. Covers 40/400/2,400 words, 3/30/180-second audio, 0/120 earlier responses, removal of earlier user nodes, paused queueing, completion/reset, and another new response. Failures include recent queue transitions. |
| `tests/fixtures/reading-queue-preview.html` | Interactive production player, scheduler, drawer, and adapter with synthetic silent WAV media and local storage boundary. |
| `tests/fixtures/reading-queue.html` | Real-DOM drawer commands, totals, focus, drag handlers, minimized preferences, and cleanup. |
| `tests/fixtures/quiet-player.html` | Focus across minimization, shared transport, skip values, and drawer preference. |
| `tests/fixtures/auto-read-runtime.html` | Native clicks, queue operations, generation detection, cancellation, failures, and invalidation. |
| `tests/fixtures/auto-read-aloud.html` | DOM adapter and controller integration. |
| `tests/fixtures/media-startup.html` | Click **Run silent playback checks** to verify cached, early, and delayed native audio mounts the production player and preserves Pause/Resume and download. The delayed case advances the fixture clock 21 seconds between requesting play and allowing real media playback. |
| `tests/fixtures/long-audio.html` | Production capture and playback using a local recording selected by the tester. |
| `src/popup.html` | Actual settings UI; uses defaults when extension storage is unavailable. |

`preview.html` is a lightweight layout harness. For example:

```text
http://127.0.0.1:8000/preview.html?ae-theme=dark&ae-duration=420&ae-current=80&ae-rate=2&ae-back=10&ae-forward=15&ae-download=ready
```

Parameters: `ae-theme=light|dark`, `ae-duration=<seconds>`, `ae-current=<seconds>`, `ae-rate=<supported speed>`, `ae-back=<seconds>`, `ae-forward=<seconds>`, and `ae-download=loading|ready|failed`.

This static preview does not complete the captured-player readiness lifecycle, so Play/Pause can remain disabled with **Preparing resumable playback**. Use the interactive queue preview for local playback interaction and live ChatGPT for compatibility validation.

## Repeatable browser journeys

Serve the repository and open `tests/fixtures/auto-read-journey.html`. The page drives three new response cycles per scenario through the production modules, rather than only checking their individual outputs. It uses synthetic content and silent local WAV media. It does not call ChatGPT or store account data.

For manual exploration, `tests/fixtures/reading-queue-preview.html` accepts `ae-words` (20–2,400), `ae-audio-seconds` (2–600), `ae-history` (0–120), `ae-reset-ended=1`, and `ae-unmount-previous=1`. For example:

```text
http://127.0.0.1:8002/tests/fixtures/reading-queue-preview.html?ae-words=2400&ae-audio-seconds=180&ae-history=120&ae-reset-ended=1&ae-unmount-previous=1
```

A saved live ChatGPT conversation is useful for replay compatibility, but opening its historical messages must not trigger automatic reading. Live automatic-reading checks need a newly submitted response. Controlled journey checks catch scheduler/media regressions; live checks detect changes to ChatGPT’s markup or native playback. Passing the fixture does not establish live compatibility.

The Node suite runs in CI. These browser fixtures currently run through a real browser separately; no Playwright CI runner is included. A future runner should execute the journey fixture, fail on its result and page errors, retain a failure trace, and keep authenticated live checks separate.

## Live smoke check

After runtime changes, reload the unpacked extension and refresh a ChatGPT tab:

1. Start native Read Aloud and verify the player appears.
2. Pause at a nonzero position without scrubbing; resume and confirm the position is preserved.
3. Seek within available ranges; test both skip controls and speed-adjusted time labels.
4. Queue other responses while playing and paused. Test removal, Clear, Undo, arrows, physical drag in both directions, and source reveal without resuming audio.
5. Minimize and expand with the drawer both open and closed. Confirm the same skip values, position, and drawer preference.
6. Finish a response and confirm progression keeps the player mounted.
7. Turn automatic reading on; generate a new response. Opening history and focusing a tab must stay silent.
8. Check independent tabs, background completion, turning automatic reading off, Close, conversation navigation, and an extension reload. Include a submitted response taking over 15 seconds without an intermediate generation render, and a cached play requested on time but resolved after 15 seconds; cancellation and unrelated audio must remain excluded.
9. Check light/dark appearance, long titles, narrow viewports, keyboard controls, and download states.
10. Check failure recovery and unexpected console errors. Use actual speech input separately when validating dictated submissions.
11. For dictation pause, check the off-by-default setting, button and remapped shortcut, cancellation, transcription, manual Play/Pause/seek/skip takeover, Close, navigation, independent tabs and extension invalidation. Start recording before capture is ready and verify playback stays untouched throughout that recording, including after readiness arrives; the next recording can pause now-ready audio. Confirm automatic resume rewinds six seconds once, waits for seeking to finish before starting playback, clamps at the beginning, and manual Play resumes without that rewind. Test cancellation while seeking and verify a stalled seek stays paused with manual-resume feedback. Open the settings information button with click, Enter and Space; Escape should close help and restore focus. Confirm queued starts wait while recording. Exercise a long unattended recording separately; do not assume a fixed timeout or claim its cause is distinguishable.

The `auto-read-runtime.html` fixture includes DOM dictation-state and queue-hold checks. The **Run silent playback checks** button in `media-startup.html` also exercises dictation pause/resume and verifies that late preparation never triggers a delayed pause. These fixtures do not establish live ChatGPT compatibility or validate microphone recording.

The [validation summary](VALIDATION.md) records automated, browser-fixture, and live verification results.

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

## Prepare a release

1. Update `manifest.json` and `CHANGELOG.md` with the release version.
2. Run the automated checks and complete the live smoke check above.
3. Commit and push the release changes; confirm CI passes for that commit.
4. Run `python3 scripts/package-extension.py` with Python 3. The packager validates
   manifest assets and ZIP integrity and writes `dist/chatgpt-read-aloud-controls-unpacked.zip`.
   The archive includes runtime files, icons, install instructions, privacy, and
   license notices. Repository history, tests, documentation artwork, and local
   files are excluded. File order and ZIP timestamps are deterministic.
5. Extract the ZIP into a temporary folder and check every manifest path. Use that
   folder for an unpacked-install smoke check in Chrome.
6. Create a GitHub release tagged `v<version>` at the verified commit and attach
   the ZIP. Keep the asset name stable so the README's latest-download link works.

GitHub's automatic source archives contain the repository. The attached unpacked
ZIP is the smaller installation download intended for extension users.
