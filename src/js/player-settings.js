/**
 * Shared settings schema for the popup, settings bridge, and page player.
 *
 * Keep this file dependency-free. It is loaded in three different extension
 * contexts: the popup, the isolated content-script world, and the page's main
 * world.
 **/
(function () {
    'use strict';

    const STORAGE_KEY = 'ae_player_settings';
    const LEGACY_PLAYBACK_RATE_STORAGE_KEY = 'ae_playbackRate';
    const MIN_SKIP_SECONDS = 1;
    const MAX_SKIP_SECONDS = 300;
    const PLAYBACK_RATE_OPTIONS = Object.freeze([0.75, 1, 1.25, 1.5, 2]);

    const THEME = Object.freeze({
        SYSTEM: 'system',
        LIGHT: 'light',
        DARK: 'dark'
    });

    const DEFAULT_SETTINGS = Object.freeze({
        skipBackSeconds: 15,
        skipForwardSeconds: 15,
        playbackRate: 1,
        theme: THEME.SYSTEM,
        autoReadAloud: false
    });

    const clampSkipSeconds = (value, fallback) => {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue)) return fallback;
        return Math.min(MAX_SKIP_SECONDS, Math.max(MIN_SKIP_SECONDS, Math.round(numberValue)));
    };

    const normalizeTheme = (value) => (
        value === THEME.LIGHT || value === THEME.DARK ? value : THEME.SYSTEM
    );

    const isSupportedPlaybackRate = (value) => (
        PLAYBACK_RATE_OPTIONS.includes(Number(value))
    );

    const normalizePlaybackRate = (value, fallback = DEFAULT_SETTINGS.playbackRate) => {
        if (isSupportedPlaybackRate(value)) return Number(value);
        if (isSupportedPlaybackRate(fallback)) return Number(fallback);
        return DEFAULT_SETTINGS.playbackRate;
    };

    const normalizeSettings = (settings = {}) => ({
        // Accept the earlier *Jump* names so existing saved settings migrate
        // cleanly to the clearer *Skip* terminology.
        skipBackSeconds: clampSkipSeconds(
            settings.skipBackSeconds ?? settings.backJumpSeconds,
            DEFAULT_SETTINGS.skipBackSeconds
        ),
        skipForwardSeconds: clampSkipSeconds(
            settings.skipForwardSeconds ?? settings.forwardJumpSeconds,
            DEFAULT_SETTINGS.skipForwardSeconds
        ),
        playbackRate: normalizePlaybackRate(
            settings.playbackRate ?? settings.playbackSpeed ?? settings.defaultPlaybackRate
        ),
        theme: normalizeTheme(settings.theme),
        autoReadAloud: settings.autoReadAloud === true
    });

    window.AEPlayerSettings = Object.freeze({
        STORAGE_KEY,
        LEGACY_PLAYBACK_RATE_STORAGE_KEY,
        MIN_SKIP_SECONDS,
        MAX_SKIP_SECONDS,
        PLAYBACK_RATE_OPTIONS,
        THEME,
        DEFAULT_SETTINGS,
        isSupportedPlaybackRate,
        normalizePlaybackRate,
        normalizeSettings
    });
})();
