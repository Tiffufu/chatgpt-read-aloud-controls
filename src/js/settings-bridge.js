/**
 * Settings bridge for the floating Read Aloud player.
 *
 * Runs in the extension isolated world so it can access chrome.storage and
 * forwards validated settings into the page/main-world player script.
 **/
(function () {
    'use strict';

    const fallbackSettingsApi = (() => {
        const STORAGE_KEY = 'ae_player_settings';
        const DEFAULT_SETTINGS = Object.freeze({
            skipBackSeconds: 5,
            skipForwardSeconds: 5,
            theme: 'system'
        });
        const clampSkipSeconds = (value, fallback) => {
            const numberValue = Number(value);
            if (!Number.isFinite(numberValue)) return fallback;
            return Math.min(300, Math.max(1, Math.round(numberValue)));
        };
        return Object.freeze({
            STORAGE_KEY,
            DEFAULT_SETTINGS,
            normalizeSettings: (settings = {}) => ({
                skipBackSeconds: clampSkipSeconds(settings.skipBackSeconds ?? settings.backJumpSeconds, DEFAULT_SETTINGS.skipBackSeconds),
                skipForwardSeconds: clampSkipSeconds(settings.skipForwardSeconds ?? settings.forwardJumpSeconds, DEFAULT_SETTINGS.skipForwardSeconds),
                theme: settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : DEFAULT_SETTINGS.theme
            })
        });
    })();

    const settingsApi = window.AEPlayerSettings || fallbackSettingsApi;
    const { STORAGE_KEY, DEFAULT_SETTINGS, normalizeSettings } = settingsApi;
    const chromeApi = typeof chrome !== 'undefined' ? chrome : null;

    const postSettings = (settings, reason = 'snapshot') => {
        window.postMessage({
            source: 'ae-read-aloud-extension',
            type: 'AE_PLAYER_SETTINGS',
            reason,
            settings: normalizeSettings(settings)
        }, '*');
    };

    const readStoredSettings = async () => {
        if (!chromeApi?.storage?.local) return DEFAULT_SETTINGS;
        const result = await chromeApi.storage.local.get(STORAGE_KEY);
        return normalizeSettings(result?.[STORAGE_KEY]);
    };

    const sendStoredSettings = async (reason) => {
        try {
            postSettings(await readStoredSettings(), reason);
        } catch (err) {
            console.error('[Audio Player for ChatGPT] Failed to read settings', err);
            postSettings(DEFAULT_SETTINGS, 'fallback');
        }
    };

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const data = event.data || {};
        if (data.source !== 'ae-read-aloud-player' || data.type !== 'AE_PLAYER_SETTINGS_REQUEST') return;
        sendStoredSettings('requested');
    });

    chromeApi?.runtime?.onMessage?.addListener?.((message) => {
        if (message?.type !== 'AE_PLAYER_SETTINGS_UPDATED') return;
        postSettings(message.settings, 'updated');
    });

    chromeApi?.storage?.onChanged?.addListener?.((changes, areaName) => {
        if (areaName !== 'local' || !changes[STORAGE_KEY]) return;
        postSettings(changes[STORAGE_KEY].newValue, 'storage-changed');
    });

    sendStoredSettings('initial');
})();
