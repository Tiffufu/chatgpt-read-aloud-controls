/**
 * Read Aloud Controls for ChatGPT.
 *
 * This extension is not affiliated with OpenAI.
 * See CREDITS.md for original project and third-party attributions.
 **/

(function () {
    'use strict';

    let audio = null;
    let controlsDiv = null;
    let titleBarDiv = null;
    let contentDiv = null;
    let playPauseBtn = null;
    let backBtn = null;
    let forwardBtn = null;
    let seekBar = null;
    let seekStatusLabel = null;
    let currentTimeLabel = null;
    let timeSeparatorLabel = null;
    let durationLabel = null;
    let trackTitleLabel = null;
    let downloadBtn = null;
    let speedBtn = null;
    let speedMenu = null;
    let minimizeBtn = null;
    let timesRowDiv = null;
    let monitorIntervalId = null;
    let uiSyncIntervalId = null;
    let audioTrackingInstalled = false;
    let isPlayerDismissed = false;

    const createSettingsApiFallback = () => {
        const playbackRateOptions = Object.freeze([0.75, 1, 1.25, 1.5, 2]);
        const theme = Object.freeze({
            SYSTEM: 'system',
            LIGHT: 'light',
            DARK: 'dark'
        });
        const defaults = Object.freeze({
            skipBackSeconds: 15,
            skipForwardSeconds: 15,
            playbackRate: 1,
            theme: theme.SYSTEM
        });
        const minSkipSeconds = 1;
        const maxSkipSeconds = 300;
        const clampSkipSeconds = (value, fallback) => {
            const numberValue = Number(value);
            if (!Number.isFinite(numberValue)) return fallback;
            return Math.min(maxSkipSeconds, Math.max(minSkipSeconds, Math.round(numberValue)));
        };
        const normalizeTheme = (value) => (
            value === theme.LIGHT || value === theme.DARK ? value : theme.SYSTEM
        );
        const isSupportedPlaybackRate = (value) => (
            playbackRateOptions.includes(Number(value))
        );
        const normalizePlaybackRate = (value, fallback = defaults.playbackRate) => {
            if (isSupportedPlaybackRate(value)) return Number(value);
            if (isSupportedPlaybackRate(fallback)) return Number(fallback);
            return defaults.playbackRate;
        };

        return Object.freeze({
            STORAGE_KEY: 'ae_player_settings',
            LEGACY_PLAYBACK_RATE_STORAGE_KEY: 'ae_playbackRate',
            MIN_SKIP_SECONDS: minSkipSeconds,
            MAX_SKIP_SECONDS: maxSkipSeconds,
            PLAYBACK_RATE_OPTIONS: playbackRateOptions,
            THEME: theme,
            DEFAULT_SETTINGS: defaults,
            isSupportedPlaybackRate,
            normalizePlaybackRate,
            normalizeSettings: (settings = {}) => ({
                skipBackSeconds: clampSkipSeconds(
                    settings.skipBackSeconds ?? settings.backJumpSeconds,
                    defaults.skipBackSeconds
                ),
                skipForwardSeconds: clampSkipSeconds(
                    settings.skipForwardSeconds ?? settings.forwardJumpSeconds,
                    defaults.skipForwardSeconds
                ),
                playbackRate: normalizePlaybackRate(
                    settings.playbackRate ?? settings.playbackSpeed ?? settings.defaultPlaybackRate
                ),
                theme: normalizeTheme(settings.theme)
            })
        });
    };

    const getSettingsApi = () => {
        const api = window.AEPlayerSettings;
        if (
            api?.DEFAULT_SETTINGS
            && api?.PLAYBACK_RATE_OPTIONS
            && typeof api.isSupportedPlaybackRate === 'function'
            && typeof api.normalizePlaybackRate === 'function'
            && typeof api.normalizeSettings === 'function'
        ) {
            return api;
        }
        console.warn('[Read Aloud Controls for ChatGPT] Shared settings module is missing; using player runtime fallback.');
        return createSettingsApiFallback();
    };

    const playerSettingsApi = getSettingsApi();

    const {
        DEFAULT_SETTINGS: DEFAULT_PLAYER_SETTINGS,
        LEGACY_PLAYBACK_RATE_STORAGE_KEY,
        PLAYBACK_RATE_OPTIONS,
        isSupportedPlaybackRate,
        normalizePlaybackRate,
        normalizeSettings
    } = playerSettingsApi;

    const normalizePlayerSettings = normalizeSettings;
    const mediaTimelineApi = window.AEPlayerMediaTimeline || {};
    const resolveMediaTimeline = typeof mediaTimelineApi.resolveMediaTimeline === 'function'
        ? mediaTimelineApi.resolveMediaTimeline
        : (mediaElement, capturedDuration = 0) => {
            const nativeDuration = Number(mediaElement?.duration);
            const fallbackDuration = Number(capturedDuration);
            const duration = Number.isFinite(nativeDuration) && nativeDuration > 0
                ? nativeDuration
                : fallbackDuration;
            if (!Number.isFinite(duration) || duration <= 0) return null;

            const rawCurrentTime = Number(mediaElement?.currentTime);
            const currentTime = Number.isFinite(rawCurrentTime)
                ? Math.min(duration, Math.max(0, rawCurrentTime))
                : 0;
            return {
                currentTime,
                duration,
                source: Number.isFinite(nativeDuration) && nativeDuration > 0 ? 'native' : 'captured',
                seekableRanges: [],
                canSeek: false
            };
        };
    const resolveSeekTarget = typeof mediaTimelineApi.resolveSeekTarget === 'function'
        ? mediaTimelineApi.resolveSeekTarget
        : () => null;
    const probeBlobDuration = typeof mediaTimelineApi.probeBlobDuration === 'function'
        ? mediaTimelineApi.probeBlobDuration
        : async () => 0;

    const getLegacyPlaybackRate = () => {
        try {
            const storedRate = localStorage.getItem(LEGACY_PLAYBACK_RATE_STORAGE_KEY);
            return isSupportedPlaybackRate(storedRate) ? Number(storedRate) : null;
        } catch (_err) {
            return null;
        }
    };

    const legacyPlaybackRate = getLegacyPlaybackRate();
    let playerSettings = normalizePlayerSettings({
        ...DEFAULT_PLAYER_SETTINGS,
        playbackRate: legacyPlaybackRate ?? DEFAULT_PLAYER_SETTINGS.playbackRate
    });
    let playbackRate = playerSettings.playbackRate;

    const CAPTURE_STATE = Object.freeze({
        IDLE: 'idle',
        LOADING: 'loading',
        READY: 'ready',
        FAILED: 'failed'
    });

    const createPlayerSession = (id = 0) => ({
        id,
        audioElement: null,
        playbackKey: '',
        captureState: CAPTURE_STATE.IDLE,
        chunks: [],
        mimeType: 'audio/aac',
        capturedDuration: 0,
        startedAt: 0,
        startedPlaySequence: 0,
        completedAt: 0
    });

    let playerSession = createPlayerSession();
    let isCollapsed = false;
    let dismissedPlaybackKey = null;
    let trackTitleAtPlaybackStart = 'Read aloud';
    let trackTitlePlaybackKey = '';
    const observedAudioElements = new Set();
    const audioPlaySequences = new WeakMap();
    let audioPlaySequence = 0;

    const DEFAULT_TRACK_TITLE = 'Read aloud';
    const PREVIEW_PATH_PATTERN = /(?:^|\/)preview\.html(?:[?#]|$)/i;
    const READ_ALOUD_RESPONSE_PATH_PATTERN = /\/backend-api\/(?:synthesize|speech\/generation)(?:[/?#]|$)/;
    const READ_ALOUD_AUDIO_ASSOCIATION_WINDOW_MS = 15000;
    const isPreviewMode = PREVIEW_PATH_PATTERN.test(window.location.href);
    let lastReadAloudResponseAt = 0;

    const debugLog = (...args) => {
        try {
            if (localStorage.getItem('ae_debug') === '1') {
                console.debug('[AE Player]', ...args);
            }
        } catch (_err) {
            // Debug logging must never affect the player runtime.
        }
    };

    const isCurrentSession = (sessionId) => playerSession.id === sessionId;
    const isReadAloudResponseUrl = (url) => READ_ALOUD_RESPONSE_PATH_PATTERN.test(`${url || ''}`);
    const hasRecentReadAloudResponse = () => (
        lastReadAloudResponseAt > 0
        && Date.now() - lastReadAloudResponseAt <= READ_ALOUD_AUDIO_ASSOCIATION_WINDOW_MS
    );
    const markReadAloudResponseSeen = () => {
        lastReadAloudResponseAt = Date.now();
    };
    const isDownloadReady = () => (
        playerSession.captureState === CAPTURE_STATE.READY && playerSession.chunks.length > 0
    );
    const getDownloadLabel = () => {
        if (isDownloadReady()) return 'Download audio';
        if (playerSession.captureState === CAPTURE_STATE.FAILED) return 'Audio download unavailable';
        return 'Audio is still loading';
    };

    const setCaptureState = (captureState, completedAt = 0) => {
        playerSession.captureState = captureState;
        playerSession.completedAt = completedAt || playerSession.completedAt;
        debugLog('capture state', {
            sessionId: playerSession.id,
            captureState: playerSession.captureState,
            chunks: playerSession.chunks.length,
            mimeType: playerSession.mimeType
        });
        updateControlState();
    };

    const previewThemeOverride = (() => {
        if (!isPreviewMode) return '';
        try {
            const value = new URLSearchParams(window.location.search).get('ae-theme');
            return value === 'light' || value === 'dark' ? value : '';
        } catch (_err) {
            return '';
        }
    })();
    const playerThemes = {
        light: {
            playerSurface: '#f4f4f1',
            menuSurface: '#fffefa',
            playerBorder: 'rgba(0,0,0,0.14)',
            playerShadow: '0 16px 36px rgba(0,0,0,0.18)',
            playerText: '#1f1f1f',
            titleText: '#202020',
            secondaryText: '#5f6368',
            controlHoverBackground: 'rgba(0,0,0,0.08)',
            dangerHoverBackground: 'rgba(220,38,38,0.11)',
            focusRing: 'rgba(0,0,0,0.16)',
            speedPillBackground: 'rgb(243,243,243)',
            speedPillText: '#2f2f2f',
            speedPillHoverBackground: '#e9e9e9',
            speedMenuText: '#2f2f2f',
            speedMenuActiveText: '#1f1f1f',
            speedMenuHoverBackground: 'rgba(0,0,0,0.045)',
            speedMenuActiveBackground: 'rgba(0,0,0,0.075)',
            speedMenuActiveHoverBackground: 'rgba(0,0,0,0.09)',
            seekTrackElapsed: '#3f3f3f',
            seekTrackRemaining: '#d9d9d9',
            seekThumb: '#d9d9d9',
            seekThumbBorder: '#cfcfcf',
            seekThumbShadow: '0 1px 3px rgba(0,0,0,0.20)'
        },
        dark: {
            playerSurface: '#28292b',
            menuSurface: 'rgba(39,40,42,0.98)',
            playerBorder: 'rgba(255,255,255,0.16)',
            playerShadow: '0 16px 36px rgba(0,0,0,0.30)',
            playerText: '#f3f0e9',
            titleText: '#ebe7dd',
            secondaryText: '#d7dce4',
            controlHoverBackground: 'rgba(255,255,255,0.12)',
            dangerHoverBackground: 'rgba(255,95,86,0.18)',
            focusRing: 'rgba(255,255,255,0.22)',
            speedPillBackground: 'rgba(255,255,255,0.10)',
            speedPillText: '#f3f3f3',
            speedPillHoverBackground: 'rgba(255,255,255,0.16)',
            speedMenuText: '#f5f3ef',
            speedMenuActiveText: '#ffffff',
            speedMenuHoverBackground: 'rgba(255,255,255,0.07)',
            speedMenuActiveBackground: 'rgba(255,255,255,0.12)',
            speedMenuActiveHoverBackground: 'rgba(255,255,255,0.14)',
            seekTrackElapsed: '#f3f3f3',
            seekTrackRemaining: '#56575a',
            seekThumb: '#f3f3f3',
            seekThumbBorder: '#f3f3f3',
            seekThumbShadow: '0 1px 4px rgba(0,0,0,0.36)'
        }
    };

    const getPreferredThemeName = () => {
        if (previewThemeOverride) return previewThemeOverride;
        if (playerSettings.theme === 'light' || playerSettings.theme === 'dark') return playerSettings.theme;
        if (typeof window.matchMedia !== 'function') return 'dark';
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    const getPlayerTheme = () => playerThemes[getPreferredThemeName()] || playerThemes.dark;
    const nakedButtonStyle = [
        'appearance:none',
        'background:none',
        'border:none',
        'padding:0',
        'margin:0',
        'color:inherit',
        'font:inherit',
        'cursor:pointer'
    ].join(';');

    const iconButtonStyle = [
        nakedButtonStyle,
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'border-radius:999px',
        'transition:background-color 120ms ease, transform 120ms ease',
        'color:inherit',
        'box-sizing:border-box',
        'flex:0 0 auto'
    ].join(';');

    const iconMarkup = {
        collapse: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="m5 15 7-7 7 7" /></svg>',
        expand: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7" /></svg>',
        close: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6 6 18" /></svg>',
        backward: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="m11 18-6-6 6-6v12Zm8 0-6-6 6-6v12Z" /></svg>',
        play: '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" class="size-6"><path d="M8.5 5.8v12.4c0 .8.9 1.3 1.6.9l9.2-6.2c.6-.4.6-1.4 0-1.8L10.1 4.9c-.7-.4-1.6.1-1.6.9Z" /></svg>',
        pause: '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" class="size-6"><path d="M7.5 5.25c0-.69.56-1.25 1.25-1.25h1.5c.69 0 1.25.56 1.25 1.25v13.5c0 .69-.56 1.25-1.25 1.25h-1.5c-.69 0-1.25-.56-1.25-1.25V5.25Zm5 0c0-.69.56-1.25 1.25-1.25h1.5c.69 0 1.25.56 1.25 1.25v13.5c0 .69-.56 1.25-1.25 1.25h-1.5c-.69 0-1.25-.56-1.25-1.25V5.25Z" /></svg>',
        forward: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="m13 6 6 6-6 6V6ZM5 6l6 6-6 6V6Z" /></svg>',
        download: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v10m0 0 4-4m-4 4-4-4M5 18h14" /></svg>'
    };

    const getButtonIdleBackground = (button) => {
        if (!button) return 'transparent';
        if (button.dataset.buttonKind === 'speed-pill') return getPlayerTheme().speedPillBackground;
        return 'transparent';
    };

    const getButtonHoverBackground = (button) => {
        if (!button || button.disabled) return getButtonIdleBackground(button);
        const theme = getPlayerTheme();
        const token = button.dataset.hoverToken || 'controlHoverBackground';
        return theme[token] || token;
    };

    const renderButtonInteractionState = (button) => {
        if (!button) return;
        const hovered = button.dataset.hovered === 'true';
        button.style.backgroundColor = hovered
            ? getButtonHoverBackground(button)
            : getButtonIdleBackground(button);
        button.style.transform = hovered && !button.disabled ? 'translateY(-1px)' : 'none';
    };

    const refreshButtonHoverState = (button, hoverToken) => {
        if (!button) return;
        if (hoverToken) button.dataset.hoverToken = hoverToken;
        if (!button.dataset.hoverToken) button.dataset.hoverToken = 'controlHoverBackground';
        renderButtonInteractionState(button);
    };

    const setButtonHoverState = (button, hoverToken = 'controlHoverBackground') => {
        if (!button) return;
        refreshButtonHoverState(button, hoverToken);
        button.addEventListener('mouseenter', () => {
            button.dataset.hovered = 'true';
            renderButtonInteractionState(button);
        });
        button.addEventListener('mouseleave', () => {
            button.dataset.hovered = 'false';
            renderButtonInteractionState(button);
        });
    };

    const getSvgSize = (button) => {
        const buttonSize = Number(button.dataset.buttonSize || 0);
        if (buttonSize >= 40) return 22;
        if (buttonSize >= 34) return 19;
        return 18;
    };

    const renderIconButton = (button, {
        iconName,
        label,
        size,
        enabled = !button.disabled,
        tone = 'default',
        hoverToken
    }) => {
        if (!button) return;

        const nextSize = Number(size || button.dataset.buttonSize || 24);
        button.type = 'button';
        button.dataset.buttonKind = 'icon';
        button.dataset.buttonTone = tone;
        button.dataset.buttonSize = String(nextSize);
        if (hoverToken) button.dataset.hoverToken = hoverToken;
        if (!button.dataset.hoverToken) button.dataset.hoverToken = 'controlHoverBackground';
        button.disabled = !enabled;
        button.style.cssText = `${iconButtonStyle};width:${nextSize}px;height:${nextSize}px;`;
        button.style.opacity = enabled ? '1' : '0.45';
        button.style.cursor = enabled ? 'pointer' : 'default';

        if (button.dataset.iconName !== iconName) {
            button.innerHTML = iconMarkup[iconName] || '';
            button.dataset.iconName = iconName;
        }

        if (button.getAttribute('aria-label') !== label || button.title !== label) {
            button.setAttribute('aria-label', label);
            button.title = label;
        }

        const svg = button.querySelector('svg');
        if (svg) {
            const svgSize = getSvgSize(button);
            svg.style.width = `${svgSize}px`;
            svg.style.height = `${svgSize}px`;
            svg.style.display = 'block';
        }

        renderButtonInteractionState(button);
    };

    const setIconButton = (button, iconName, label, size = 24, hoverToken) => {
        renderIconButton(button, { iconName, label, size, enabled: true, hoverToken });
        setButtonHoverState(button, hoverToken);
    };

    const refreshIconButton = (button, iconName, label, options = {}) => {
        if (!button) return;
        renderIconButton(button, {
            iconName,
            label,
            size: Number(button.dataset.buttonSize || options.size || 24),
            enabled: options.enabled ?? !button.disabled,
            tone: options.tone || button.dataset.buttonTone || 'default',
            hoverToken: options.hoverToken
        });
    };

    const createIconButton = (iconName, label, size = 24, hoverToken) => {
        const button = document.createElement('button');
        setIconButton(button, iconName, label, size, hoverToken);
        return button;
    };

    const ensurePlayerStyles = () => {
        if (document.getElementById('ae_enhanced_player_styles')) return;

        const style = document.createElement('style');
        style.id = 'ae_enhanced_player_styles';
        style.textContent = `
            #ae_enhanced_player .ae_seek_bar {
                --ae-seek-progress: 0%;
                -webkit-appearance: none;
                appearance: none;
                background:
                    linear-gradient(
                        to right,
                        var(--ae-seek-track-elapsed) 0%,
                        var(--ae-seek-track-elapsed) var(--ae-seek-progress),
                        var(--ae-seek-track-remaining) var(--ae-seek-progress),
                        var(--ae-seek-track-remaining) 100%
                    )
                    center / 100% 7px no-repeat;
                cursor: pointer;
                direction: ltr;
                height: 20px;
                margin: 0;
                border-radius: 999px;
                width: 100%;
            }

            #ae_enhanced_player .ae_seek_bar:focus {
                outline: none;
            }

            #ae_enhanced_player .ae_seek_bar::-webkit-slider-runnable-track {
                background: transparent;
                border: 0;
                border-radius: 999px;
                height: 7px;
            }

            #ae_enhanced_player .ae_seek_bar::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                background: var(--ae-seek-thumb);
                border: 1px solid var(--ae-seek-thumb-border);
                border-radius: 999px;
                box-shadow: var(--ae-seek-thumb-shadow);
                height: 16px;
                margin-top: -4.5px;
                width: 16px;
            }

            #ae_enhanced_player .ae_seek_bar:focus-visible::-webkit-slider-thumb {
                box-shadow: var(--ae-seek-thumb-shadow), 0 0 0 3px var(--ae-focus-ring);
            }

            #ae_enhanced_player .ae_seek_bar::-moz-range-track {
                background: transparent;
                border: 0;
                border-radius: 999px;
                height: 7px;
            }

            #ae_enhanced_player .ae_seek_bar::-moz-range-progress {
                background: var(--ae-seek-track-elapsed);
                border-radius: 999px;
                height: 7px;
            }

            #ae_enhanced_player .ae_seek_bar::-moz-range-thumb {
                background: var(--ae-seek-thumb);
                border: 1px solid var(--ae-seek-thumb-border);
                border-radius: 999px;
                box-shadow: var(--ae-seek-thumb-shadow);
                height: 16px;
                width: 16px;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    };

    const formatRate = (rate) => `${String(rate).replace(/\.0$/, '')}x`;

    const formatTime = (seconds) => {
        if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    const getEffectivePlaybackRate = () => normalizePlaybackRate(playbackRate);

    const getAudioTimeline = () => resolveMediaTimeline(
        audio,
        audio && audio === playerSession.audioElement ? playerSession.capturedDuration : 0
    );

    const getSpeedAdjustedTime = (seconds) => {
        if (!Number.isFinite(seconds) || seconds < 0) return Number.NaN;
        return seconds / getEffectivePlaybackRate();
    };

    const getTrackTitle = () => {
        const title = `${document.title || ''}`
            .replace(/\s+[-|–—]\s+ChatGPT$/i, '')
            .replace(/^ChatGPT\s+[-|–—]\s+/i, '')
            .trim();

        return title || DEFAULT_TRACK_TITLE;
    };

    const isAudioElement = (element) => (
        typeof HTMLAudioElement !== 'undefined'
        && element instanceof HTMLAudioElement
    );

    const getAudioSource = (element) => {
        if (!element) return '';
        return `${element.currentSrc || element.src || ''}`;
    };

    const hasElementSource = (element) => Boolean(element && (getAudioSource(element) || element.srcObject));

    const rememberAudioElement = (element) => {
        if (isAudioElement(element)) observedAudioElements.add(element);
        return element;
    };

    const getKnownAudioElements = () => Array.from(new Set([
        ...observedAudioElements,
        ...document.querySelectorAll('audio')
    ])).filter(isAudioElement);

    const pauseAudioElement = (element) => {
        if (!element || element.paused || element.ended) return;
        element.pause?.();
    };

    const hasAudioSource = (element = audio) => hasElementSource(element);

    const getPlaybackKey = (element) => {
        if (!element) return '';
        const source = getAudioSource(element);
        if (source) return source;
        if (element.srcObject) return `srcObject:${element.srcObject.id || 'stream'}`;
        return '';
    };

    const isCurrentReadAloudSessionAudio = (element) => {
        if (!element || playerSession.captureState === CAPTURE_STATE.IDLE) return false;

        const playbackKey = getPlaybackKey(element);
        return (
            element === playerSession.audioElement
            || Boolean(playbackKey && playbackKey === playerSession.playbackKey)
        );
    };

    const isReadAloudAudioElement = (element) => {
        if (!element) return false;

        const source = getAudioSource(element);
        if (source && isReadAloudResponseUrl(source)) return true;
        if (isCurrentReadAloudSessionAudio(element)) return true;
        if (element.srcObject) return false;

        return Boolean(source && hasRecentReadAloudResponse());
    };

    const bindReadAloudSessionToAudio = (element, playSequence = audioPlaySequences.get(element) || 0) => {
        if (!element || playerSession.captureState === CAPTURE_STATE.IDLE) return false;

        const playbackKey = getPlaybackKey(element);
        if (!playbackKey) return false;

        const ownedAudio = playerSession.audioElement;
        const hasValidOwner = hasElementSource(ownedAudio) && !ownedAudio.ended;
        if (hasValidOwner && element !== ownedAudio) return false;

        if (element !== ownedAudio && playSequence <= playerSession.startedPlaySequence) {
            return false;
        }

        playerSession.audioElement = element;
        playerSession.playbackKey = playbackKey;
        audio = element;
        audio.playbackRate = playbackRate;
        debugLog('session audio bound', {
            sessionId: playerSession.id,
            playbackKey,
            playSequence
        });
        return true;
    };

    const clearPlayerDismissal = () => {
        dismissedPlaybackKey = null;
        isPlayerDismissed = false;
    };

    const dismissPlayerForAudio = (element) => {
        isPlayerDismissed = true;
        dismissedPlaybackKey = getPlaybackKey(element) || trackTitlePlaybackKey || dismissedPlaybackKey;
    };

    const isDismissedPlayback = (element) => (
        isPlayerDismissed
        && (!dismissedPlaybackKey || dismissedPlaybackKey === getPlaybackKey(element))
    );

    const getObservedAudio = () => {
        const audioElements = getKnownAudioElements().filter((element) => (
            isReadAloudAudioElement(element)
            && (element === playerSession.audioElement
                || (audioPlaySequences.get(element) || 0) > playerSession.startedPlaySequence)
        ));

        if (!audioElements.length) return null;

        return audioElements
            .map((element, index) => {
                let score = index;
                const source = getAudioSource(element);

                if (hasAudioSource(element)) score += 100;
                if (source && isReadAloudResponseUrl(source)) score += 250;
                if (element === audio) score += 20;
                if (element === playerSession.audioElement) score += 20;
                if (!element.paused && !element.ended) score += 1000;
                if (Number.isFinite(element.currentTime) && element.currentTime > 0) score += 50;
                if (Number.isFinite(element.duration) && element.duration > 0) score += 25;
                if (element.readyState > 0) score += 10;
                if (element.ended) score -= 100;

                return { element, score };
            })
            .sort((a, b) => b.score - a.score)[0].element;
    };

    const setButtonEnabled = (button, enabled) => {
        if (!button) return;
        if (button.dataset.buttonKind === 'icon') {
            refreshIconButton(button, button.dataset.iconName || 'play', button.getAttribute('aria-label') || button.title || '', { enabled });
            return;
        }
        button.disabled = !enabled;
        button.style.opacity = enabled ? '1' : '0.45';
        button.style.cursor = enabled ? 'pointer' : 'default';
        renderButtonInteractionState(button);
    };

    const updateJumpButtonLabels = () => {
        refreshIconButton(backBtn, 'backward', `Skip back ${playerSettings.skipBackSeconds} seconds`);
        refreshIconButton(forwardBtn, 'forward', `Skip forward ${playerSettings.skipForwardSeconds} seconds`);
    };

    const applyPlayerSettings = (settings = {}) => {
        playerSettings = normalizePlayerSettings({ ...playerSettings, ...settings });
        playbackRate = playerSettings.playbackRate;
        const currentAudio = playerSession.audioElement || audio;
        if (currentAudio) currentAudio.playbackRate = playbackRate;
        updateJumpButtonLabels();
        applyTheme();
        updateControlState();
    };

    const SETTINGS_EVENT = 'ae-read-aloud-player:settings';
    const SETTINGS_REQUEST_EVENT = 'ae-read-aloud-player:settings-request';
    const SETTINGS_UPDATE_REQUEST_EVENT = 'ae-read-aloud-player:settings-update-request';

    const requestPlayerSettings = () => {
        document.dispatchEvent(new CustomEvent(SETTINGS_REQUEST_EVENT));
    };

    const requestPlayerSettingsUpdate = (settings) => {
        document.dispatchEvent(new CustomEvent(SETTINGS_UPDATE_REQUEST_EVENT, {
            detail: { settings }
        }));
    };

    const migrateLegacyPlaybackRate = () => {
        if (legacyPlaybackRate === null) return;

        if (legacyPlaybackRate !== DEFAULT_PLAYER_SETTINGS.playbackRate) {
            requestPlayerSettingsUpdate({ playbackRate: legacyPlaybackRate });
        }

        try {
            localStorage.removeItem(LEGACY_PLAYBACK_RATE_STORAGE_KEY);
        } catch (_err) {
            // Legacy storage cleanup should never affect playback.
        }
    };

    const closeSpeedMenu = () => {
        if (!speedMenu) return;
        speedMenu.style.display = 'none';
    };

    const updateTrackTitle = () => {
        if (!trackTitleLabel) return;
        const title = trackTitleAtPlaybackStart || DEFAULT_TRACK_TITLE;
        trackTitleLabel.textContent = title;
        trackTitleLabel.title = title;
    };

    const captureTrackTitleForPlayback = (playbackKey) => {
        trackTitleAtPlaybackStart = getTrackTitle();
        trackTitlePlaybackKey = playbackKey || '';
        updateTrackTitle();
    };

    const applyTheme = () => {
        if (!controlsDiv) return;

        const themeName = getPreferredThemeName();
        const theme = getPlayerTheme();

        controlsDiv.style.background = theme.playerSurface;
        controlsDiv.style.borderColor = theme.playerBorder;
        controlsDiv.style.boxShadow = theme.playerShadow;
        controlsDiv.style.color = theme.playerText;
        controlsDiv.style.colorScheme = themeName;
        controlsDiv.style.setProperty('--ae-focus-ring', theme.focusRing);
        controlsDiv.style.setProperty('--ae-seek-track-elapsed', theme.seekTrackElapsed);
        controlsDiv.style.setProperty('--ae-seek-track-remaining', theme.seekTrackRemaining);
        controlsDiv.style.setProperty('--ae-seek-thumb', theme.seekThumb);
        controlsDiv.style.setProperty('--ae-seek-thumb-border', theme.seekThumbBorder);
        controlsDiv.style.setProperty('--ae-seek-thumb-shadow', theme.seekThumbShadow);

        if (titleBarDiv) {
            titleBarDiv.style.background = theme.playerSurface;
        }

        if (contentDiv) {
            contentDiv.style.background = theme.playerSurface;
        }

        if (trackTitleLabel) {
            trackTitleLabel.style.color = theme.titleText;
        }

        if (speedBtn) {
            speedBtn.style.color = theme.speedPillText;
            refreshButtonHoverState(speedBtn, 'speedPillHoverBackground');
        }

        if (speedMenu) {
            speedMenu.style.background = theme.menuSurface;
            speedMenu.style.borderColor = theme.playerBorder;
            speedMenu.style.boxShadow = theme.playerShadow;
        }

        if (seekStatusLabel) {
            seekStatusLabel.style.color = theme.secondaryText;
        }

        if (timesRowDiv) {
            timesRowDiv.style.color = theme.secondaryText;
        }

        if (controlsDiv) {
            controlsDiv.querySelectorAll('button[data-hover-token]').forEach((button) => {
                refreshButtonHoverState(button);
            });
        }

        updateSpeedUi();
    };

    const installThemeListener = () => {
        if (typeof window.matchMedia !== 'function') return;

        const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const onThemeChange = () => applyTheme();

        if (typeof colorSchemeQuery.addEventListener === 'function') {
            colorSchemeQuery.addEventListener('change', onThemeChange);
            return;
        }

        if (typeof colorSchemeQuery.addListener === 'function') {
            colorSchemeQuery.addListener(onThemeChange);
        }
    };

    const renderSpeedOptionButton = (optionBtn) => {
        if (!optionBtn) return;
        const theme = getPlayerTheme();
        const isActive = Number(optionBtn.dataset.rate) === playbackRate;
        const isHovered = optionBtn.dataset.hovered === 'true';

        optionBtn.style.fontWeight = isActive ? '700' : '400';
        optionBtn.style.color = isActive ? theme.speedMenuActiveText : theme.speedMenuText;
        if (isActive && isHovered) {
            optionBtn.style.backgroundColor = theme.speedMenuActiveHoverBackground || theme.speedMenuActiveBackground;
        } else if (isActive) {
            optionBtn.style.backgroundColor = theme.speedMenuActiveBackground;
        } else if (isHovered) {
            optionBtn.style.backgroundColor = theme.speedMenuHoverBackground;
        } else {
            optionBtn.style.backgroundColor = 'transparent';
        }
    };

    const setSpeedOptionHoverState = (optionBtn) => {
        if (!optionBtn) return;
        optionBtn.addEventListener('mouseenter', () => {
            optionBtn.dataset.hovered = 'true';
            renderSpeedOptionButton(optionBtn);
        });
        optionBtn.addEventListener('mouseleave', () => {
            optionBtn.dataset.hovered = 'false';
            renderSpeedOptionButton(optionBtn);
        });
    };

    const updateSpeedUi = () => {
        if (speedBtn) speedBtn.textContent = formatRate(playbackRate);
        if (!speedMenu) return;

        speedMenu.querySelectorAll('button[data-rate]').forEach(renderSpeedOptionButton);
    };

    const updateTimeDisplay = () => {
        const timeline = getAudioTimeline();
        const hasDuration = Boolean(timeline);
        const currentListeningTime = getSpeedAdjustedTime(timeline?.currentTime);
        const totalListeningTime = getSpeedAdjustedTime(timeline?.duration);
        const rateLabel = formatRate(getEffectivePlaybackRate());

        if (currentTimeLabel) {
            currentTimeLabel.textContent = formatTime(currentListeningTime);
            currentTimeLabel.title = hasDuration ? `Elapsed listening time at ${rateLabel}` : '';
            currentTimeLabel.style.display = hasDuration ? '' : 'none';
        }

        if (timeSeparatorLabel) {
            timeSeparatorLabel.style.display = hasDuration ? '' : 'none';
        }

        if (durationLabel) {
            durationLabel.textContent = formatTime(totalListeningTime);
            durationLabel.title = hasDuration ? `Total listening time at ${rateLabel}` : '';
            durationLabel.style.display = hasDuration ? '' : 'none';
        }

        if (!seekBar) return;

        if (hasDuration) {
            if (seekStatusLabel) seekStatusLabel.style.display = 'none';
            seekBar.style.display = 'block';
            seekBar.disabled = !timeline.canSeek;
            seekBar.style.opacity = timeline.canSeek ? '1' : '0.65';
            seekBar.style.cursor = timeline.canSeek ? 'pointer' : 'default';
            const seekRatio = Number.isFinite(timeline.currentTime)
                ? Math.min(1, Math.max(0, timeline.currentTime / timeline.duration))
                : 0;
            seekBar.value = String(Math.round(seekRatio * 1000));
            seekBar.style.setProperty('--ae-seek-progress', `${seekRatio * 100}%`);
            return;
        }

        if (seekStatusLabel) {
            seekStatusLabel.textContent = hasAudioSource() ? 'Loading seekbar...' : 'Seek unavailable';
            seekStatusLabel.style.display = 'block';
        }
        seekBar.style.display = 'none';
        seekBar.disabled = true;
        seekBar.style.opacity = '0.45';
        seekBar.style.cursor = 'default';
        seekBar.value = '0';
        seekBar.style.setProperty('--ae-seek-progress', '0%');
    };

    const updatePlayPauseLabel = () => {
        if (!playPauseBtn) return;

        refreshIconButton(
            playPauseBtn,
            hasAudioSource() && audio && !audio.paused ? 'pause' : 'play',
            hasAudioSource() && audio && !audio.paused ? 'Pause' : 'Play'
        );
    };

    const updateDownloadButtonState = () => {
        if (!downloadBtn) return;

        if (!isDownloadReady()) {
            refreshIconButton(downloadBtn, 'download', getDownloadLabel(), { enabled: false });
            return;
        }

        refreshIconButton(downloadBtn, 'download', 'Download audio', { enabled: true, tone: 'default' });
    };

    const updateControlState = () => {
        const currentAudio = playerSession.audioElement || audio;
        if (currentAudio) audio = currentAudio;
        const canControlPlayback = hasAudioSource(currentAudio);
        const canSeek = Boolean(getAudioTimeline()?.canSeek);

        updateDownloadButtonState();
        setButtonEnabled(playPauseBtn, canControlPlayback);
        setButtonEnabled(backBtn, canControlPlayback && canSeek);
        setButtonEnabled(forwardBtn, canControlPlayback && canSeek);
        setButtonEnabled(speedBtn, canControlPlayback);

        updateSpeedUi();
        updatePlayPauseLabel();
        updateTimeDisplay();
    };

    const applyPlaybackRate = (nextRate) => {
        playerSettings = normalizePlayerSettings({
            ...playerSettings,
            playbackRate: normalizePlaybackRate(nextRate, playbackRate)
        });
        playbackRate = playerSettings.playbackRate;
        const currentAudio = playerSession.audioElement || audio;
        if (currentAudio) currentAudio.playbackRate = playbackRate;
        requestPlayerSettingsUpdate({ playbackRate });
        updateSpeedUi();
        updateTimeDisplay();
        closeSpeedMenu();
    };

    const downloadAudio = () => {
        if (!isDownloadReady()) return;
        const { chunks, mimeType } = playerSession;
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const extension = mimeType.includes('mpeg')
            ? 'mp3'
            : mimeType.includes('wav')
                ? 'wav'
                : mimeType.includes('aac')
                    ? 'aac'
                    : 'bin';
        const a = Object.assign(document.createElement('a'), {
            href: url,
            download: `ChatGPT_Read_Aloud_${Date.now()}.${extension}`,
            style: 'display:none'
        });
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const stopUiSync = () => {
        if (!uiSyncIntervalId) return;
        clearInterval(uiSyncIntervalId);
        uiSyncIntervalId = null;
    };

    const teardownControls = () => {
        isCollapsed = false;
        closeSpeedMenu();
        stopUiSync();

        if (controlsDiv) {
            controlsDiv.remove();
            controlsDiv = null;
        }

        titleBarDiv = null;
        contentDiv = null;
        playPauseBtn = null;
        backBtn = null;
        forwardBtn = null;
        seekBar = null;
        seekStatusLabel = null;
        currentTimeLabel = null;
        timeSeparatorLabel = null;
        durationLabel = null;
        trackTitleLabel = null;
        downloadBtn = null;
        speedBtn = null;
        speedMenu = null;
        minimizeBtn = null;
        timesRowDiv = null;
    };

    const closePlayer = () => {
        const currentAudio = getActiveAudio();

        if (currentAudio) {
            dismissPlayerForAudio(currentAudio);
        }

        try {
            pauseAudioElement(currentAudio);
        } catch (err) {
            console.error('[Read Aloud Controls for ChatGPT] Failed to pause audio while closing player', err);
        } finally {
            teardownControls();
        }
    };

    const toggleCollapsed = () => {
        isCollapsed = !isCollapsed;
        if (contentDiv) contentDiv.style.display = isCollapsed ? 'none' : 'grid';
        if (titleBarDiv) titleBarDiv.style.borderRadius = isCollapsed ? '14px' : '14px 14px 0 0';
        if (minimizeBtn) {
            refreshIconButton(minimizeBtn, isCollapsed ? 'expand' : 'collapse', isCollapsed ? 'Show timeline' : 'Hide timeline');
        }
    };

    const beginDrag = (event) => {
        if (!controlsDiv || event.button !== 0) return;
        if (event.target.closest('button')) return;

        const clickStartedOnTitle = event.target === trackTitleLabel || trackTitleLabel?.contains(event.target);

        const startClientX = event.clientX;
        const startClientY = event.clientY;
        let didDrag = false;

        const rect = controlsDiv.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;

        controlsDiv.style.left = `${rect.left}px`;
        controlsDiv.style.top = `${rect.top}px`;
        controlsDiv.style.transform = 'none';

        const onMouseMove = (moveEvent) => {
            const movementX = moveEvent.clientX - startClientX;
            const movementY = moveEvent.clientY - startClientY;

            if (Math.hypot(movementX, movementY) > 4) {
                didDrag = true;
            }

            const width = controlsDiv.offsetWidth;
            const height = controlsDiv.offsetHeight;
            const nextLeft = Math.min(
                Math.max(12, moveEvent.clientX - offsetX),
                Math.max(12, window.innerWidth - width - 12)
            );
            const nextTop = Math.min(
                Math.max(12, moveEvent.clientY - offsetY),
                Math.max(12, window.innerHeight - height - 12)
            );

            controlsDiv.style.left = `${nextLeft}px`;
            controlsDiv.style.top = `${nextTop}px`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            if (clickStartedOnTitle && !didDrag) {
                toggleCollapsed();
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        event.preventDefault();
    };

    const createSpeedMenu = () => {
        const theme = getPlayerTheme();
        speedMenu = document.createElement('div');
        speedMenu.style.cssText = [
            'position:absolute',
            'top:calc(100% + 8px)',
            'left:0',
            'display:none',
            'min-width:86px',
            'padding:6px',
            `border:1px solid ${theme.playerBorder}`,
            'border-radius:12px',
            `background:${theme.menuSurface}`,
            `box-shadow:${theme.playerShadow}`,
            'z-index:2'
        ].join(';');

        PLAYBACK_RATE_OPTIONS.forEach((rate) => {
            const optionBtn = document.createElement('button');
            optionBtn.type = 'button';
            optionBtn.dataset.rate = String(rate);
            optionBtn.textContent = formatRate(rate);
            optionBtn.dataset.hovered = 'false';
            optionBtn.style.cssText = `${nakedButtonStyle};display:block;width:100%;height:30px;padding:0 10px;border-radius:8px;text-align:left;font-size:13px;transition:background-color 120ms ease;`;
            setSpeedOptionHoverState(optionBtn);
            optionBtn.onclick = (event) => {
                event.stopPropagation();
                applyPlaybackRate(rate);
            };
            speedMenu.appendChild(optionBtn);
        });

        return speedMenu;
    };

    const buildControls = () => {
        if (controlsDiv) return;

        const themeName = getPreferredThemeName();
        const theme = getPlayerTheme();
        ensurePlayerStyles();

        controlsDiv = document.createElement('div');
        controlsDiv.id = 'ae_enhanced_player';
        controlsDiv.style.cssText = [
            'position:fixed',
            'top:24px',
            'left:50%',
            'transform:translateX(-50%)',
            'z-index:2147483647',
            'width:min(560px, calc(100vw - 20px))',
            'border-radius:14px',
            'overflow:visible',
            `border:1px solid ${theme.playerBorder}`,
            `box-shadow:${theme.playerShadow}`,
            `color:${theme.playerText}`,
            'font-family:"Segoe UI", sans-serif',
            'font-size:14px',
            `background:${theme.playerSurface}`,
            `color-scheme:${themeName}`,
            'box-sizing:border-box'
        ].join(';');

        const titleBar = document.createElement('div');
        titleBar.style.cssText = [
            'display:grid',
            'grid-template-columns:minmax(120px, 1fr) auto auto',
            'align-items:center',
            'gap:8px',
            'min-height:50px',
            'padding:7px 10px 7px 12px',
            `background:${theme.playerSurface}`,
            'border-radius:14px 14px 0 0',
            'cursor:move',
            'user-select:none',
            'box-sizing:border-box'
        ].join(';');
        titleBar.onmousedown = beginDrag;
        titleBarDiv = titleBar;

        trackTitleLabel = document.createElement('div');
        trackTitleLabel.style.cssText = `min-width:0;font-size:14px;font-weight:650;line-height:1.25;letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${theme.titleText};`;
        trackTitleLabel.setAttribute('role', 'button');
        trackTitleLabel.setAttribute('tabindex', '0');
        trackTitleLabel.setAttribute('aria-label', 'Toggle timeline');
        trackTitleLabel.title = 'Drag to move. Click to show or hide timeline.';
        trackTitleLabel.onkeydown = (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggleCollapsed();
        };

        const playbackGroup = document.createElement('div');
        playbackGroup.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:6px;';

        const titleBarButtons = document.createElement('div');
        titleBarButtons.style.cssText = 'display:flex;align-items:center;gap:4px;';

        minimizeBtn = createIconButton('collapse', 'Hide timeline', 36);
        minimizeBtn.onclick = toggleCollapsed;

        const closeBtn = createIconButton('close', 'Close player', 36, 'dangerHoverBackground');
        closeBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            closePlayer();
        });

        contentDiv = document.createElement('div');
        contentDiv.style.cssText = [
            'display:grid',
            'gap:5px',
            'padding:0 14px 9px',
            `background:${theme.playerSurface}`,
            'border-radius:0 0 14px 14px',
            'box-sizing:border-box'
        ].join(';');

        speedBtn = document.createElement('button');
        speedBtn.type = 'button';
        speedBtn.dataset.buttonKind = 'speed-pill';
        speedBtn.title = 'Playback speed';
        speedBtn.style.cssText = `${nakedButtonStyle};height:28px;min-width:58px;padding:0 10px;border-radius:999px;background:${theme.speedPillBackground};font-size:13px;font-weight:650;color:${theme.speedPillText};text-align:center;`;
        setButtonHoverState(speedBtn, 'speedPillHoverBackground');
        speedBtn.onclick = (event) => {
            event.stopPropagation();
            if (!speedMenu) return;
            speedMenu.style.display = speedMenu.style.display === 'block' ? 'none' : 'block';
        };

        const leftTimesContainer = document.createElement('div');
        leftTimesContainer.style.cssText = 'position:relative;display:flex;align-items:center;';
        leftTimesContainer.append(speedBtn, createSpeedMenu());

        seekStatusLabel = document.createElement('div');
        seekStatusLabel.style.cssText = `display:none;text-align:center;font-size:13px;color:${theme.secondaryText};white-space:nowrap;`;
        seekStatusLabel.textContent = 'Loading seekbar...';

        seekBar = document.createElement('input');
        seekBar.className = 'ae_seek_bar';
        seekBar.type = 'range';
        seekBar.min = '0';
        seekBar.max = '1000';
        seekBar.value = '0';
        seekBar.style.cssText = 'width:100%;min-width:0;cursor:pointer;';
        seekBar.oninput = () => {
            const currentAudio = getActiveAudio();
            const timeline = getAudioTimeline();
            if (!currentAudio || !timeline?.canSeek) return;

            const requestedTime = (Number(seekBar.value) / 1000) * timeline.duration;
            const direction = requestedTime < currentAudio.currentTime ? 'backward' : 'forward';
            const safeTarget = resolveSeekTarget(currentAudio, requestedTime, direction);
            if (safeTarget === null) {
                updateTimeDisplay();
                return;
            }

            currentAudio.currentTime = safeTarget;
            updateTimeDisplay();
        };

        const timesRow = document.createElement('div');
        timesRow.style.cssText = `display:grid;grid-template-columns:auto minmax(8ch, 1fr) auto;align-items:center;font-size:13px;font-variant-numeric:tabular-nums;color:${theme.secondaryText};gap:10px;min-height:28px;`;
        timesRowDiv = timesRow;

        const timeGroup = document.createElement('div');
        timeGroup.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:4px;min-width:0;white-space:nowrap;';

        currentTimeLabel = document.createElement('span');
        currentTimeLabel.style.cssText = 'text-align:right;';
        currentTimeLabel.textContent = '0:00';

        timeSeparatorLabel = document.createElement('span');
        timeSeparatorLabel.textContent = '/';
        timeSeparatorLabel.style.cssText = 'opacity:0.55;';

        durationLabel = document.createElement('span');
        durationLabel.style.cssText = 'text-align:left;';
        durationLabel.textContent = '--:--';

        timeGroup.append(currentTimeLabel, timeSeparatorLabel, durationLabel, seekStatusLabel);

        const rightGroup = document.createElement('div');
        rightGroup.style.cssText = 'display:flex;justify-content:flex-end;align-items:center;';

        backBtn = createIconButton('backward', `Skip back ${playerSettings.skipBackSeconds} seconds`, 36);
        backBtn.onclick = () => {
            const currentAudio = getActiveAudio();
            if (!currentAudio) return;
            audio = currentAudio;
            const requestedTime = Math.max(0, audio.currentTime - playerSettings.skipBackSeconds);
            const safeTarget = resolveSeekTarget(audio, requestedTime, 'backward');
            if (safeTarget === null) return;
            audio.currentTime = safeTarget;
            updateTimeDisplay();
        };

        playPauseBtn = createIconButton('play', 'Play', 40);
        playPauseBtn.onclick = () => {
            const currentAudio = getActiveAudio();
            if (!currentAudio) {
                return;
            }

            audio = currentAudio;

            if (!hasAudioSource()) {
                return;
            }

            if (audio.paused) {
                audio.play?.().catch?.(console.error);
                return;
            }
            audio.pause?.();
        };

        forwardBtn = createIconButton('forward', `Skip forward ${playerSettings.skipForwardSeconds} seconds`, 36);
        forwardBtn.onclick = () => {
            const currentAudio = getActiveAudio();
            if (!currentAudio) return;
            audio = currentAudio;
            const requestedTime = audio.currentTime + playerSettings.skipForwardSeconds;
            const safeTarget = resolveSeekTarget(audio, requestedTime, 'forward');
            if (safeTarget === null) return;
            audio.currentTime = safeTarget;
            updateTimeDisplay();
        };

        downloadBtn = createIconButton('download', 'Download audio', 36);
        downloadBtn.onclick = downloadAudio;

        playbackGroup.append(backBtn, playPauseBtn, forwardBtn);
        titleBarButtons.append(minimizeBtn, closeBtn);
        titleBar.append(trackTitleLabel, playbackGroup, titleBarButtons);
        rightGroup.append(downloadBtn);
        timesRow.append(leftTimesContainer, timeGroup, rightGroup);
        contentDiv.append(seekBar, timesRow);
        controlsDiv.append(titleBar, contentDiv);
        document.body.appendChild(controlsDiv);

        updateTrackTitle();
        updateJumpButtonLabels();
        applyTheme();
        updateSpeedUi();
        updateControlState();
    };

    const ensureBody = async () => {
        if (document.body) return;
        await new Promise((resolve) => window.addEventListener('DOMContentLoaded', resolve, { once: true }));
    };

    const syncPlayerUi = () => {
        if (!controlsDiv) return;

        const currentAudio = getActiveAudio();
        if (currentAudio) {
            audio = currentAudio;
            audio.playbackRate = playbackRate;
        }
        updateControlState();

        if (!hasAudioSource(currentAudio) && controlsDiv) {
            teardownControls();
        }
    };

    const startUiSync = () => {
        if (uiSyncIntervalId || document.visibilityState !== 'visible') return;
        uiSyncIntervalId = setInterval(syncPlayerUi, 100);
        syncPlayerUi();
    };

    const resolveCapturedDuration = async (sessionId) => {
        if (!isCurrentSession(sessionId) || playerSession.chunks.length < 1) return;

        const blob = new Blob(playerSession.chunks, { type: playerSession.mimeType });
        const duration = await probeBlobDuration(blob);
        if (!isCurrentSession(sessionId) || !Number.isFinite(duration) || duration <= 0) return;

        playerSession.capturedDuration = duration;
        debugLog('captured duration ready', { sessionId, duration });
        updateControlState();
    };

    const collectDownloadStream = async (response, sessionId) => {
        let captureCompleted = false;

        try {
            if (response.body) {
                const reader = response.body.getReader();
                while (isCurrentSession(sessionId)) {
                    const { done, value } = await reader.read();
                    if (done) {
                        captureCompleted = true;
                        break;
                    }
                    if (value) playerSession.chunks.push(value);
                }
            } else {
                const buffer = await response.arrayBuffer();
                if (!isCurrentSession(sessionId)) return;
                playerSession.chunks.push(new Uint8Array(buffer));
                captureCompleted = true;
            }

            if (!isCurrentSession(sessionId)) return;

            const captureState = captureCompleted && playerSession.chunks.length > 0
                ? CAPTURE_STATE.READY
                : CAPTURE_STATE.FAILED;
            setCaptureState(captureState, Date.now());

            if (captureState === CAPTURE_STATE.READY) {
                resolveCapturedDuration(sessionId).catch((error) => {
                    debugLog('captured duration unavailable', {
                        sessionId,
                        error: error?.message || `${error}`
                    });
                });
            }
        } catch (err) {
            if (!isCurrentSession(sessionId) || err?.name === 'AbortError') return;
            setCaptureState(CAPTURE_STATE.FAILED, Date.now());
            console.error('[Read Aloud Controls for ChatGPT] Download capture failed', err);
        }
    };

    const getActiveAudio = () => {
        if (hasElementSource(playerSession.audioElement)) return playerSession.audioElement;
        if (isPreviewMode) return audio;

        const observedAudio = getObservedAudio();
        if (observedAudio && bindReadAloudSessionToAudio(observedAudio)) return observedAudio;
        return null;
    };

    const captureDownloadAudio = (response) => {
        markReadAloudResponseSeen();

        const sessionId = playerSession.id + 1;
        playerSession = {
            ...createPlayerSession(sessionId),
            captureState: CAPTURE_STATE.LOADING,
            mimeType: response.headers.get('content-type')?.split(';')[0] || 'audio/aac',
            startedAt: Date.now(),
            startedPlaySequence: audioPlaySequence
        };
        audio = null;
        debugLog('capture started', {
            sessionId: playerSession.id,
            playbackKey: playerSession.playbackKey,
            mimeType: playerSession.mimeType
        });
        updateControlState();
        collectDownloadStream(response, sessionId);
    };

    const getFetchUrl = (input) => {
        if (input instanceof Request) return input.url;
        if (input && typeof input === 'object' && 'url' in input) return input.url;
        return `${input || ''}`;
    };

    const isSpeechResponse = (url) => isReadAloudResponseUrl(url);

    const checkObservedAudio = async () => {
        await ensureBody();

        const nextAudio = hasElementSource(playerSession.audioElement)
            ? playerSession.audioElement
            : getObservedAudio();
        const previousKey = getPlaybackKey(audio);

        if (nextAudio && bindReadAloudSessionToAudio(nextAudio)) {
            audio = playerSession.audioElement;
            audio.playbackRate = playbackRate;
        } else if (!playerSession.audioElement) {
            audio = null;
        }

        const currentKey = getPlaybackKey(audio);
        if (currentKey && previousKey && currentKey !== previousKey) {
            clearPlayerDismissal();
        }

        if (audio && !audio.paused && currentKey && currentKey !== trackTitlePlaybackKey) {
            captureTrackTitleForPlayback(currentKey);
        }

        if (!audio || !hasAudioSource()) {
            clearPlayerDismissal();
            teardownControls();
            return;
        }

        if (isDismissedPlayback(audio)) {
            teardownControls();
            return;
        }

        if (audio.paused) {
            if (controlsDiv) startUiSync();
            return;
        }

        buildControls();
        startUiSync();
    };

    const stopMonitoring = () => {
        if (monitorIntervalId) {
            clearInterval(monitorIntervalId);
            monitorIntervalId = null;
        }
        stopUiSync();
    };

    const startMonitoring = () => {
        if (document.visibilityState !== 'visible') return;
        if (!monitorIntervalId) {
            monitorIntervalId = setInterval(checkObservedAudio, 1000);
        }
        checkObservedAudio();
        if (controlsDiv) startUiSync();
    };

    const installAudioElementTracking = () => {
        if (audioTrackingInstalled) return;
        audioTrackingInstalled = true;

        document.querySelectorAll('audio').forEach(rememberAudioElement);

        const documentPrototype = typeof Document !== 'undefined' ? Document.prototype : null;
        const originalCreateElement = documentPrototype?.createElement;

        if (typeof originalCreateElement === 'function') {
            documentPrototype.createElement = function (...args) {
                const element = originalCreateElement.apply(this, args);
                if (`${args[0] || ''}`.toLowerCase() === 'audio') rememberAudioElement(element);
                return element;
            };
        }

        const mediaPrototype = typeof HTMLMediaElement !== 'undefined' ? HTMLMediaElement.prototype : null;
        const originalPlay = mediaPrototype?.play;

        if (typeof originalPlay === 'function') {
            mediaPrototype.play = function (...args) {
                const shouldTrack = isAudioElement(this);
                let playSequence = 0;

                if (shouldTrack) {
                    rememberAudioElement(this);
                    audioPlaySequence += 1;
                    playSequence = audioPlaySequence;
                }

                const result = originalPlay.apply(this, args);

                if (shouldTrack) {
                    Promise.resolve(result).then(() => {
                        audioPlaySequences.set(this, playSequence);
                        if (isReadAloudAudioElement(this)) {
                            if (!controlsDiv && !isDismissedPlayback(this)) clearPlayerDismissal();
                            bindReadAloudSessionToAudio(this, playSequence);
                            startMonitoring();
                        } else if (controlsDiv) {
                            startMonitoring();
                        }
                        checkObservedAudio();
                    }, checkObservedAudio);
                }

                return result;
            };
        }

        const originalPause = mediaPrototype?.pause;

        if (typeof originalPause === 'function') {
            mediaPrototype.pause = function (...args) {
                if (isAudioElement(this)) rememberAudioElement(this);
                const result = originalPause.apply(this, args);
                checkObservedAudio();
                return result;
            };
        }
    };

    const initializePreviewMode = async () => {
        await ensureBody();
        const previewParams = new URLSearchParams(window.location.search);
        const previewDuration = Number(previewParams.get('ae-duration'));
        const previewRate = Number(previewParams.get('ae-rate'));

        applyPlayerSettings({
            skipBackSeconds: previewParams.get('ae-back') || playerSettings.skipBackSeconds,
            skipForwardSeconds: previewParams.get('ae-forward') || playerSettings.skipForwardSeconds
        });

        if (isSupportedPlaybackRate(previewRate)) {
            playerSettings = normalizePlayerSettings({
                ...playerSettings,
                playbackRate: previewRate
            });
            playbackRate = playerSettings.playbackRate;
        }

        if (Number.isFinite(previewDuration) && previewDuration > 0) {
            const previewCurrentTime = Number(previewParams.get('ae-current'));
            audio = {
                currentSrc: 'preview-audio',
                currentTime: Number.isFinite(previewCurrentTime)
                    ? Math.min(previewDuration, Math.max(0, previewCurrentTime))
                    : 0,
                duration: previewDuration,
                seekable: {
                    length: 1,
                    start: () => 0,
                    end: () => previewDuration
                },
                ended: false,
                paused: false,
                playbackRate,
                play() {
                    this.paused = false;
                    updateControlState();
                    return Promise.resolve();
                },
                pause() {
                    this.paused = true;
                    updateControlState();
                }
            };
        }

        const previewDownloadState = previewParams.get('ae-download');
        if (['loading', 'ready', 'failed'].includes(previewDownloadState)) {
            playerSession = {
                ...createPlayerSession(playerSession.id + 1),
                audioElement: audio,
                playbackKey: 'preview-mode',
                captureState: previewDownloadState === 'ready'
                    ? CAPTURE_STATE.READY
                    : previewDownloadState === 'failed'
                        ? CAPTURE_STATE.FAILED
                        : CAPTURE_STATE.LOADING,
                chunks: previewDownloadState === 'ready'
                    ? [new TextEncoder().encode('Preview audio placeholder')]
                    : [],
                mimeType: 'audio/aac',
                startedAt: Date.now(),
                completedAt: previewDownloadState === 'ready' || previewDownloadState === 'failed' ? Date.now() : 0
            };
        }

        captureTrackTitleForPlayback('preview-mode');
        buildControls();
        updateTrackTitle();
        updateControlState();
    };

    document.addEventListener(SETTINGS_EVENT, (event) => {
        applyPlayerSettings(event.detail?.settings);
    });

    document.addEventListener('click', (event) => {
        if (!speedMenu || !speedBtn) return;
        if (speedMenu.contains(event.target) || speedBtn.contains(event.target)) return;
        closeSpeedMenu();
    });

    installThemeListener();
    requestPlayerSettings();

    if (isPreviewMode) {
        initializePreviewMode();
        return;
    }

    migrateLegacyPlaybackRate();
    installAudioElementTracking();

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            startMonitoring();
            return;
        }
        stopMonitoring();
    });

    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const res = await originalFetch.apply(this, args);
        const url = getFetchUrl(args[0]);

        if (isSpeechResponse(url, res)) {
            if (typeof res.clone === 'function') {
                captureDownloadAudio(res.clone());
            }
            startMonitoring();
        }
        return res;
    };

    startMonitoring();
})();
