# Documentation screenshots

Captured October 30, 2026 from the production extension UI at runtime commit
`4d782b3`. These are browser JPEG captures, cropped around the player or popup.
They are not renders of the separate design prototype and have not had controls,
text, or playback state painted onto them.

The player captures use `tests/fixtures/reading-queue-preview.html`, which loads
the actual player, drawer, scheduler, adapter, media helpers, and styles. Only
extension storage and the speech/media service are replaced by local boundaries
with sample responses and silent WAV audio. The popup capture uses the actual
`src/popup.html`, scripts, and styles; without Chrome storage it displays defaults.
These images demonstrate UI appearance, not a live ChatGPT compatibility test.

| Image | State | Dimensions |
| --- | --- | --- |
| `reading-queue-dark.jpg` | Playing, drawer open, one current response and three waiting. | 592 × 513 |
| `reading-queue-light.jpg` | Paused, drawer open, same queue. | 592 × 513 |
| `player-expanded-light.jpg` | Paused, drawer closed. | 592 × 197 |
| `player-minimized-light.jpg` | Paused, minimized, same skip values. | 592 × 88 |
| `settings.jpg` | Actual settings form with fresh-install defaults. | 300 × 395 |

## Refresh captures

1. Serve the repository locally as described in [DEVELOPMENT.md](../docs/DEVELOPMENT.md).
2. Open `tests/fixtures/reading-queue-preview.html` at a desktop viewport wide
   enough for the 560px player. The original captures used 1280 × 720 CSS pixels.
3. Select **Start sample queue**, then skip forward once to show timeline progress.
4. Scroll back to the top so the harness controls stay outside the crop. Open the
   reading drawer and move the pointer onto blank page space to remove hover tint.
5. Capture the dark playing state. Pause to hold a stable position for subsequent
   captures. Close the drawer before using the harness's theme button, then scroll
   back to the top and reopen it for the light capture.
6. Close the drawer for the expanded-player image. Minimize for the compact image.
   Include the whole border and a little space for the shadow; retain a consistent
   displayed width across player screenshots.
7. Open `src/popup.html` and capture its 300px-wide form, including the status text.
   The popup follows the browser's system color scheme; this capture is dark.
8. Inspect every saved image at its displayed size, check file extensions match
   the actual image format, and update captions if the UI or queue count changed.

Use synthetic sample responses, or explicitly approved public content. Do not
publish screenshots of private chats, account details, or browser profile UI.
Keep screenshot provenance accurate: a local production-UI capture is not a
screenshot of the installed extension on live ChatGPT.

The legacy `small-promo-tile-440x280.png` and
`marquee-promo-tile-1400x560.png` remain historical promotional assets. They are
not used by the current documentation and have not been refreshed as store art.
Original project credit remains in [CREDITS.md](../CREDITS.md).
