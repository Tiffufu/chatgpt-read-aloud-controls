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
    const autoReadCheckbox = document.getElementById('autoReadAloud');
    const dictationCheckbox = document.getElementById('pauseWhileDictating');
    const dictationHelpButton = document.getElementById('dictationHelpButton');
    const dictationHelp = document.getElementById('dictationHelp');
    const status = document.getElementById('status');

    dictationHelpButton.addEventListener('click', () => {
        dictationHelp.hidden = !dictationHelp.hidden;
        dictationHelpButton.setAttribute('aria-expanded', String(!dictationHelp.hidden));
    });
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || dictationHelp.hidden) return;
        event.preventDefault();
        event.stopPropagation();
        dictationHelp.hidden = true;
        dictationHelpButton.setAttribute('aria-expanded', 'false');
        dictationHelpButton.focus();
    });

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
            status.textContent = '';
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
        autoReadCheckbox.checked = settings.autoReadAloud;
        dictationCheckbox.checked = settings.pauseWhileDictating;
    };

    const readForm = () => normalizeSettings({
        skipBackSeconds: skipBackInput.value,
        skipForwardSeconds: skipForwardInput.value,
        playbackRate: playbackRateSelect.value,
        theme: themeSelect.value,
        autoReadAloud: autoReadCheckbox.checked,
        pauseWhileDictating: dictationCheckbox.checked
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
        status.textContent = '';

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
        autoReadCheckbox.addEventListener('change', persist);
        dictationCheckbox.addEventListener('change', persist);

        // The error belongs to the current tab, rather than the global preference.
        if (chromeApi?.tabs?.query && chromeApi?.tabs?.sendMessage) {
            try {
                const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
                if (tab?.id !== undefined) {
                    const result = await chromeApi.tabs.sendMessage(tab.id, { type: 'AE_AUTO_READ_STATUS' });
                    if (result?.error) status.textContent = result.error;
                }
            } catch (_err) {
                // The active tab may not be ChatGPT, or may need refreshing.
            }
        }
    };

    initialize();
})();
