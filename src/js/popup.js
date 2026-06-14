(function () {
    'use strict';

    const SETTINGS_MODULE_ERROR = 'Settings module failed to load. Reload the extension and try again.';

    const getSettingsApi = () => {
        const api = window.AEPlayerSettings;
        if (
            api?.STORAGE_KEY
            && api?.DEFAULT_SETTINGS
            && api?.PLAYBACK_RATE_OPTIONS
            && typeof api.normalizeSettings === 'function'
        ) {
            return api;
        }
        console.error('[Read Aloud Controls for ChatGPT] Shared settings module is missing.');
        return null;
    };

    const chromeApi = typeof chrome !== 'undefined' ? chrome : null;
    const settingsApi = getSettingsApi();

    const form = document.getElementById('settingsForm');
    const skipBackInput = document.getElementById('skipBackSeconds');
    const skipForwardInput = document.getElementById('skipForwardSeconds');
    const playbackRateSelect = document.getElementById('playbackRate');
    const themeSelect = document.getElementById('theme');
    const status = document.getElementById('status');

    if (!settingsApi) {
        status.textContent = SETTINGS_MODULE_ERROR;
        form.querySelectorAll('input, select, button').forEach((control) => {
            control.disabled = true;
        });
        return;
    }

    const {
        STORAGE_KEY,
        MIN_SKIP_SECONDS,
        MAX_SKIP_SECONDS,
        PLAYBACK_RATE_OPTIONS,
        DEFAULT_SETTINGS,
        normalizeSettings
    } = settingsApi;

    let settings = { ...DEFAULT_SETTINGS };
    let statusTimer = null;

    const formatRate = (rate) => `${String(rate).replace(/\.0$/, '')}x`;

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

    const populatePlaybackRateOptions = () => {
        playbackRateSelect.replaceChildren(...PLAYBACK_RATE_OPTIONS.map((rate) => {
            const option = document.createElement('option');
            option.value = String(rate);
            option.textContent = formatRate(rate);
            return option;
        }));
    };

    const render = () => {
        skipBackInput.value = settings.skipBackSeconds;
        skipForwardInput.value = settings.skipForwardSeconds;
        playbackRateSelect.value = String(settings.playbackRate);
        themeSelect.value = settings.theme;
    };

    const readForm = () => normalizeSettings({
        skipBackSeconds: skipBackInput.value,
        skipForwardSeconds: skipForwardInput.value,
        playbackRate: playbackRateSelect.value,
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
        populatePlaybackRateOptions();

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

        playbackRateSelect.addEventListener('change', persist);
        themeSelect.addEventListener('change', persist);
    };

    initialize();
})();
