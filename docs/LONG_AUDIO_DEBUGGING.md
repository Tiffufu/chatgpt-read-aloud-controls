# Long audio investigation and validation

Validated October 27, 2026. The implementation is integrated into `main`.

## Report and root cause

Long responses continued speaking after the controller showed elapsed equal to
total. The total later expanded, then shrank at playback end. Pause could also
fail during the initial stream.

Raw AAC metadata supplied a bitrate-based estimate. A representative AAC-LC,
24 kHz mono capture contained 23,216 ADTS frames: **990.549333 seconds**, versus
the metadata estimate of **796.511439 seconds**. At 1.25x, those values became
**13:12 versus 10:37**, matching the report.

The timeline accepted the estimate and clamped elapsed time to it. Meanwhile,
the captured player's estimated seek range could end before the native stream's
current position, preventing an exact first-Pause handoff.

## Fix

`src/js/aac-container.js` validates completed AAC-LC ADTS streams and losslessly
packages their compressed samples in M4A, with explicit sample sizes, offsets,
and timestamps. The frame-count duration overrides the native stream's estimate.
Unsupported or malformed formats retain the existing playback path. Downloads
preserve the original captured bytes. No dependencies or permissions were added.

The runtime checks session identity and closed state after asynchronous indexing
so stale work cannot allocate playback or reopen a dismissed controller.

## Verification

- `ffprobe` confirmed the indexed copy's exact **990.549333-second** duration.
- Decoding the original and indexed versions produced identical PCM hashes.
- All **77 Node tests** passed, along with JavaScript syntax, manifest parsing,
  and whitespace checks.
- Regression coverage includes duration overrides, MP4 sample tables, unchanged
  compressed payloads, malformed-input fallback, Pause/resume past the old
  estimate, and a 130,000-frame recording without call-argument limits.
- Independent review found no additional important defects after correcting the
  long-frame-table allocation.

The local Chrome fixture `tests/fixtures/long-audio.html` exercised the production
runtime with the recording. Both players exposed the full `0–990.549333` seek
range. First Pause transferred at approximately **911.636 seconds**, beyond the
old estimate, and preserved position. Paused seeking, resume, both skips,
repeated pause, and a speed change to 1.25x worked. Playback from the final second
produced an `ended` lifecycle event and retained **13:12 / 13:12**, with no total
shrink or console warnings/errors.

The fixture reads a selected file locally without transmitting it. Private audio
is not included in the repository. To use it, serve the repository locally and
open the fixture in Chrome. After updating the installed extension, reload it in
Chrome's extension manager and refresh ChatGPT so the new helper is injected.
