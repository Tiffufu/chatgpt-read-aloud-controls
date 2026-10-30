# Credits

## Original project

Read Aloud Controls for ChatGPT began as a fork of **Audio Player for ChatGPT** by Ian Speckart.

Original project: https://github.com/ian-speckart/chatgpt-audio-player

The original project established the core idea of adding playback controls to ChatGPT's Read Aloud feature. This independently maintained derivative preserves that lineage. Its current implementation adds a redesigned expanded/minimized player, editable per-tab reading queues, optional automatic reading, configurable skip intervals, theme settings, resumable captured playback, stable timelines, capture-aware downloads, preview tooling, and an isolated settings bridge.

The screenshots in the README and usage guide show this extension's production UI, captured locally with sample responses. They replace the inherited upstream README image. The original authors and contributors are credited below.

## Upstream contributors

### @Tiffufu: Fix for ChatGPT Plus/Edu accounts

On 2026-06-13, @Tiffufu submitted a pull request to the upstream project with a fix that improved audio track detection for ChatGPT Plus/Edu accounts:

https://github.com/ian-speckart/chatgpt-audio-player/pull/5

That contribution was audited, tested, and integrated upstream by Ian Speckart before this fork diverged further.

### Mohammad J: GUI elements

On 2026-06-09, Mohammad J contributed code to the upstream project adding GUI functionality, including backward/forward buttons, playback speed, and time labels. That contribution was audited, tested, and integrated upstream by Ian Speckart.

### drengskapur: Audio download functionality

The upstream project incorporated MIT-licensed code and implementation ideas from drengskapur's ChatGPT audio enhancer work:

https://github.com/drengskapur/chatgpt-audio-enhancer/issues/1

On 2026-05-06, ChatGPT changed its audio streaming endpoint, breaking the original extension. The upstream project restored functionality using code from drengskapur's MIT-licensed project.

License: https://github.com/drengskapur/chatgpt-audio-enhancer/blob/main/LICENSE

## Icons

Some player SVG icons originate from Heroicons.

Website: https://heroicons.com/
Repository: https://github.com/tailwindlabs/heroicons
License: https://github.com/tailwindlabs/heroicons/blob/master/LICENSE

The current skip controls use the regular ArrowClockwise and ArrowCounterClockwise
paths from **Phosphor Icons**, distributed under the MIT license, extracted from
`@phosphor-icons/react` 2.1.10. The extension includes the SVG paths without adding
React or an icon package as a runtime dependency.

Repository: https://github.com/phosphor-icons/react

Full license notices for Phosphor, Heroicons, and the inherited ChatGPT Audio Enhancer code are included in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Non-affiliation

This extension is independently maintained and is not affiliated with OpenAI.
