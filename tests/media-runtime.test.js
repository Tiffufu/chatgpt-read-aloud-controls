const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const mediaTimelinePath = path.join(projectRoot, 'src/js/media-timeline.js');
const contentScriptPath = path.join(projectRoot, 'src/js/content-script.js');

const loadMediaTimeline = () => {
    try {
        delete require.cache[require.resolve(mediaTimelinePath)];
        return require(mediaTimelinePath);
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND' && error.message.includes(mediaTimelinePath)) {
            return {};
        }
        throw error;
    }
};

const createTimeRanges = (ranges) => ({
    length: ranges.length,
    start: (index) => ranges[index][0],
    end: (index) => ranges[index][1]
});

test('does not use moving media ranges as the total duration', () => {
    const { resolveMediaTimeline } = loadMediaTimeline();

    assert.equal(typeof resolveMediaTimeline, 'function');
    assert.equal(resolveMediaTimeline({
        currentTime: 75,
        duration: Number.POSITIVE_INFINITY,
        seekable: createTimeRanges([[0, 240]]),
        buffered: createTimeRanges([[0, 180]])
    }), null);
});

test('prefers the authoritative media duration once it becomes finite', () => {
    const { resolveMediaTimeline } = loadMediaTimeline();

    assert.equal(typeof resolveMediaTimeline, 'function');
    assert.deepEqual(resolveMediaTimeline({
        currentTime: 75,
        duration: 420,
        seekable: createTimeRanges([[0, 240]]),
        buffered: createTimeRanges([[0, 180]])
    }), {
        currentTime: 75,
        duration: 420,
        canSeek: true,
        source: 'native'
    });
});

test('uses completed capture metadata as a stable total duration', () => {
    const { resolveMediaTimeline } = loadMediaTimeline();

    assert.equal(typeof resolveMediaTimeline, 'function');
    assert.deepEqual(resolveMediaTimeline({
        currentTime: 45,
        duration: Number.POSITIVE_INFINITY,
        seekable: createTimeRanges([[0, 120]]),
        buffered: createTimeRanges([[0, 120]])
    }, 420), {
        currentTime: 45,
        duration: 420,
        canSeek: false,
        source: 'captured'
    });
});

test('enables captured-duration scrubbing only when the full track is seekable', () => {
    const { resolveMediaTimeline } = loadMediaTimeline();

    assert.deepEqual(resolveMediaTimeline({
        currentTime: 75,
        duration: Number.POSITIVE_INFINITY,
        seekable: createTimeRanges([[0, 420]]),
        buffered: createTimeRanges([[0, 420]])
    }, 420), {
        currentTime: 75,
        duration: 420,
        canSeek: true,
        source: 'captured'
    });
});

test('reads an exact duration from completed audio blob metadata', async () => {
    const { probeBlobDuration } = loadMediaTimeline();
    const listeners = new Map();
    const audio = {
        duration: Number.NaN,
        addEventListener: (name, listener) => listeners.set(name, listener),
        removeEventListener: (name) => listeners.delete(name),
        removeAttribute() {},
        load() {
            this.duration = 420;
            listeners.get('loadedmetadata')?.();
        }
    };
    const revokedUrls = [];

    assert.equal(typeof probeBlobDuration, 'function');
    assert.equal(await probeBlobDuration({}, {
        createAudio: () => audio,
        createObjectURL: () => 'blob:captured-audio',
        revokeObjectURL: (url) => revokedUrls.push(url),
        setTimeout: () => 1,
        clearTimeout() {}
    }), 420);
    assert.deepEqual(revokedUrls, ['blob:captured-audio']);
});

test('resolves indefinite completed-blob metadata with a detached duration probe', async () => {
    const { probeBlobDuration } = loadMediaTimeline();
    const listeners = new Map();
    let probeCurrentTime = 0;
    const audio = {
        duration: Number.POSITIVE_INFINITY,
        addEventListener: (name, listener) => listeners.set(name, listener),
        removeEventListener: (name) => listeners.delete(name),
        removeAttribute() {},
        load() {
            listeners.get('loadedmetadata')?.();
        }
    };
    Object.defineProperty(audio, 'currentTime', {
        get: () => probeCurrentTime,
        set: (value) => {
            probeCurrentTime = value;
            audio.duration = 420;
            listeners.get('durationchange')?.();
        }
    });

    assert.equal(await probeBlobDuration({}, {
        createAudio: () => audio,
        createObjectURL: () => 'blob:indefinite-captured-audio',
        revokeObjectURL() {},
        setTimeout: () => 1,
        clearTimeout() {}
    }), 420);
    assert.equal(probeCurrentTime, Number.MAX_SAFE_INTEGER);
});

const createContentScriptHarness = () => {
    class FakeMediaElement {
        constructor(source) {
            this.currentSrc = source;
            this.src = source;
            this.srcObject = null;
            this.currentTime = 0;
            this.duration = Number.POSITIVE_INFINITY;
            this.readyState = 1;
            this.paused = true;
            this.ended = false;
            this.pauseCalls = 0;
        }

        play() {
            this.paused = false;
            return new Promise(() => {});
        }

        pause() {
            this.pauseCalls += 1;
            this.paused = true;
        }
    }

    class FakeAudioElement extends FakeMediaElement {}

    class FakeDocument {
        constructor() {
            this.body = null;
            this.documentElement = {};
            this.head = null;
            this.title = 'Test conversation - ChatGPT';
            this.visibilityState = 'hidden';
        }

        addEventListener() {}
        dispatchEvent() {}
        querySelectorAll() { return []; }
        createElement() { return {}; }
    }

    const settings = Object.freeze({
        skipBackSeconds: 15,
        skipForwardSeconds: 15,
        playbackRate: 1,
        theme: 'system'
    });
    const context = {
        Blob: class Blob {},
        CustomEvent: class CustomEvent {},
        Document: FakeDocument,
        HTMLAudioElement: FakeAudioElement,
        HTMLMediaElement: FakeMediaElement,
        Request: class Request {},
        TextEncoder: class TextEncoder {},
        URL,
        URLSearchParams,
        clearInterval() {},
        console,
        document: new FakeDocument(),
        fetch: async () => ({
            clone: () => ({
                arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
                body: null,
                headers: { get: () => 'audio/aac' }
            }),
            headers: { get: () => 'audio/aac' }
        }),
        localStorage: {
            getItem: () => null,
            removeItem() {}
        },
        location: { href: 'https://chatgpt.com/c/test' },
        matchMedia: () => ({
            matches: false,
            addEventListener() {}
        }),
        setInterval: () => 1
    };
    context.window = context;
    context.globalThis = context;
    context.addEventListener = () => {};
    context.AEPlayerSettings = {
        DEFAULT_SETTINGS: settings,
        LEGACY_PLAYBACK_RATE_STORAGE_KEY: 'ae_playbackRate',
        PLAYBACK_RATE_OPTIONS: [0.75, 1, 1.25, 1.5, 2],
        isSupportedPlaybackRate: (value) => [0.75, 1, 1.25, 1.5, 2].includes(Number(value)),
        normalizePlaybackRate: (value, fallback = 1) => (
            [0.75, 1, 1.25, 1.5, 2].includes(Number(value)) ? Number(value) : fallback
        ),
        normalizeSettings: (value = {}) => ({ ...settings, ...value })
    };

    vm.runInNewContext(fs.readFileSync(contentScriptPath, 'utf8'), context, {
        filename: contentScriptPath
    });

    return { context, FakeAudioElement };
};

test('playing a newly tracked Read Aloud element does not pause the current page audio', async () => {
    const { context, FakeAudioElement } = createContentScriptHarness();
    await context.fetch('https://chatgpt.com/backend-api/synthesize');

    const firstAudio = new FakeAudioElement('blob:first-read-aloud');
    const secondAudio = new FakeAudioElement('blob:second-read-aloud');

    firstAudio.play();
    secondAudio.play();

    assert.equal(firstAudio.pauseCalls, 0);
    assert.equal(firstAudio.paused, false);
});
