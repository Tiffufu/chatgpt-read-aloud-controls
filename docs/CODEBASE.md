# Codebase Guide

Read Aloud Controls for ChatGPT is a Manifest V3 extension with a popup settings UI, an isolated settings bridge, and a main-world player script. There is no bundler, package manager, or generated output.

## Runtime pieces

### `manifest.json`

Registers extension metadata, popup, icons, isolated settings/automatic-reading scripts, main-world media/player/drawer scripts, and declarative player CSS. The player script runs at `document_start` in the page's main world so it can observe page-created audio elements and wrap `window.fetch`. The bridge and queue scheduler run in the isolated world, which can access extension APIs.

### `src/js/player-settings.js`

Defines the storage key, setting defaults, playback speed options, accepted values, and normalization logic. This is the only source of truth for settings defaults. It is dependency-free because it loads in the popup and the page main world.

### `src/js/settings-bridge.js`

Reads `chrome.storage.local`, listens for popup updates, accepts scoped player-originated settings update requests, and forwards raw settings into the page through scoped DOM `CustomEvent`s. This avoids polluting ChatGPT's global `window.postMessage` channel while keeping extension APIs out of the main-world player script.

### `src/js/auto-read-aloud.js`

Owns the per-tab queue scheduler and the ChatGPT DOM adapter. The adapter finds response actions, detects generation, derives response identity and excerpts, and reveals sources. The controller owns eligibility, manual/automatic admission, ordering, revisions, cancellation, Retry, and Undo. Idle native Read Aloud clicks pass through unchanged; a different response selected during busy playback is intercepted only after successful admission.

### `src/js/reading-queue.js`

Renders the attached drawer and its numeric toggle from value snapshots. Sends semantic edit/reveal commands without scanning ChatGPT or starting audio. Counts current plus waiting responses, deduplicates retry entries, preserves drawer preference and keyboard focus, and defers snapshots while a native drag source is active.

### `src/js/media-timeline.js`

Resolves a stable display duration from finite native metadata or completed-capture metadata, normalizes the live seekable ranges, clamps seek targets to those ranges, and probes a detached completed blob when streamed media reports an indefinite duration. It never mutates the active playback element.

### `src/js/aac-container.js`

Validates completed AAC-LC ADTS captures and creates a lossless M4A playback copy with explicit sample tables. Its frame-count duration takes precedence over the original stream's bitrate estimate. Other formats and unsupported configurations retain the existing playback path; the downloaded capture stays unchanged.

### `src/js/captured-playback.js`

Creates the detached blob-backed playback controller used for resumable Pause. It resolves readiness only after metadata and a valid seekable range exist, never calls `play()`, and owns idempotent pause, unload, timeout, and object-URL revocation cleanup.

### `src/js/content-script.js`

Owns the injected player runtime:

- Tracks audio elements created by ChatGPT.
- Binds each speech-response session to an audio element that played after the session began.
- Prepares a captured playback element without replacing or autoplaying the page stream.
- Atomically transfers ownership to the captured element on the first safe Pause.
- Retains the captured owner through pause, resume, speed, seek, and skip actions.
- Retains an ended captured owner until explicit Close or the next speech-response session.
- Leaves page-owned audio transitions untouched during passive tracking.
- Captures Read Aloud responses from `fetch()` clones.
- Stores active capture/download state in `playerSession`.
- Enables audio download only after capture completes.
- Builds the floating player UI directly in the page.
- Applies popup-controlled skip intervals, playback speed, and theme choice.
- Keeps timeline, speed, and play/pause state synchronized while the tab is visible.

Important helpers:

- `getObservedAudio()` discovers eligible post-session playback candidates when no owned element exists.
- `src/js/media-timeline.js` derives the stable timeline and safe seek targets.
- `src/js/captured-playback.js` owns captured media readiness and object-URL cleanup.
- `isSpeechResponse()` decides whether a fetch response should be captured for download.
- `createSettingsApiFallback()` is a last-resort guard for stale unpacked-extension manifests that run the player without the shared settings helper.
- `playerSession` owns the authoritative audio element, capture state, MIME type, chunks, captured duration, playback key, closed-session guard, and captured-player lifecycle fields.
- `updateDownloadButtonState()` derives the download affordance from the current session.
- `closePlayer()` invalidates pending capture work, marks the active playback dismissed, pauses the current owner once, releases captured media, and tears down the UI.
- `buildControls()` constructs the floating player UI.
- `updateControlState()` refreshes enabled/disabled state, speed labels, play/pause icon, download readiness state, and time labels.
- `initializePreviewMode()` renders the same UI in `preview.html` without a ChatGPT stream.

### `src/popup.html`, `src/css/popup.css`, and `src/js/popup.js`

The popup owns persistent settings for skip intervals, default playback speed, theme, and automatic reading. It writes settings to `chrome.storage.local`; the isolated settings bridge observes storage changes and forwards raw settings into active ChatGPT tabs with extension-scoped DOM events. Popup code should consume `window.AEPlayerSettings` and fail clearly if the shared settings module is missing.

### `src/css/player.css` and `src/css/reading-queue.css`

Declaratively injected presentation scoped to `#ae_enhanced_player`, with theme variables supplied by the runtime. These files own expanded/minimized layout, responsive sizing, queue rows, focus outlines, and timeline appearance. Expanded and minimized views reuse the same transport elements; keep ChatGPT selectors out of the styles and drawer.

### `preview.html`

Local UI harness for maintainers. It loads the production content script and passes preview state through query parameters:

- `ae-theme=light|dark`
- `ae-duration=<seconds>`
- `ae-current=<seconds>`
- `ae-rate=<number>`
- `ae-back=<seconds>`
- `ae-forward=<seconds>`
- `ae-download=loading|ready|failed`

## Common changes

### Add a playback speed

Update `PLAYBACK_RATE_OPTIONS` in `src/js/player-settings.js`. The popup select, player speed menu, active state, persistence, and label formatting are derived from that shared array.

### Adjust configurable controls

Defaults and validation live canonically in `src/js/player-settings.js`. Keep popup field names, stored setting keys, and player setting names aligned with that shared schema. The only fallback copy belongs to `content-script.js` so the player can still run if Chrome fails to inject the shared helper first.

### Adjust player colors

Update `playerThemes` in `src/js/content-script.js`. Theme values are applied as inline styles and CSS custom properties so the injected UI remains isolated from ChatGPT page CSS.

### Adjust timeline appearance

Update `src/css/player.css` for browser range-input track and thumb styling. Keep WebKit and Firefox rules in sync. Drawer appearance belongs in `src/css/reading-queue.css`.

### Update audio endpoint detection

Update both `isSpeechResponse()` and endpoint scoring inside `getObservedAudio()`. The first controls download capture; the second helps choose the active audio element.

## Button rendering

Icon buttons are rendered from semantic state instead of inferred DOM styles. `renderIconButton()` owns icon, label, enabled state, tone, and resting background. Hover is stored separately as interaction state and is recomputed from the current theme. Do not derive a button's idle state from `button.style.backgroundColor`; that can accidentally persist hover or pressed styles as the resting state.

## Verification

See [development and verification](DEVELOPMENT.md) for commands, browser fixtures, and live smoke checks. Refresh documentation images using [images/README.md](../images/README.md). Recorded results are summarized in [VALIDATION.md](VALIDATION.md).
