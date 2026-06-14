(function () {
    'use strict';

    const fallbackSettingsApi = (() => {
        const STORAGE_KEY = 'ae_player_settings';
        const MIN_SKIP_SECONDS = 1;
        const MAX_SKIP_SECONDS = 300;
        const DEFAULT_SETTINGS = Object.freeze({
            skipBackSeconds: 5,
            skipForwardSeconds: 5,
            theme: 'system'
        });
        const clampSkipSeconds = (value, fallback) => {
            const numberValue = Number(value);
            if (!Number.isFinite(numberValue)) return fallback;
            return Math.min(MAX_SKIP_SECONDS, Math.max(MIN_SKIP_SECONDS, Math.round(numberValue)));
        };
        return Object.freeze({
            STORAGE_KEY,
            MIN_SKIP_SECONDS,
            MAX_SKIP_SECONDS,
            DEFAULT_SETTINGS,
            normalizeSettings: (settings = {}) => ({
                skipBackSeconds: clampSkipSeconds(settings.skipBackSeconds ?? settings.backJumpSeconds, DEFAULT_SETTINGS.skipBackSeconds),
                skipForwardSeconds: clampSkipSeconds(settings.skipForwardSeconds ?? settings.forwardJumpSeconds, DEFAULT_SETTINGS.skipForwardSeconds),
                theme: settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : DEFAULT_SETTINGS.theme
            })
        });
    })();

    const settingsApi = window.AEPlayerSettings || fallbackSettingsApi;
    const {
        STORAGE_KEY,
        MIN_SKIP_SECONDS,
        MAX_SKIP_SECONDS,
        DEFAULT_SETTINGS,
        normalizeSettings
    } = settingsApi;

    const chromeApi = typeof chrome !== 'undefined' ? chrome : null;

    const form = document.getElementById('settingsForm');
    const skipBackInput = document.getElementById('skipBackSeconds');
    const skipForwardInput = document.getElementById('skipForwardSeconds');
    const themeSelect = document.getElementById('theme');
    const status = document.getElementById('status');

    let settings = { ...DEFAULT_SETTINGS };
    let statusTimer = null;

    const setNumberBounds = (input) => {
        input.min = String(MIN_SKIP_SECONDS);
        input.max = String(MAX_SKIP_SECONDS);
    };

    const setStatus = (message) => {
        status.textContent = message;
        window.clearTimeout(statusTimer);
        statusTimer = window.setTimeout(() => {
            status.textContent = 'Changes apply to active ChatGPT tabs.';
        }, 1800);
    };

    const render = () => {
        skipBackInput.value = settings.skipBackSeconds;
        skipForwardInput.value = settings.skipForwardSeconds;
        themeSelect.value = settings.theme;
    };

    const readForm = () => normalizeSettings({
        skipBackSeconds: skipBackInput.value,
        skipForwardSeconds: skipForwardInput.value,
        theme: themeSelect.value
    });

    const persist = async () => {
        settings = readForm();
        render();
        if (chromeApi?.storage?.local) {
            await chromeApi.storage.local.set({ [STORAGE_KEY]: settings });
        }
        setStatus('Saved.');
    };

    const initialize = async () => {
        setNumberBounds(skipBackInput);
        setNumberBounds(skipForwardInput);

        try {
            const result = chromeApi?.storage?.local
                ? await chromeApi.storage.local.get(STORAGE_KEY)
                : {};
            settings = normalizeSettings(result?.[STORAGE_KEY]);
        } catch (_err) {
            settings = { ...DEFAULT_SETTINGS };
        }

        render();
        status.textContent = 'Changes apply to active ChatGPT tabs.';

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            persist();
        });

        [skipBackInput, skipForwardInput].forEach((input) => {
            input.addEventListener('change', persist);
            input.addEventListener('blur', persist);
        });

        themeSelect.addEventListener('change', persist);
    };

    initialize();
})();
