# ChatGPT Read Aloud Player

Private Chrome extension fork that adds a compact, draggable audio player for ChatGPT's Read Aloud feature.

![Screenshot of the extension](images/promo-screenshot.png)

## Features

- Play/pause, 5-second skip back, and 5-second skip forward controls.
- Seekable timeline when ChatGPT exposes a finite audio duration.
- Playback speeds: `0.75x`, `1x`, `1.25x`, `1.5x`, and `2x`.
- Current and total listening-time labels adjusted for the selected speed.
- Conversation-aware track title with long-title truncation.
- Download button for captured Read Aloud audio responses.
- Light/dark theme support based on the browser color scheme.
- Draggable and collapsible player.

## Repository Layout

```text
manifest.json             Chrome extension manifest
src/js/content-script.js  Main player, audio tracking, fetch capture, and UI
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
preview.html?ae-theme=dark&ae-duration=420&ae-current=80&ae-rate=2
```

## Maintenance Notes

- Keep production behavior in `src/js/content-script.js`; the popup should remain informational only.
- Prefer small, explicit helpers over adding a build step. The extension currently ships as plain HTML, CSS, and JavaScript.
- When ChatGPT changes its audio endpoint, update `isSpeechResponse()` and the source scoring in `getObservedAudio()`.
- Keep attribution updates in `CREDITS.md`.

See [docs/CODEBASE.md](docs/CODEBASE.md) for the code structure and common change points.
