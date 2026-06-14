/**
 * Settings bridge for the floating Read Aloud player.
 *
 * Runs in the extension isolated world so it can access chrome.storage and
 * forwards settings into the page/main-world player script. Validation belongs
 * to the popup and main-world player through src/js/player-settings.js.
 **/
(function () {
    'use strict';

    const STORAGE_KEY = 'ae_player_settings';
    const SETTINGS_EVENT = 'ae-read-aloud-player:settings';
    const SETTINGS_REQUEST_EVENT = 'ae-read-aloud-player:settings-request';
    const SETTINGS_UPDATE_REQUEST_EVENT = 'ae-read-aloud-player:settings-update-request';

    const chromeApi = typeof chrome !== 'undefined' ? chrome : null;
    const normalizePayload = (settings) => (
        settings && typeof settings === 'object' ? { ...settings } : {}
    );

    const postSettings = (settings, reason = 'snapshot') => {
        document.dispatchEvent(new CustomEvent(SETTINGS_EVENT, {
            detail: {
                reason,
                settings: normalizePayload(settings)
            }
        }));
    };

    const readStoredSettings = async () => {
        if (!chromeApi?.storage?.local) return {};
        const result = await chromeApi.storage.local.get(STORAGE_KEY);
        return normalizePayload(result?.[STORAGE_KEY]);
    };

    const saveStoredSettings = async (settings, reason = 'saved') => {
        const nextSettings = {
            ...await readStoredSettings(),
            ...normalizePayload(settings)
        };

        if (chromeApi?.storage?.local) {
            await chromeApi.storage.local.set({ [STORAGE_KEY]: nextSettings });
        }

        postSettings(nextSettings, reason);
    };

    const sendStoredSettings = async (reason) => {
        try {
            postSettings(await readStoredSettings(), reason);
        } catch (err) {
            console.error('[Read Aloud Controls for ChatGPT] Failed to read settings', err);
            postSettings({}, 'fallback');
        }
    };

    document.addEventListener(SETTINGS_REQUEST_EVENT, () => {
        sendStoredSettings('requested');
    });

    document.addEventListener(SETTINGS_UPDATE_REQUEST_EVENT, (event) => {
        saveStoredSettings(event.detail?.settings, 'player-updated').catch((err) => {
            console.error('[Read Aloud Controls for ChatGPT] Failed to save settings', err);
        });
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
