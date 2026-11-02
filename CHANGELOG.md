# Changelog

## Unreleased — dictation-pause experiment

- Preserve acknowledged submissions when background rendering skips intermediate generation states, and retain player ownership for a timely native play request whose promise resolves after the association deadline.

- Rewind three seconds when automatically resuming after dictation, stopping at the beginning. Replace the persistent settings explanation with an information button and expandable help; keep save feedback visible only when needed.
- Add an off-by-default **Pause audio while dictating** setting for ChatGPT web dictation. Resume applies only to audio paused by the feature; manual transport and lifecycle changes cancel it.
- Hold queued starts during recording and display paused and failed-resume feedback. Pause is attempted only when recording starts with resumable audio ready; otherwise playback stays untouched for that recording. Confirmed automatic recording ends follow the same resume behavior as manual ends.
- Add session-race regression tests and real-browser dictation fixtures. Live installation, long timeout and daily-use validation remain required before release.

## 0.3.1 — October 31, 2026

### Fixed

- Recognize current assistant-message markup for response excerpts, automatic
  reading, and manual queue admission while retaining older layouts.
- Mount the player for explicitly selected cached audio and audio that starts
  before its speech response arrives. Late capture preserves the playing session.
- Cancel delayed cached playback safely and ignore stale or unrelated audio.

### Maintenance

- Add response-markup fixtures and cached/early media startup regressions,
  including real browser Pause/Resume checks with silent WAV audio.

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
