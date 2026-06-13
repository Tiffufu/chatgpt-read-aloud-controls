# Codebase Guide

This project intentionally stays small: a Manifest V3 extension with one content script and a simple popup. There is no bundler, package manager, or generated output.

## Runtime Pieces

### `manifest.json`

Registers the extension metadata, popup, icons, and the ChatGPT content script. The content script runs at `document_start` in the page's main world so it can observe page-created audio elements and wrap `window.fetch`.

### `src/js/content-script.js`

Owns all player behavior:

- Tracks audio elements created by ChatGPT.
- Scores known audio elements to identify the active Read Aloud stream.
- Pauses competing audio elements when a new one starts.
- Captures Read Aloud responses from `fetch()` clones for downloads.
- Builds the floating player UI directly in the page.
- Keeps timeline, speed, and play/pause state synchronized while the tab is visible.

Important helpers:

- `getObservedAudio()` chooses the best active audio element.
- `isSpeechResponse()` decides whether a fetch response should be captured for download.
- `buildControls()` constructs the floating player UI.
- `updateControlState()` refreshes enabled/disabled state, speed labels, play/pause icon, and time labels.
- `initializePreviewMode()` renders the same UI in `preview.html` without a ChatGPT stream.

### `src/popup.html` and `src/css/popup.css`

The popup is intentionally passive. It should not import the content script or duplicate player controls; the in-page player appears automatically when ChatGPT starts Read Aloud.

### `preview.html`

Local UI harness for maintainers. It loads the production content script and passes preview state through query params:

- `ae-theme=light|dark`
- `ae-duration=<seconds>`
- `ae-current=<seconds>`
- `ae-rate=<number>`

## Common Changes

### Add a playback speed

Update the `speedOptions` array in `src/js/content-script.js`. The menu, active state, persistence, and label formatting are derived from that array.

### Adjust player colors

Update `playerThemes` in `src/js/content-script.js`. Theme values are applied as inline styles and CSS custom properties so the injected UI remains isolated from ChatGPT page CSS.

### Adjust timeline appearance

Update `ensurePlayerStyles()` for browser range-input track and thumb styling. Keep WebKit and Firefox rules in sync.

### Update audio endpoint detection

Update both `isSpeechResponse()` and the endpoint scoring inside `getObservedAudio()`. The first controls download capture; the second helps choose the active audio element.
