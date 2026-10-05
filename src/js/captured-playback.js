/**
 * Lifecycle helper for extension-owned playback of a completed audio capture.
 */
(function (root, factory) {
    const api = factory(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.AEPlayerCapturedPlayback = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, (root) => {
    'use strict';

    const READY_TIMEOUT_MS = 5000;
    const READY_EVENT_NAMES = ['loadedmetadata', 'durationchange', 'progress', 'canplay', 'error'];

    const hasValidSeekableRange = (mediaElement) => {
        const ranges = mediaElement?.seekable;

        try {
            for (let index = 0; index < (ranges?.length || 0); index += 1) {
                const start = Number(ranges.start(index));
                const end = Number(ranges.end(index));
                if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start) {
                    return true;
                }
            }
        } catch (_error) {
            return false;
        }

        return false;
    };

    const createCapturedPlayback = (blob, dependencies = {}) => {
        const createAudio = dependencies.createAudio
            || (() => root?.document?.createElement?.('audio'));
        const createObjectURL = dependencies.createObjectURL
            || root?.URL?.createObjectURL?.bind(root.URL);
        const revokeObjectURL = dependencies.revokeObjectURL
            || root?.URL?.revokeObjectURL?.bind(root.URL);
        const scheduleTimeout = dependencies.setTimeout || root?.setTimeout?.bind(root);
        const cancelTimeout = dependencies.clearTimeout || root?.clearTimeout?.bind(root);

        if (!blob || !createAudio || !createObjectURL || !revokeObjectURL) return null;

        let element;
        let objectUrl = '';

        try {
            element = createAudio();
            if (!element) return null;
            objectUrl = createObjectURL(blob);
        } catch (_error) {
            return null;
        }

        let released = false;
        let settled = false;
        let timeoutId = null;
        let resolveReady;
        const ready = new Promise((resolve) => {
            resolveReady = resolve;
        });

        const removeReadyListeners = () => {
            READY_EVENT_NAMES.forEach((eventName) => {
                element.removeEventListener?.(eventName, onReadyEvent);
            });
        };
        const settle = (isReady) => {
            if (settled) return;
            settled = true;
            removeReadyListeners();
            if (timeoutId !== null && cancelTimeout) cancelTimeout(timeoutId);
            resolveReady(Boolean(isReady));
        };
        const release = () => {
            if (released) return;
            released = true;
            settle(false);
            try {
                element.pause?.();
            } catch (_error) {
                // Cleanup continues even when a media implementation rejects pause.
            }
            element.removeAttribute?.('src');
            try {
                element.load?.();
            } catch (_error) {
                // Unloading is best effort; the object URL is still revoked below.
            }
            if (objectUrl) revokeObjectURL(objectUrl);
        };
        function onReadyEvent(event) {
            if (event?.type === 'error') {
                release();
                return;
            }

            if (!released && Number(element.readyState) > 0 && hasValidSeekableRange(element)) {
                settle(true);
            }
        }

        READY_EVENT_NAMES.forEach((eventName) => {
            element.addEventListener?.(eventName, onReadyEvent);
        });
        element.preload = 'auto';
        element.src = objectUrl;
        if (scheduleTimeout) timeoutId = scheduleTimeout(release, READY_TIMEOUT_MS);

        try {
            element.load?.();
            onReadyEvent({ type: 'initial' });
        } catch (_error) {
            release();
        }

        return Object.freeze({
            element,
            objectUrl,
            ready,
            release
        });
    };

    return Object.freeze({ createCapturedPlayback });
});
