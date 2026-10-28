# Architecture Notes

This extension is intentionally plain Manifest V3 HTML/CSS/JavaScript. The core stability constraint is execution context.

## Runtime boundaries

The extension has three runtime areas:

- **Popup**: `src/popup.html`, `src/css/popup.css`, and `src/js/popup.js`. This code owns the settings form and writes validated settings to `chrome.storage.local`.
- **Isolated bridge**: `src/js/settings-bridge.js`. This code can use extension APIs. It reads storage and forwards raw settings to the page through scoped DOM `CustomEvent`s.
- **Main-world player**: `src/js/content-script.js`. This code runs in the page's main world so it can observe page-created audio elements and wrap `window.fetch` for Read Aloud capture.

Do not replace the bridge with `window.postMessage`. ChatGPT also listens for global page messages, and extension messages on that channel can create console spam or application-side misclassification.

## Stability model

The player is coupled to ChatGPT only at the adapter layer: audio element observation, session binding, and speech-response detection. UI state, settings validation, playback controls, speed-menu rendering, theme application, timeline resolution, and download readiness should stay independent of ChatGPT-specific assumptions.

When changing the extension, prefer this hierarchy:

1. Pure and lifecycle helpers: formatting, validation, constants, theme token selection, media timeline resolution, and captured-player preparation.
2. UI helpers: semantic button rendering, menu rendering, label updates.
3. Player session state: audio reference, capture state, chunks, MIME type, and playback key.
4. Page adapter code: fetch wrapping, audio scoring, and element tracking.

The fourth layer is the highest risk. Refactor it only for a specific defect and verify against a live ChatGPT Read Aloud session.

The page owns transitions between its audio elements before handoff. Passive tracking must not pause competing elements. The extension pauses only the session-owned element in response to an explicit Pause or Close action, and extension-owned captured elements are excluded from page-candidate discovery.

## Streaming timeline

`src/js/media-timeline.js` resolves a display timeline without mutating active playback. For validated AAC-LC captures, `src/js/aac-container.js` counts ADTS frames and supplies an exact duration, which overrides the native stream's bitrate-based duration estimate. For other formats a finite native duration is authoritative; a detached metadata probe supplies the fallback when it is indefinite. Moving `seekable` and `buffered` endpoints are never treated as the total duration.

The stable total may describe more audio than ChatGPT currently exposes as seekable. The full timeline remains visible, but seek and skip targets are constrained to the live seekable ranges. Targets in gaps or unloaded tails snap to a safe boundary instead of interrupting playback.

Elapsed and total listening-time labels are divided by the selected playback rate. Seekbar progress remains based on raw media time, so changing speed does not change playback position.

## Captured playback handoff

`src/js/aac-container.js` validates a complete, consistent AAC-LC ADTS stream (single-block mono/stereo, up to 48 kHz) and packages its unchanged compressed samples into an in-memory M4A container. Explicit sample sizes, offsets, and timestamps give the browser an exact duration and seek index. This prevents a long recording's initial bitrate estimate from truncating the captured copy's seek range. Unsupported or malformed captures keep the original playback path. Downloads retain the original capture.

`src/js/captured-playback.js` prepares a separate detached audio element from that completed playback blob. It never starts playback: readiness requires metadata plus at least one nonempty seekable range, and failure or a 5-second timeout unloads the element and revokes its object URL.

Until that element is ready, the Play/Pause button is disabled and announces `Preparing resumable playback`. Preparation failure leaves ChatGPT playback untouched and reports `Pause unavailable`; a completed capture may still be downloaded.

On the first enabled Pause, `content-script.js` verifies that the captured element can accept the page stream's exact raw position. It applies the selected rate and makes the captured element `playerSession.audioElement` before pausing the page stream. If exact positioning fails, ownership and page playback remain unchanged. After a successful handoff, Play, Pause, seek, skip, speed, timeline state, and Close use only the captured owner. Its seekbar and skip buttons remain enabled while paused whenever it has a valid seekable range. ChatGPT's native Read Aloud indicator is not expected to stay synchronized after handoff.

Close and response replacement release the captured element and revoke its URL. A new response pauses a previous extension-owned captured player but never passively pauses page-owned competitors. Late readiness from a released controller cannot modify the current session or rebuild a closed player.

Closing marks the current session closed before teardown. Pending response reads, duration probes, and captured-player readiness callbacks check that state before allocating media or changing the UI. A captured owner also remains authoritative after its `ended` flag is set; passive page discovery cannot replace it. Ownership changes only through explicit close or a new speech-response session.


## Settings contract

`src/js/player-settings.js` is the canonical source of truth for settings defaults, playback speed options, bounds, allowed values, and normalization. The popup and main-world player consume `window.AEPlayerSettings`. The isolated bridge deliberately does not load the settings schema; it only transports raw storage payloads so Chrome does not have to inject the same helper file into both isolated and main worlds.

The main-world player also carries a small last-resort fallback schema. It exists only to keep playback controls alive if Chrome runs a stale unpacked-extension manifest or otherwise fails to inject `player-settings.js` before `content-script.js`. Keep this fallback synchronized with `player-settings.js`; do not add separate defaults anywhere else.

Stored settings in `chrome.storage.local` still take precedence over defaults, so changing a default affects fresh installs and cleared storage; existing saved values remain user-controlled. The main-world player requests settings writes through the isolated bridge so it never needs direct extension API access.

## Player session

`content-script.js` keeps download/capture state in a single `playerSession` object rather than loose globals. The session records:

- session id
- closed-session guard used to invalidate pending asynchronous capture work
- active audio element reference
- playback key
- capture state: `idle`, `loading`, `ready`, or `failed`
- captured chunks
- MIME type
- stable captured duration, when available
- prepared captured playback element, object URL, lifecycle state, and release callback
- the play-sequence marker used to reject pre-session audio
- capture timestamps

The download button reads from this session. It is visible but disabled until capture reaches `ready` with at least one chunk. This prevents partial downloads without hiding the affordance. The resting appearance is derived from semantic button state rather than hover, focus, or pressed styles. Starting a download keeps the download icon in place because Chrome's own download UI provides action feedback.

## Debugging

Debug logs are disabled by default. To enable scoped runtime logs in a tab:

```js
localStorage.setItem('ae_debug', '1')
```

To disable them:

```js
localStorage.removeItem('ae_debug')
```

Debug logs use the `[AE Player]` prefix and must stay low-volume. Do not add default console logging for normal playback.

## Verification checklist

Before shipping changes:

- Run `node --test tests/*.test.js`.
- Run `node --check` for every file in `src/js/`.
- Parse `manifest.json`.
- Open `preview.html` with `ae-theme=light` and `ae-theme=dark`.
- Check preview download states with `ae-download=loading`, `ae-download=ready`, and `ae-download=failed`.
- Load the unpacked extension and reload a fresh `chatgpt.com` tab.
- Start Read Aloud and confirm the player appears.
- Confirm a long streamed response gains a stable total before playback completes and seeks only within loaded ranges.
- In the Chrome test profile, let a loaded timeline reach a nonzero position, Pause, wait for UI sync, and confirm the bar and both skip buttons remain enabled at that position.
- Resume and confirm playback continues from the preserved position; then repeat after scrubbing and exercise both skip buttons.
- Start another Read Aloud response and confirm the prior captured player stops without pausing page competitors.
- Confirm every supported speed updates both listening-time labels without changing seekbar progress.
- Confirm the speed menu hover and selected states remain stable.
- Confirm the download button remains disabled until capture completes and does not keep a hover/pressed background after downloading.
- Confirm the console is not flooded with extension-origin messages or interrupted-play errors.
- Confirm any main-world fallback defaults still match `src/js/player-settings.js`.

The most recent completed live run is recorded in [`LIVE_VALIDATION_2026-10-07.md`](LIVE_VALIDATION_2026-10-07.md).
