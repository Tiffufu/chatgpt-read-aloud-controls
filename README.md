# Read Aloud Controls for ChatGPT

A browser extension that adds a floating control panel for ChatGPT Read Aloud. It provides playback controls, a seek bar, configurable skip intervals, speed control, theme settings, and audio download support when capture completes.

This project is not affiliated with OpenAI.

![Screenshot of the extension](images/promo-screenshot.png)

## Features

- Floating player that appears when ChatGPT Read Aloud starts.
- Play and pause controls.
- Configurable skip-back and skip-forward intervals.
- Seekable timeline when ChatGPT exposes a finite audio duration.
- Stable timeline fallback from completed-capture metadata when streamed playback still reports an indefinite duration.
- Playback speeds: `0.75x`, `1x`, `1.25x`, `1.5x`, and `2x`.
- Current and total listening-time labels adjusted for the selected speed.
- Conversation-aware track title with long-title truncation.
- Download button for captured Read Aloud audio responses, enabled only after capture completes.
- Theme setting: follow system, light, or dark.
- Draggable, collapsible player.
- Close-to-pause behavior.
- Local preview harness for UI checks without a live ChatGPT audio stream.

## Install for local use

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome or another Chromium-based browser.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose this repository folder.
6. Reload any open `chatgpt.com` tabs.
7. Start ChatGPT Read Aloud.

The player appears automatically after ChatGPT starts a Read Aloud audio stream.

## Popup settings

Open the extension icon to configure player settings:

- **Skip back seconds**: number of seconds moved by the back button. Fresh installs default to 15 seconds.
- **Skip forward seconds**: number of seconds moved by the forward button. Fresh installs default to 15 seconds.
- **Default playback speed**: the speed applied to active and future Read Aloud playback.
- **Theme**: follow system, light, or dark.

Settings are saved with `chrome.storage.local` and forwarded to active ChatGPT tabs by the extension settings bridge. Defaults, speed options, limits, and validation are defined only in `src/js/player-settings.js`; other scripts consume that shared settings contract rather than carrying duplicate defaults.

## Download behavior

The download button stays visible but disabled while audio capture is still loading. It enables only when the active Read Aloud response has fully completed capture. This avoids accidental partial downloads. Starting a download does not change the icon; Chrome's own download UI provides confirmation while the player keeps the control stable and repeatable.

The downloaded file is built from the audio response captured while ChatGPT is streaming Read Aloud audio. The extension does not depend on re-fetching the audio element source after playback.

## Local preview

Open `preview.html` directly in a browser to check the injected player UI without loading ChatGPT.

Useful query parameters:

```text
preview.html?ae-theme=dark&ae-duration=420&ae-current=80&ae-rate=2&ae-back=10&ae-forward=15&ae-download=ready
```

Supported preview parameters:

- `ae-theme=light|dark`
- `ae-duration=<seconds>`
- `ae-current=<seconds>`
- `ae-rate=<supported speed>`
- `ae-back=<seconds>`
- `ae-forward=<seconds>`
- `ae-download=loading|ready|failed`

## Development notes

The extension intentionally uses plain Manifest V3 HTML, CSS, and JavaScript. There is no bundler or package manager.

Important runtime files:

```text
manifest.json             Chrome extension manifest
src/js/content-script.js  Main-world player, audio tracking, fetch capture, and UI
src/js/media-timeline.js  Stable native and completed-capture timeline resolution
src/js/player-settings.js Shared settings schema, defaults, and validation
src/js/settings-bridge.js Isolated-world storage bridge
src/js/popup.js           Popup settings controller
src/popup.html            Extension popup markup
src/css/popup.css         Popup styling
preview.html              Local UI preview harness
docs/                     Maintainer notes
```

See [`docs/CODEBASE.md`](docs/CODEBASE.md) for the file-level guide and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for runtime-boundary notes.

## Debugging

Runtime logs are disabled by default. To enable scoped player logs in the current ChatGPT tab:

```js
localStorage.setItem('ae_debug', '1')
```

To disable them:

```js
localStorage.removeItem('ae_debug')
```

Debug output uses the `[AE Player]` prefix.

## Contributing

Contributions should preserve the extension's runtime boundaries:

- Popup code may use extension APIs.
- `settings-bridge.js` may use extension APIs and forwards raw settings through scoped DOM `CustomEvent`s.
- `content-script.js` runs in the page's main world and must remain able to observe page-created audio elements and wrap `window.fetch`.
- Do not use `window.postMessage` for internal extension settings traffic.
- Avoid broad refactors of audio detection, fetch interception, or element tracking unless tied to a specific defect.

Before opening a pull request:

1. Run `node --test tests/*.test.js`.
2. Run JavaScript syntax checks for every file in `src/js/`.
3. Parse `manifest.json`.
4. Open `preview.html` in light and dark modes.
5. Test `ae-download=loading`, `ae-download=ready`, and `ae-download=failed` in preview mode.
6. Load the extension unpacked in Chrome.
7. Reload a fresh `chatgpt.com` tab.
8. Start Read Aloud and confirm the player appears.
9. Confirm the speed menu hover and selected states are stable.
10. Confirm the timeline stays hidden while duration is unknown, then appears with a stable total when either the active media or completed capture provides one. If only the capture provides the total, confirm the seekbar remains read-only until the active media is fully seekable.
11. Confirm the download button stays disabled until capture completes and returns to its non-hover resting state after downloading.
12. Confirm DevTools is not flooded with extension-origin console messages.

## Attribution

Originally forked from Ian Speckart's `chatgpt-audio-player`. This version has diverged into a settings-driven floating controls extension. See [`CREDITS.md`](CREDITS.md) for original project and third-party attributions.

## License

MIT. See [`LICENSE`](LICENSE).
