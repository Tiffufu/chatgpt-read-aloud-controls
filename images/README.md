# Documentation visuals

Captured October 30, 2026 from the production extension UI at runtime commit
`2a2c39a`. The player and popup images are browser JPEG captures. The splash is a
composition of those captures with typography and a background; its controls and
response text are the captured product UI.

## Theme-aware presentation

The README and usage guide use GitHub-supported `<picture>` elements. A dark
`<source media="(prefers-color-scheme: dark)">` selects the dark image; the `<img>`
provides the light image, accessible alternative text, and a fallback for other
Markdown renderers. Supporting screenshots follow the reader's theme throughout
the page. The splash intentionally compares both modes together on a matching
light or dark background.

Open `review.html` on the local server to inspect the actual README picture
elements together. Its Light and Dark controls change the embedding color scheme
for review; production Markdown uses the reader's GitHub appearance.

[GitHub's theme-aware image guide](https://github.blog/developer-skills/github/how-to-make-your-images-in-markdown-on-github-adjust-for-dark-mode-and-light-mode/)

| Image pair (`-light.jpg` / `-dark.jpg`) | State | Dimensions |
| --- | --- | --- |
| `splash` | Light and dark players, slightly overlapped in one composition. | 1280 × 920 |
| `reading-queue` | Paused, drawer open, one current response and three waiting. | 592 × 513 |
| `player-expanded` | Paused, drawer closed. | 592 × 197 |
| `player-minimized` | Paused, minimized, same skip values. | 592 × 88 |
| `settings` | Actual settings form with fresh-install defaults. | 300 × 395 |

## Capture sources

Player captures use `tests/fixtures/reading-queue-preview.html?ae-docs=1`, which
loads the actual player, drawer, scheduler, adapter, media helpers, and styles.
The documentation parameter selects a neutral sample title and excerpts. Only
extension storage and speech/media use local boundaries with silent WAV audio.
These captures demonstrate appearance, not live ChatGPT compatibility.

`popup-source.html?theme=light` or `?theme=dark` embeds the actual `src/popup.html`.
The iframe's `color-scheme` lets the production popup's own media queries select
the appearance. Without extension storage, its actual script displays defaults.

`splash-source.html?theme=light` or `?theme=dark` arranges the two queue captures,
cropping only their outer margins. It adds the title, theme labels, background,
and shadows. No player controls are recreated or retouched.

## Refresh captures

1. Serve the repository locally as described in [DEVELOPMENT.md](../docs/DEVELOPMENT.md).
2. Open the interactive fixture with `?ae-docs=1` at a desktop viewport wide
   enough for the 560px player. These captures used 1280 × 720 CSS pixels.
3. Select **Start sample queue**, advance with the skip controls, then Pause to
   hold the same position across every screenshot. Do not edit the rendered text
   or draw controls onto an exported image.
4. Scroll to the top so harness controls remain outside the crop. Open the
   drawer and move the pointer onto blank space before capturing. Close the
   drawer before clicking the harness theme button, then reopen it in the other
   theme. Confirm both variants show the same title, position, count, and excerpts.
5. Capture the expanded player with the drawer closed and then the minimized
   player in each theme. Preserve matching bounds, including border and shadow.
6. Capture the 300px-wide form through each `popup-source.html` theme variant.
7. Open both `splash-source.html` variants and export the full 1280 × 920 page.
   Check overlap, shadow clipping, text contrast, and actual UI content.
8. Inspect both documentation themes. Every supporting `<picture>` must select
   its matching source; the splash's background must match too. Check image
   extensions and dimensions and keep alternative text neutral about theme.

Use sample responses or explicitly approved public content. Do not publish
private chats, account details, or browser profile UI. A local production-UI
capture is not a screenshot of the installed extension on live ChatGPT.

Original project credit remains in [CREDITS.md](../CREDITS.md).
