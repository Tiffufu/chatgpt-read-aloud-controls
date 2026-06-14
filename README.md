# ChatGPT Read Aloud Player

Chrome extension that adds a compact, draggable audio player for ChatGPT's Read Aloud feature.

![Screenshot of the extension](images/promo-screenshot.png)

## Features

- Play/pause plus configurable skip-back and skip-forward controls.
- Seekable timeline when ChatGPT exposes a finite audio duration.
- Playback speeds: `0.75x`, `1x`, `1.25x`, `1.5x`, and `2x`.
- Current and total listening-time labels adjusted for the selected speed.
- Conversation-aware track title with long-title truncation.
- Download button for captured Read Aloud audio responses, enabled after capture completes.
- Theme support with system, light, and dark choices from the extension popup.
- Draggable and collapsible player with close-to-pause behavior.

## Repository Layout

```text
manifest.json             Chrome extension manifest
src/js/content-script.js  Main player, audio tracking, fetch capture, and UI
src/js/player-settings.js Shared settings schema, defaults, and validation
src/js/settings-bridge.js Settings bridge between extension storage and page UI
src/js/popup.js          Popup settings controller
src/popup.html            Extension popup
src/css/popup.css         Popup styles
preview.html              Local UI preview harness
assets/                   Extension icons
images/                   Store/readme imagery
docs/                     Maintainer notes
```

## Local Development

Load the extension unpacked in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked** and choose this repository folder.
4. Reload any open `chatgpt.com` tabs.
5. Start ChatGPT Read Aloud.

For quick UI checks without loading ChatGPT, open `preview.html` in a browser. Useful query params:

```text
preview.html?ae-theme=dark&ae-duration=420&ae-current=80&ae-rate=2&ae-back=10&ae-forward=15
```

## Maintenance Notes

- Keep production player behavior in `src/js/content-script.js`; shared setting names and validation live in `src/js/player-settings.js`; popup settings should persist through `chrome.storage.local` and reach the page via `src/js/settings-bridge.js`.
- Prefer small, explicit helpers over adding a build step. The extension currently ships as plain HTML, CSS, and JavaScript.
- When ChatGPT changes its audio endpoint, update `isSpeechResponse()` and the source scoring in `getObservedAudio()`.
- Keep attribution updates in `CREDITS.md`.

## Release Checklist

- Run JavaScript syntax checks for every file in `src/js/`.
- Open `preview.html` with light and dark themes and verify controls, collapse/expand, drag, speed menu, and responsive sizing.
- Load the unpacked extension in Chrome and test against a fresh `chatgpt.com` tab.
- Confirm the download button stays disabled until audio capture completes.
- Review `CREDITS.md` and store imagery before publishing.

See [docs/CODEBASE.md](docs/CODEBASE.md) for the code structure and common change points.
