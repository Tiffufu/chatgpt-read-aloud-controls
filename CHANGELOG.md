# Changelog

## 0.3.0 — October 30, 2026

### Added

- Downloadable unpacked-extension ZIP with installation and update instructions.

- Editable reading queue in each tab, with response excerpts, source navigation,
  drag and arrow reordering, removal, Clear, Retry, and Undo.
- Manual queueing while another response is playing or paused, including when
  automatic reading is off.
- Expanded and minimized player layouts with shared controls, settings-driven
  skip values, and remembered drawer preference.
- Theme-aware documentation screenshots, a light/dark product splash, usage and
  development guides, and a privacy statement.
- Automated Node tests, JavaScript syntax checks, and manifest asset checks in CI.

### Fixed

- Queue handoffs keep the player mounted between responses.
- Idle native Read Aloud selections retain their original browser gesture.
- Cancelled starts, stale playback events, unavailable sources, and request
  failures preserve response identity and support queue recovery.
- Queue totals include the current response and exclude finished or duplicate
  retry entries. Incoming snapshots preserve an active drag source.
- Keyboard focus survives minimizing and expanding the player.

### Maintenance

- Preserved original-project credit and completed third-party license notices.
- Consolidated public validation notes and removed internal session material and
  unused legacy promotional images from the current tree.
