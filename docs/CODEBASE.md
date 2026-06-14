# Codebase Guide

This project intentionally stays small: a Manifest V3 extension with a shared settings schema, two content-script entry points, and a settings popup. There is no bundler, package manager, or generated output.

## Runtime Pieces

### `manifest.json`

Registers the extension metadata, popup, icons, shared settings schema, an isolated settings bridge, and the ChatGPT player script. The player script runs at `document_start` in the page's main world so it can observe page-created audio elements and wrap `window.fetch`; the bridge runs in the default isolated world so it can access extension APIs.

### `src/js/player-settings.js`

Defines the storage key, setting defaults, accepted values, and normalization logic. It is deliberately dependency-free because it loads in the popup, the isolated content-script world, and the page main world.

### `src/js/settings-bridge.js`

Reads `chrome.storage.local`, listens for popup updates, and forwards normalized settings into the page through scoped DOM `CustomEvent`s. Event payloads are JSON strings so the isolated extension world and page/main world do not share live objects. This avoids polluting ChatGPT's global `window.postMessage` channel while keeping extension APIs out of the main-world player script and preserving the player's ability to patch page-created audio and fetch behavior.

### `src/js/content-script.js`

Owns all player behavior:

- Tracks audio elements created by ChatGPT.
- Prunes inactive detached audio references so long single-page sessions do not keep stale nodes indefinitely.
- Scores known audio elements to identify the active Read Aloud stream.
- Pauses competing audio elements when a new one starts.
- Captures Read Aloud responses from `fetch()` clones for downloads and enables download only after capture completes.
- Builds the floating player UI directly in the page.
- Applies popup-controlled skip intervals and theme choice.
- Keeps timeline, speed, and play/pause state synchronized while the tab is visible.

Important helpers:

- `getObservedAudio()` chooses the best active audio element.
- `isSpeechResponse()` decides whether a fetch response should be captured for download.
- `buildControls()` constructs the floating player UI.
- `updateControlState()` refreshes enabled/disabled state, including download readiness, speed labels, play/pause icon, and time labels.
- `initializePreviewMode()` renders the same UI in `preview.html` without a ChatGPT stream.

### `src/popup.html`, `src/css/popup.css`, and `src/js/popup.js`

The popup owns persistent settings for skip intervals and theme. It writes settings to `chrome.storage.local`; the isolated settings bridge observes storage changes and forwards normalized settings into active ChatGPT tabs with extension-scoped DOM events. The player still appears automatically when ChatGPT starts Read Aloud.

### `preview.html`

Local UI harness for maintainers. It loads the production content script and passes preview state through query params:

- `ae-theme=light|dark`
- `ae-duration=<seconds>`
- `ae-current=<seconds>`
- `ae-rate=<number>`
- `ae-back=<seconds>`
- `ae-forward=<seconds>`

## Common Changes

### Add a playback speed

Update the `speedOptions` array in `src/js/content-script.js`. The menu, active state, persistence, and label formatting are derived from that array.

### Adjust configurable controls

Defaults and validation live in `src/js/player-settings.js`. Keep popup field names, stored setting keys, and player setting names aligned with that shared schema.

### Adjust player colors

Update `playerThemes` in `src/js/content-script.js`. Theme values are applied as inline styles and CSS custom properties so the injected UI remains isolated from ChatGPT page CSS.

### Adjust timeline appearance

Update `ensurePlayerStyles()` for browser range-input track and thumb styling. Keep WebKit and Firefox rules in sync.

### Update audio endpoint detection

Update both `isSpeechResponse()` and the endpoint scoring inside `getObservedAudio()`. The first controls download capture; the second helps choose the active audio element.
