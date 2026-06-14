# Architecture Notes

This extension is intentionally plain Manifest V3 HTML/CSS/JavaScript. The core stability constraint is execution context.

## Runtime boundaries

The extension has three runtime areas:

- **Popup**: `src/popup.html`, `src/css/popup.css`, and `src/js/popup.js`. This code owns the settings form and writes validated settings to `chrome.storage.local`.
- **Isolated bridge**: `src/js/settings-bridge.js`. This code can use extension APIs. It reads storage and forwards settings to the page through scoped DOM `CustomEvent`s.
- **Main-world player**: `src/js/content-script.js`. This code runs in the page's main world so it can observe page-created audio elements and wrap `window.fetch` for Read Aloud capture.

Do not replace the bridge with `window.postMessage`. ChatGPT also listens for global page messages, and extension messages on that channel can create console spam or application-side misclassification.

## Stability model

The player is coupled to ChatGPT only at the adapter layer: audio element observation, active-audio scoring, and speech-response detection. UI state, settings validation, playback controls, speed-menu rendering, theme application, and download readiness should stay independent of ChatGPT-specific assumptions.

When changing the extension, prefer this hierarchy:

1. Pure helpers: formatting, validation, constants, theme token selection.
2. UI helpers: button state, menu rendering, label updates.
3. Player session state: audio reference, capture state, chunks, MIME type, and playback key.
4. Page adapter code: fetch wrapping, audio scoring, and element tracking.

The fourth layer is the highest risk. Refactor it only for a specific defect and verify against a live ChatGPT Read Aloud session.

## Player session

`content-script.js` keeps download/capture state in a single `playerSession` object rather than loose globals. The session records:

- session id
- active audio element reference
- playback key
- capture state: `idle`, `loading`, `ready`, or `failed`
- captured chunks
- MIME type
- capture timestamps

The download button reads from this session. It is visible but disabled until capture reaches `ready` with at least one chunk. This prevents partial downloads without hiding the affordance.

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

- Run `node --check` for every file in `src/js/`.
- Parse `manifest.json`.
- Open `preview.html` with `ae-theme=light` and `ae-theme=dark`.
- Check preview download states with `ae-download=loading`, `ae-download=ready`, and `ae-download=failed`.
- Load the unpacked extension and reload a fresh `chatgpt.com` tab.
- Start Read Aloud and confirm the player appears.
- Confirm the speed menu hover and selected states remain stable.
- Confirm the download button remains disabled until capture completes.
- Confirm the console is not flooded with extension-origin messages.
