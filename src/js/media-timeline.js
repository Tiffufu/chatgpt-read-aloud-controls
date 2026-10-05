/**
 * Stable timeline and seeking helpers for streamed Read Aloud media.
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

    const PROBE_TIMEOUT_MS = 5000;

    const readSeekableRanges = (mediaElement, duration = Number.POSITIVE_INFINITY) => {
        const ranges = [];
        const timeRanges = mediaElement?.seekable;
        const finiteDuration = Number(duration);

        try {
            for (let index = 0; index < (timeRanges?.length || 0); index += 1) {
                const rawStart = Number(timeRanges.start(index));
                const rawEnd = Number(timeRanges.end(index));
                if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd < rawStart) continue;

                const start = Math.max(0, rawStart);
                const end = Number.isFinite(finiteDuration)
                    ? Math.min(finiteDuration, rawEnd)
                    : rawEnd;
                if (end < start) continue;

                ranges.push({ start, end });
            }
        } catch (_error) {
            return [];
        }

        return ranges.sort((left, right) => left.start - right.start);
    };

    const resolveMediaTimeline = (mediaElement, capturedDuration = 0) => {
        if (!mediaElement) return null;

        const nativeDuration = Number(mediaElement.duration);
        const stableCapturedDuration = Number(capturedDuration);
        const hasNativeDuration = Number.isFinite(nativeDuration) && nativeDuration > 0;
        const hasCapturedDuration = Number.isFinite(stableCapturedDuration) && stableCapturedDuration > 0;
        if (!hasNativeDuration && !hasCapturedDuration) return null;

        const duration = hasNativeDuration ? nativeDuration : stableCapturedDuration;
        const rawCurrentTime = Number(mediaElement.currentTime);
        const currentTime = Number.isFinite(rawCurrentTime)
            ? Math.min(duration, Math.max(0, rawCurrentTime))
            : 0;
        const seekableRanges = readSeekableRanges(mediaElement, duration);

        return {
            currentTime,
            duration,
            source: hasNativeDuration ? 'native' : 'captured',
            seekableRanges,
            canSeek: seekableRanges.length > 0
        };
    };

    const resolveSeekTarget = (mediaElement, requestedTime, direction = 'nearest') => {
        const target = Number(requestedTime);
        if (!Number.isFinite(target)) return null;

        const ranges = readSeekableRanges(mediaElement);
        if (!ranges.length) return null;

        const normalizedTarget = Math.max(0, target);
        const containingRange = ranges.find(({ start, end }) => (
            normalizedTarget >= start && normalizedTarget <= end
        ));
        if (containingRange) return normalizedTarget;

        if (direction === 'backward') {
            const earlierRanges = ranges.filter(({ end }) => end < normalizedTarget);
            return earlierRanges.length
                ? earlierRanges[earlierRanges.length - 1].end
                : ranges[0].start;
        }

        if (direction === 'forward') {
            const laterRange = ranges.find(({ start }) => start > normalizedTarget);
            return laterRange ? laterRange.start : ranges[ranges.length - 1].end;
        }

        const boundaries = ranges.flatMap(({ start, end }) => [start, end]);
        return boundaries.reduce((closest, boundary) => (
            Math.abs(boundary - normalizedTarget) < Math.abs(closest - normalizedTarget)
                ? boundary
                : closest
        ));
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
                    audio.currentTime = Number.MAX_SAFE_INTEGER;
                } catch (_error) {
                    // Formats that cannot be probed settle through the timeout.
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

    return Object.freeze({
        resolveMediaTimeline,
        resolveSeekTarget,
        probeBlobDuration
    });
});
