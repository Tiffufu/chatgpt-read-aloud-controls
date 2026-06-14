# Credits

## Original project

Read Aloud Controls for ChatGPT began as a fork of **Audio Player for ChatGPT** by Ian Speckart.

Original project: https://github.com/ian-speckart/chatgpt-audio-player

The original project established the core idea of adding playback controls to ChatGPT's Read Aloud feature. This fork preserves that lineage while expanding the project into a settings-driven floating controls extension with configurable skip intervals, theme settings, capture-aware downloads, preview tooling, and a hardened extension bridge.

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

This project uses SVG icons from Heroicons.

Website: https://heroicons.com/
Repository: https://github.com/tailwindlabs/heroicons
License: https://github.com/tailwindlabs/heroicons/blob/master/LICENSE

## Non-affiliation

This extension is independently maintained and is not affiliated with OpenAI.
