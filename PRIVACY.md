# Privacy

Last updated October 30, 2026.

This statement describes Read Aloud Controls for ChatGPT. ChatGPT and your browser
have their own data handling practices.

## What the extension accesses

The extension runs on `https://chatgpt.com/*`. It reads rendered conversation
content, response identifiers, and native controls to detect completed responses,
manage the reading queue, and reveal a response's source. It observes Read Aloud
media and captures a copy of the current audio response in page memory for
playback controls and download.

Audio is generated and served by ChatGPT through its native Read Aloud feature.
The extension has no developer-operated server, analytics, advertising integration,
or separate destination for uploading conversation text or audio.

## What it stores

- **Settings:** skip intervals, playback speed, theme, and the automatic-reading
  preference are saved in `chrome.storage.local` under `ae_player_settings`.
- **Queue:** response identifiers, revision/signature values, short excerpts, and
  Undo state stay in memory separately in each tab. Pending entries are cleared
  when you close the player, leave the conversation, reload the tab, or invalidate
  the extension. The queue is not saved as listening history.
- **Current audio:** captured audio and the extension-owned playback copy remain
  in memory while needed. Closing the player or replacing the response releases
  the extension-owned captured playback resources and object URLs.
- **Downloads:** selecting Download saves the completed capture through your
  browser. The resulting file remains wherever your browser saves it.
- **Debugging:** runtime logs are off by default. Manually enabling debug logs
  sets `ae_debug` in the ChatGPT tab's local storage. A legacy playback-speed
  value may be migrated from local storage into the current settings.

## Permissions and control

The only requested extension permission is `storage`. Content scripts are
registered for ChatGPT pages. The extension does not request microphone access;
dictation remains a ChatGPT/browser feature.

You can disable automatic reading in the popup, close the player to clear the
queue, and remove downloaded files through your operating system. Settings can
be cleared through the extension's local storage or by removing the extension.

When reporting a problem, share the relevant error and reproduction steps while
omitting private conversation content. See [usage and troubleshooting](https://github.com/Tiffufu/chatgpt-read-aloud-controls/blob/main/docs/USAGE.md).
