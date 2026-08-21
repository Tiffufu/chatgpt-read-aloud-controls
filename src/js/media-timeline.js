/**
 * Stable timeline helpers for streamed media and completed audio captures.
 */
(function (root, factory) {
    const api = factory(root);

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.AEPlayerMediaTimeline = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, (root) => {
    'use strict';

    const SEEKABLE_TOLERANCE_SECONDS = 0.25;
    const PROBE_TIMEOUT_MS = 5000;

    const hasFullSeekableCoverage = (timeRanges, duration) => {
        try {
            if (!timeRanges || timeRanges.length < 1) return false;

            for (let index = 0; index < timeRanges.length; index += 1) {
                const start = Number(timeRanges.start(index));
                const end = Number(timeRanges.end(index));
                if (
                    Number.isFinite(start)
                    && Number.isFinite(end)
                    && start <= SEEKABLE_TOLERANCE_SECONDS
                    && end >= duration - SEEKABLE_TOLERANCE_SECONDS
                ) {
                    return true;
                }
            }
        } catch (_error) {
            // Malformed or changing TimeRanges are treated as non-seekable.
        }

        return false;
    };

    const resolveMediaTimeline = (mediaElement, capturedDuration = 0) => {
        if (!mediaElement) return null;

        const rawCurrentTime = Number(mediaElement.currentTime);
        const currentTime = Number.isFinite(rawCurrentTime) ? Math.max(0, rawCurrentTime) : 0;
        const nativeDuration = Number(mediaElement.duration);

        if (Number.isFinite(nativeDuration) && nativeDuration > 0) {
            return {
                currentTime: Math.min(currentTime, nativeDuration),
                duration: nativeDuration,
                canSeek: true,
                source: 'native'
            };
        }

        const stableCapturedDuration = Number(capturedDuration);
        if (!Number.isFinite(stableCapturedDuration) || stableCapturedDuration <= 0) return null;

        return {
            currentTime: Math.min(currentTime, stableCapturedDuration),
            duration: stableCapturedDuration,
            canSeek: hasFullSeekableCoverage(mediaElement.seekable, stableCapturedDuration),
            source: 'captured'
        };
    };

    const probeBlobDuration = (blob, dependencies = {}) => new Promise((resolve) => {
        const createAudio = dependencies.createAudio
            || (() => root?.document?.createElement?.('audio'));
        const createObjectURL = dependencies.createObjectURL
            || root?.URL?.createObjectURL?.bind(root.URL);
        const revokeObjectURL = dependencies.revokeObjectURL
            || root?.URL?.revokeObjectURL?.bind(root.URL);
        const scheduleTimeout = dependencies.setTimeout || root?.setTimeout?.bind(root);
        const cancelTimeout = dependencies.clearTimeout || root?.clearTimeout?.bind(root);

        if (!blob || !createAudio || !createObjectURL || !revokeObjectURL) {
            resolve(0);
            return;
        }

        let audio;
        let blobUrl = '';
        let timeoutId = null;
        let settled = false;
        let triedDurationProbe = false;

        const eventNames = ['loadedmetadata', 'durationchange', 'seeked', 'error'];
        const cleanup = () => {
            eventNames.forEach((eventName) => audio?.removeEventListener?.(eventName, onMetadataEvent));
            if (timeoutId !== null && cancelTimeout) cancelTimeout(timeoutId);
            audio?.removeAttribute?.('src');
            if (blobUrl) revokeObjectURL(blobUrl);
        };
        const finish = (duration = 0) => {
            if (settled) return;
            settled = true;
            const finiteDuration = Number(duration);
            cleanup();
            resolve(Number.isFinite(finiteDuration) && finiteDuration > 0 ? finiteDuration : 0);
        };
        function onMetadataEvent(event) {
            if (event?.type === 'error') {
                finish(0);
                return;
            }

            const duration = Number(audio?.duration);
            if (Number.isFinite(duration) && duration > 0) {
                finish(duration);
                return;
            }

            if (!triedDurationProbe && audio && audio.readyState !== 0) {
                triedDurationProbe = true;
                try {
                    // This operates only on the detached completed-blob probe.
                    audio.currentTime = Number.MAX_SAFE_INTEGER;
                } catch (_error) {
                    // The timeout below handles formats that cannot be probed.
                }
            }
        }

        try {
            audio = createAudio();
            if (!audio) {
                finish(0);
                return;
            }

            eventNames.forEach((eventName) => audio.addEventListener?.(eventName, onMetadataEvent));
            audio.preload = 'metadata';
            blobUrl = createObjectURL(blob);
            audio.src = blobUrl;
            if (scheduleTimeout) timeoutId = scheduleTimeout(() => finish(0), PROBE_TIMEOUT_MS);
            audio.load?.();
        } catch (_error) {
            finish(0);
        }
    });

    return Object.freeze({ resolveMediaTimeline, probeBlobDuration });
});
