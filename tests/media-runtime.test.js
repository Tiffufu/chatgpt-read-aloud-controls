const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const mediaTimelinePath = path.join(projectRoot, 'src/js/media-timeline.js');
const capturedPlaybackPath = path.join(projectRoot, 'src/js/captured-playback.js');
const contentScriptPath = path.join(projectRoot, 'src/js/content-script.js');
const manifestPath = path.join(projectRoot, 'manifest.json');

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

const loadCapturedPlayback = () => {
    try {
        delete require.cache[require.resolve(capturedPlaybackPath)];
        return require(capturedPlaybackPath);
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND' && error.message.includes(capturedPlaybackPath)) {
            return {};
        }
        throw error;
    }
};

const createDetachedAudioDouble = () => {
    const listeners = new Map();
    return {
        currentTime: 0,
        duration: Number.POSITIVE_INFINITY,
        readyState: 0,
        seekable: createTimeRanges([]),
        paused: true,
        src: '',
        playCalls: 0,
        pauseCalls: 0,
        loadCalls: 0,
        addEventListener(name, listener) {
            if (!listeners.has(name)) listeners.set(name, new Set());
            listeners.get(name).add(listener);
        },
        removeEventListener(name, listener) {
            listeners.get(name)?.delete(listener);
        },
        dispatch(name) {
            listeners.get(name)?.forEach((listener) => listener.call(this, { type: name }));
        },
        play() {
            this.playCalls += 1;
            this.paused = false;
            return Promise.resolve();
        },
        pause() {
            this.pauseCalls += 1;
            this.paused = true;
        },
        load() {
            this.loadCalls += 1;
        },
        removeAttribute(name) {
            if (name === 'src') this.src = '';
        }
    };
};

const createTimeRanges = (ranges) => ({
    length: ranges.length,
    start: (index) => ranges[index][0],
    end: (index) => ranges[index][1]
});

test('captured playback becomes ready only after metadata and a valid seekable range', async () => {
    const { createCapturedPlayback } = loadCapturedPlayback();
    const audio = createDetachedAudioDouble();
    const revokedUrls = [];

    assert.equal(typeof createCapturedPlayback, 'function');
    const controller = createCapturedPlayback({}, {
        createAudio: () => audio,
        createObjectURL: () => 'blob:captured-playback',
        revokeObjectURL: (url) => revokedUrls.push(url),
        setTimeout: () => 1,
        clearTimeout() {}
    });

    assert.ok(controller);
    assert.equal(audio.playCalls, 0);
    assert.equal(audio.preload, 'auto');
    assert.equal(audio.src, 'blob:captured-playback');

    audio.readyState = 1;
    audio.seekable = createTimeRanges([[0, 420]]);
    audio.dispatch('loadedmetadata');

    assert.equal(await controller.ready, true);
    assert.deepEqual(revokedUrls, []);
    assert.equal(audio.playCalls, 0);
});

test('captured playback rejects empty malformed and zero-width seekable ranges', async () => {
    const { createCapturedPlayback } = loadCapturedPlayback();
    const invalidRanges = [[], [[20, 10]], [[15, 15]]];

    for (const ranges of invalidRanges) {
        const audio = createDetachedAudioDouble();
        const revokedUrls = [];
        let expire;
        const controller = createCapturedPlayback({}, {
            createAudio: () => audio,
            createObjectURL: () => `blob:invalid-${ranges.length}`,
            revokeObjectURL: (url) => revokedUrls.push(url),
            setTimeout: (callback) => {
                expire = callback;
                return 1;
            },
            clearTimeout() {}
        });

        audio.readyState = 1;
        audio.seekable = createTimeRanges(ranges);
        audio.dispatch('loadedmetadata');
        expire();

        assert.equal(await controller.ready, false);
        assert.equal(revokedUrls.length, 1);
        assert.equal(audio.src, '');
    }
});

test('captured playback timeout releases its object URL exactly once', async () => {
    const { createCapturedPlayback } = loadCapturedPlayback();
    const audio = createDetachedAudioDouble();
    const revokedUrls = [];
    let expire;
    const controller = createCapturedPlayback({}, {
        createAudio: () => audio,
        createObjectURL: () => 'blob:timed-out-playback',
        revokeObjectURL: (url) => revokedUrls.push(url),
        setTimeout: (callback) => {
            expire = callback;
            return 1;
        },
        clearTimeout() {}
    });

    expire();
    assert.equal(await controller.ready, false);
    controller.release();
    controller.release();

    assert.deepEqual(revokedUrls, ['blob:timed-out-playback']);
    assert.equal(audio.pauseCalls, 1);
    assert.equal(audio.src, '');
});

test('captured playback release before readiness makes late media events inert', async () => {
    const { createCapturedPlayback } = loadCapturedPlayback();
    const audio = createDetachedAudioDouble();
    const revokedUrls = [];
    const controller = createCapturedPlayback({}, {
        createAudio: () => audio,
        createObjectURL: () => 'blob:released-playback',
        revokeObjectURL: (url) => revokedUrls.push(url),
        setTimeout: () => 1,
        clearTimeout() {}
    });

    controller.release();
    audio.readyState = 1;
    audio.seekable = createTimeRanges([[0, 420]]);
    audio.dispatch('canplay');

    assert.equal(await controller.ready, false);
    assert.deepEqual(revokedUrls, ['blob:released-playback']);
    assert.equal(audio.playCalls, 0);
});

test('moving media ranges never become the total duration', () => {
    const { resolveMediaTimeline } = loadMediaTimeline();

    assert.equal(typeof resolveMediaTimeline, 'function');
    assert.equal(resolveMediaTimeline({
        currentTime: 75,
        duration: Number.POSITIVE_INFINITY,
        seekable: createTimeRanges([[0, 240]]),
        buffered: createTimeRanges([[0, 180]])
    }), null);
});

test('manifest loads the timeline API before the main player runtime', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const mainWorldScripts = manifest.content_scripts.find(({ world }) => world === 'MAIN')?.js || [];
    const timelineIndex = mainWorldScripts.indexOf('src/js/media-timeline.js');
    const contentScriptIndex = mainWorldScripts.indexOf('src/js/content-script.js');

    assert.notEqual(timelineIndex, -1);
    assert.notEqual(contentScriptIndex, -1);
    assert.ok(timelineIndex < contentScriptIndex);
});

test('finite native duration is authoritative and keeps partial seek ranges', () => {
    const { resolveMediaTimeline } = loadMediaTimeline();

    assert.deepEqual(resolveMediaTimeline({
        currentTime: 75,
        duration: 420,
        seekable: createTimeRanges([[0, 120], [180, 240]])
    }, 600), {
        currentTime: 75,
        duration: 420,
        source: 'native',
        seekableRanges: [
            { start: 0, end: 120 },
            { start: 180, end: 240 }
        ],
        canSeek: true
    });
});

test('completed capture supplies a stable total before native duration is finite', () => {
    const { resolveMediaTimeline } = loadMediaTimeline();

    assert.deepEqual(resolveMediaTimeline({
        currentTime: 45,
        duration: Number.POSITIVE_INFINITY,
        seekable: createTimeRanges([[0, 120]])
    }, 420), {
        currentTime: 45,
        duration: 420,
        source: 'captured',
        seekableRanges: [{ start: 0, end: 120 }],
        canSeek: true
    });
});

test('timeline remains visible but non-seekable when no range is available', () => {
    const { resolveMediaTimeline } = loadMediaTimeline();

    assert.deepEqual(resolveMediaTimeline({
        currentTime: 15,
        duration: Number.POSITIVE_INFINITY,
        seekable: createTimeRanges([])
    }, 420), {
        currentTime: 15,
        duration: 420,
        source: 'captured',
        seekableRanges: [],
        canSeek: false
    });
});

test('verified frame duration overrides changing bitrate estimates on the native stream', () => {
    const { resolveMediaTimeline } = loadMediaTimeline();
    const media = { currentTime: 900, duration: 796, seekable: createTimeRanges([[0, 950]]) };
    for (const estimate of [796, 1005, 796]) {
        media.duration = estimate;
        const result = resolveMediaTimeline(media, 990.5493333333334, true);
        assert.equal(result.currentTime, 900);
        assert.equal(result.duration, 990.5493333333334);
        assert.equal(result.source, 'captured');
    }
});

test('seek target stays exact inside a loaded range', () => {
    const { resolveSeekTarget } = loadMediaTimeline();
    const media = { seekable: createTimeRanges([[0, 120], [180, 240]]) };

    assert.equal(resolveSeekTarget(media, 90, 'forward'), 90);
    assert.equal(resolveSeekTarget(media, 210, 'backward'), 210);
});

test('seek target clamps safely across gaps and unloaded tails', () => {
    const { resolveSeekTarget } = loadMediaTimeline();
    const media = { seekable: createTimeRanges([[0, 120], [180, 240]]) };

    assert.equal(resolveSeekTarget(media, 150, 'backward'), 120);
    assert.equal(resolveSeekTarget(media, 150, 'forward'), 180);
    assert.equal(resolveSeekTarget(media, 300, 'forward'), 240);
    assert.equal(resolveSeekTarget(media, -15, 'backward'), 0);
});

test('seek target is unavailable without a valid seekable range', () => {
    const { resolveSeekTarget } = loadMediaTimeline();

    assert.equal(resolveSeekTarget({ seekable: createTimeRanges([]) }, 30, 'forward'), null);
    assert.equal(resolveSeekTarget({ seekable: createTimeRanges([[20, 10]]) }, 15, 'forward'), null);
});

test('completed blob metadata returns an exact duration and releases its URL', async () => {
    const { probeBlobDuration } = loadMediaTimeline();
    const listeners = new Map();
    const audio = {
        duration: Number.NaN,
        addEventListener: (name, listener) => listeners.set(name, listener),
        removeEventListener: (name) => listeners.delete(name),
        removeAttribute() {},
        load() {
            this.duration = 420;
            listeners.get('loadedmetadata')?.({ type: 'loadedmetadata' });
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

test('indefinite completed blob metadata is resolved only on a detached probe', async () => {
    const { probeBlobDuration } = loadMediaTimeline();
    const listeners = new Map();
    let probeCurrentTime = 0;
    const audio = {
        duration: Number.POSITIVE_INFINITY,
        readyState: 1,
        addEventListener: (name, listener) => listeners.set(name, listener),
        removeEventListener: (name) => listeners.delete(name),
        removeAttribute() {},
        load() {
            listeners.get('loadedmetadata')?.({ type: 'loadedmetadata' });
        }
    };
    Object.defineProperty(audio, 'currentTime', {
        get: () => probeCurrentTime,
        set: (value) => {
            probeCurrentTime = value;
            audio.duration = 420;
            listeners.get('durationchange')?.({ type: 'durationchange' });
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

const createStyle = () => ({
    cssText: '',
    setProperty(name, value) {
        this[name] = value;
    }
});

class FakeElement {
    constructor(tagName, ownerDocument) {
        this.tagName = `${tagName || ''}`.toUpperCase();
        this.ownerDocument = ownerDocument;
        this.children = [];
        this.parentNode = null;
        this.attributes = new Map();
        this.listeners = new Map();
        this.dataset = {};
        this.style = createStyle();
        this.disabled = false;
        this.id = '';
        this.className = '';
        this.title = '';
        this.type = '';
        this.value = '';
        this.min = '';
        this.max = '';
        this._textContent = '';
        this._innerHTML = '';
    }

    set textContent(value) {
        this._textContent = `${value ?? ''}`;
    }

    get textContent() {
        return `${this._textContent}${this.children.map((child) => child.textContent || '').join('')}`;
    }

    set innerHTML(value) {
        this._innerHTML = `${value ?? ''}`;
    }

    get innerHTML() {
        return this._innerHTML;
    }

    get innerText() {
        return this.textContent;
    }

    append(...children) {
        children.forEach((child) => this.appendChild(child));
    }

    appendChild(child) {
        if (!child) return child;
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
        this.parentNode = null;
    }

    setAttribute(name, value) {
        this.attributes.set(name, `${value}`);
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }

    removeAttribute(name) {
        this.attributes.delete(name);
        if (name === 'src') this.src = '';
    }

    addEventListener(name, listener) {
        if (!this.listeners.has(name)) this.listeners.set(name, new Set());
        this.listeners.get(name).add(listener);
    }

    removeEventListener(name, listener) {
        this.listeners.get(name)?.delete(listener);
    }

    dispatchEvent(event) {
        event.target ||= this;
        this.listeners.get(event.type)?.forEach((listener) => listener.call(this, event));
        return true;
    }

    click() {
        if (this.disabled) return;
        const event = {
            type: 'click',
            target: this,
            preventDefault() {},
            stopPropagation() {}
        };
        this.onclick?.(event);
        this.dispatchEvent(event);
    }

    contains(target) {
        return target === this || this.children.some((child) => child.contains?.(target));
    }

    closest(selector) {
        if (selector === 'button' && this.tagName === 'BUTTON') return this;
        return this.parentNode?.closest?.(selector) || null;
    }

    getBoundingClientRect() {
        return { left: 0, top: 0, width: 560, height: 120 };
    }

    get offsetWidth() {
        return 560;
    }

    get offsetHeight() {
        return 120;
    }

    matches(selector) {
        if (selector === 'audio') return this.tagName === 'AUDIO';
        if (selector === 'button') return this.tagName === 'BUTTON';
        if (selector === 'button[data-rate]') return this.tagName === 'BUTTON' && this.dataset.rate !== undefined;
        if (selector === 'button[data-hover-token]') {
            return this.tagName === 'BUTTON' && this.dataset.hoverToken !== undefined;
        }
        if (selector === 'input[type="range"]') return this.tagName === 'INPUT' && this.type === 'range';
        return false;
    }

    querySelectorAll(selector) {
        const matches = [];
        const visit = (element) => {
            element.children.forEach((child) => {
                if (child.matches?.(selector)) matches.push(child);
                visit(child);
            });
        };
        visit(this);
        return matches;
    }

    querySelector(selector) {
        if (selector === 'svg') return null;
        return this.querySelectorAll(selector)[0] || null;
    }
}

const createTimeRangesForHarness = (ranges) => createTimeRanges(ranges);

class FakeMediaElement extends FakeElement {
    constructor(tagName, ownerDocument) {
        super(tagName, ownerDocument);
        this.currentSrc = '';
        this.src = '';
        this.srcObject = null;
        this.currentTime = 0;
        this.duration = Number.POSITIVE_INFINITY;
        this.seekable = createTimeRangesForHarness([]);
        this.buffered = createTimeRangesForHarness([]);
        this.readyState = 1;
        this.networkState = 1;
        this.paused = true;
        this.ended = false;
        this.playbackRate = 1;
        this.playCalls = 0;
        this.pauseCalls = 0;
        this.loadCalls = 0;
        this.playImplementation = null;
        this.pauseImplementation = null;
    }

    play() {
        this.playCalls += 1;
        if (typeof this.playImplementation === 'function') {
            return this.playImplementation.call(this);
        }
        this.paused = false;
        return Promise.resolve();
    }

    pause() {
        this.pauseCalls += 1;
        if (typeof this.pauseImplementation === 'function') {
            return this.pauseImplementation.call(this);
        }
        this.paused = true;
    }

    load() {
        this.loadCalls += 1;
    }
}

class FakeAudioElement extends FakeMediaElement {
    constructor(ownerDocument) {
        super('audio', ownerDocument);
    }
}

class FakeDocument {
    constructor() {
        this.listeners = new Map();
        this._audioElements = [];
        this.documentElement = new FakeElement('html', this);
        this.head = new FakeElement('head', this);
        this.body = new FakeElement('body', this);
        this.documentElement.append(this.head, this.body);
        this.title = 'Test conversation - ChatGPT';
        this.visibilityState = 'visible';
    }

    createElement(tagName) {
        const element = `${tagName}`.toLowerCase() === 'audio'
            ? new FakeAudioElement(this)
            : new FakeElement(tagName, this);
        if (element instanceof FakeAudioElement) this._audioElements.push(element);
        return element;
    }

    getElementById(id) {
        const visit = (element) => {
            if (element.id === id) return element;
            for (const child of element.children) {
                const match = visit(child);
                if (match) return match;
            }
            return null;
        };
        return visit(this.documentElement);
    }

    querySelectorAll(selector) {
        if (selector === 'audio') return [...this._audioElements];
        return this.documentElement.querySelectorAll(selector);
    }

    addEventListener(name, listener) {
        if (!this.listeners.has(name)) this.listeners.set(name, new Set());
        this.listeners.get(name).add(listener);
    }

    removeEventListener(name, listener) {
        this.listeners.get(name)?.delete(listener);
    }

    dispatchEvent(event) {
        this.listeners.get(event.type)?.forEach((listener) => listener.call(this, event));
        return true;
    }
}

const findElement = (root, predicate) => {
    if (predicate(root)) return root;
    for (const child of root.children || []) {
        const match = findElement(child, predicate);
        if (match) return match;
    }
    return null;
};

const flushMicrotasks = async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
};

const createContentScriptHarness = ({
    capturedDuration = 420,
    capturedPlaybackMode = 'ready',
    capturedSeekable = [[0, capturedDuration]],
    captureBytes = new Uint8Array([1, 2, 3]),
    deferCaptureCompletion = false,
    now = () => Date.now()
} = {}) => {
    const mediaTimeline = loadMediaTimeline();
    const capturedPlayback = loadCapturedPlayback();
    const document = new FakeDocument();
    const intervalCallbacks = new Map();
    const windowListeners = new Map();
    const capturedAudioElements = [];
    const capturedBlobs = [];
    const capturedPlaybackControllers = [];
    const capturedPlaybackTimeouts = [];
    const revokedPlaybackUrls = [];
    let nextIntervalId = 1;
    let nextCapturedUrlId = 1;
    let resolveDeferredCapture = null;
    const deferredCapture = deferCaptureCompletion
        ? new Promise((resolve) => {
            resolveDeferredCapture = resolve;
        })
        : null;

    class FakeCustomEvent {
        constructor(type, options = {}) {
            this.type = type;
            this.detail = options.detail;
        }
    }

    const settings = Object.freeze({
        skipBackSeconds: 15,
        skipForwardSeconds: 15,
        playbackRate: 1,
        theme: 'system'
    });
    const createResponse = () => ({
        body: null,
        headers: { get: () => 'audio/aac' },
        arrayBuffer: () => deferredCapture || Promise.resolve(captureBytes.buffer),
        clone: () => createResponse()
    });
    const context = {
        AbortController,
        Blob,
        CustomEvent: FakeCustomEvent,
        Date: { now },
        Document: FakeDocument,
        HTMLAudioElement: FakeAudioElement,
        HTMLMediaElement: FakeMediaElement,
        Request: class Request {},
        TextEncoder,
        URL,
        URLSearchParams,
        clearInterval: (id) => intervalCallbacks.delete(id),
        clearTimeout,
        console,
        document,
        fetch: async () => createResponse(),
        innerHeight: 900,
        innerWidth: 1440,
        localStorage: {
            getItem: () => null,
            removeItem() {}
        },
        location: { href: 'https://chatgpt.com/c/test' },
        matchMedia: () => ({
            matches: false,
            addEventListener() {}
        }),
        setInterval: (callback) => {
            const id = nextIntervalId;
            nextIntervalId += 1;
            intervalCallbacks.set(id, callback);
            return id;
        },
        setTimeout,
        addEventListener: (name, listener) => {
            if (!windowListeners.has(name)) windowListeners.set(name, new Set());
            windowListeners.get(name).add(listener);
        }
    };
    context.window = context;
    context.globalThis = context;
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
    context.AEPlayerMediaTimeline = {
        ...mediaTimeline,
        probeBlobDuration: async () => capturedDuration
    };
    context.AEPlayerAacContainer = require('../src/js/aac-container.js');
    context.AEPlayerCapturedPlayback = {
        createCapturedPlayback: (blob) => {
            capturedBlobs.push(blob);
            const capturedAudio = document.createElement('audio');
            capturedAudioElements.push(capturedAudio);
            if (capturedPlaybackMode === 'ready') {
                capturedAudio.readyState = 1;
                capturedAudio.duration = capturedDuration;
                capturedAudio.seekable = createTimeRangesForHarness(capturedSeekable);
            } else {
                capturedAudio.readyState = 0;
                capturedAudio.seekable = createTimeRangesForHarness([]);
            }

            const controller = capturedPlayback.createCapturedPlayback(blob, {
                createAudio: () => capturedAudio,
                createObjectURL: () => {
                    const url = `blob:captured-playback-${nextCapturedUrlId}`;
                    nextCapturedUrlId += 1;
                    return url;
                },
                revokeObjectURL: (url) => revokedPlaybackUrls.push(url),
                setTimeout: (callback) => {
                    const timeout = { active: true, callback };
                    capturedPlaybackTimeouts.push(timeout);
                    return timeout;
                },
                clearTimeout: (timeout) => {
                    timeout.active = false;
                }
            });
            capturedPlaybackControllers.push(controller);
            return controller;
        }
    };

    vm.runInNewContext(fs.readFileSync(contentScriptPath, 'utf8'), context, {
        filename: contentScriptPath
    });

    const createAudio = (source, options = {}) => {
        const element = document.createElement('audio');
        element.src = source;
        element.currentSrc = source;
        element.currentTime = options.currentTime ?? 0;
        element.duration = options.duration ?? Number.POSITIVE_INFINITY;
        element.seekable = createTimeRangesForHarness(options.seekable || []);
        return element;
    };
    const findPlayerElement = (predicate) => {
        const player = document.getElementById('ae_enhanced_player');
        return player ? findElement(player, predicate) : null;
    };
    const findButton = (label) => findPlayerElement((element) => (
        element.tagName === 'BUTTON' && element.getAttribute('aria-label') === label
    ));
    const runIntervals = async () => {
        for (const callback of [...intervalCallbacks.values()]) callback();
        await flushMicrotasks();
    };
    const makeCapturedReady = async (index = capturedAudioElements.length - 1) => {
        const capturedAudio = capturedAudioElements[index];
        capturedAudio.readyState = 1;
        capturedAudio.duration = capturedDuration;
        capturedAudio.seekable = createTimeRangesForHarness(capturedSeekable);
        capturedAudio.dispatchEvent({ type: 'loadedmetadata' });
        await flushMicrotasks();
    };
    const expireCapturedPlayback = async (index = capturedPlaybackTimeouts.length - 1) => {
        const timeout = capturedPlaybackTimeouts[index];
        if (timeout?.active) timeout.callback();
        await flushMicrotasks();
    };
    const completeCapture = async () => {
        resolveDeferredCapture?.(new Uint8Array([1, 2, 3]).buffer);
        await flushMicrotasks();
    };

    return {
        capturedAudioElements,
        capturedBlobs,
        capturedPlaybackControllers,
        completeCapture,
        context,
        createAudio,
        expireCapturedPlayback,
        findButton,
        findPlayerElement,
        flushMicrotasks,
        makeCapturedReady,
        revokedPlaybackUrls,
        runIntervals
    };
};

test('pause stays disabled and announces preparation until captured playback is seek ready', async () => {
    const harness = createContentScriptHarness({ capturedPlaybackMode: 'loading' });
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const pageAudio = harness.createAudio('blob:page-read-aloud', {
        currentTime: 30,
        seekable: [[0, 90]]
    });
    await pageAudio.play();
    await harness.flushMicrotasks();

    const preparingButton = harness.findButton('Preparing resumable playback');
    assert.ok(preparingButton);
    assert.equal(preparingButton.disabled, true);
    assert.equal(pageAudio.pauseCalls, 0);

    await harness.makeCapturedReady();
    const pauseButton = harness.findButton('Pause');
    assert.ok(pauseButton);
    assert.equal(pauseButton.disabled, false);
    assert.equal(pageAudio.pauseCalls, 0);
});

test('captured preparation does not autoplay or replace the page owner', async () => {
    const harness = createContentScriptHarness();
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const pageAudio = harness.createAudio('blob:page-read-aloud', {
        currentTime: 30,
        seekable: [[0, 90]]
    });
    await pageAudio.play();
    await harness.flushMicrotasks();
    const capturedAudio = harness.capturedAudioElements[0];

    harness.context.document.dispatchEvent(new harness.context.CustomEvent(
        'ae-read-aloud-player:settings',
        { detail: { settings: { playbackRate: 2 } } }
    ));

    assert.equal(capturedAudio.playCalls, 0);
    assert.equal(pageAudio.playbackRate, 2);
    assert.equal(capturedAudio.playbackRate, 1);
    assert.equal(pageAudio.pauseCalls, 0);
});

test('failed preparation leaves page playback untouched and download available', async () => {
    const harness = createContentScriptHarness({ capturedPlaybackMode: 'failed' });
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const pageAudio = harness.createAudio('blob:page-read-aloud', {
        currentTime: 30,
        seekable: [[0, 90]]
    });
    await pageAudio.play();
    await harness.flushMicrotasks();
    await harness.expireCapturedPlayback();

    const unavailableButton = harness.findButton('Pause unavailable');
    const downloadButton = harness.findButton('Download audio');
    assert.ok(unavailableButton);
    assert.equal(unavailableButton.disabled, true);
    assert.ok(downloadButton);
    assert.equal(downloadButton.disabled, false);
    assert.equal(pageAudio.pauseCalls, 0);
    unavailableButton.click();
    assert.equal(pageAudio.pauseCalls, 0);
});

test('prepared extension audio never enters page candidate ownership', async () => {
    const harness = createContentScriptHarness();
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    await harness.flushMicrotasks();
    const capturedAudio = harness.capturedAudioElements[0];

    await capturedAudio.play();
    await harness.flushMicrotasks();
    await harness.runIntervals();

    assert.equal(harness.context.document.getElementById('ae_enhanced_player'), null);
});

test('new response and close release pending preparation before late readiness', async () => {
    const harness = createContentScriptHarness({ capturedPlaybackMode: 'loading' });
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const firstPageAudio = harness.createAudio('blob:first-page-read-aloud', { seekable: [[0, 90]] });
    await firstPageAudio.play();
    await harness.flushMicrotasks();
    const firstCapturedAudio = harness.capturedAudioElements[0];

    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    await harness.flushMicrotasks();
    assert.equal(firstCapturedAudio.src, '');
    assert.equal(firstCapturedAudio.pauseCalls, 1);

    const secondPageAudio = harness.createAudio('blob:second-page-read-aloud', { seekable: [[0, 90]] });
    await secondPageAudio.play();
    await harness.flushMicrotasks();
    const secondCapturedAudio = harness.capturedAudioElements[1];
    harness.findButton('Close player').click();

    assert.equal(secondCapturedAudio.src, '');
    assert.equal(secondCapturedAudio.pauseCalls, 1);
    await harness.makeCapturedReady(0);
    await harness.makeCapturedReady(1);
    await harness.runIntervals();
    assert.equal(harness.context.document.getElementById('ae_enhanced_player'), null);
    assert.equal(harness.revokedPlaybackUrls.length, 2);
});

test('first pause transfers exact position and rate before pausing the page stream', async () => {
    const harness = createContentScriptHarness();
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const pageAudio = harness.createAudio('blob:page-read-aloud', {
        currentTime: 84,
        seekable: [[0, 420]]
    });
    await pageAudio.play();
    await harness.flushMicrotasks();
    const capturedAudio = harness.capturedAudioElements[0];

    harness.context.document.dispatchEvent(new harness.context.CustomEvent(
        'ae-read-aloud-player:settings',
        { detail: { settings: { playbackRate: 2 } } }
    ));
    let stateWhenPagePaused = null;
    pageAudio.pauseImplementation = function () {
        this.paused = true;
        stateWhenPagePaused = {
            capturedCurrentTime: capturedAudio.currentTime,
            capturedPlaybackRate: capturedAudio.playbackRate
        };
    };

    harness.findButton('Pause').click();
    await harness.flushMicrotasks();

    assert.deepEqual(stateWhenPagePaused, {
        capturedCurrentTime: 84,
        capturedPlaybackRate: 2
    });
    assert.equal(pageAudio.pauseCalls, 1);
    assert.equal(capturedAudio.paused, true);
});

test('indexed capture keeps a stable total and supports pause past the native duration estimate', async () => {
    const captureBytes = Uint8Array.from(Array.from({ length: 3000 }, () =>
        [0xff, 0xf1, 0x58, 0x40, 1, 0x1f, 0xfc, 0]).flat());
    const harness = createContentScriptHarness({ capturedDuration: 128, captureBytes });
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const pageAudio = harness.createAudio('blob:long-page-read-aloud', {
        currentTime: 110, duration: 100, seekable: [[0, 120]]
    });
    await pageAudio.play();
    // Blob.arrayBuffer() crosses a Node task boundary for the larger capture.
    await new Promise(setImmediate);
    await harness.flushMicrotasks();
    assert.equal(harness.capturedBlobs[0].type, 'audio/mp4');
    assert.ok(harness.findPlayerElement(e => e.textContent === '1:50'));
    assert.ok(harness.findPlayerElement(e => e.textContent === '2:08'));
    harness.findButton('Pause').click();
    await harness.flushMicrotasks();
    assert.equal(pageAudio.paused, true);
    assert.equal(harness.capturedAudioElements[0].currentTime, 110);
    harness.findButton('Play').click();
    await harness.flushMicrotasks();
    assert.equal(harness.capturedAudioElements[0].paused, false);
});

test('first pause rejects an unavailable exact position without pausing the page stream', async () => {
    const harness = createContentScriptHarness({
        capturedSeekable: [[0, 60], [120, 420]]
    });
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const pageAudio = harness.createAudio('blob:page-read-aloud', {
        currentTime: 90,
        seekable: [[0, 420]]
    });
    await pageAudio.play();
    await harness.flushMicrotasks();

    harness.findButton('Pause').click();
    await harness.flushMicrotasks();

    assert.equal(pageAudio.pauseCalls, 0);
    assert.equal(pageAudio.paused, false);
    assert.equal(harness.capturedAudioElements[0].currentTime, 0);
    assert.ok(harness.findButton('Pause'));
});

test('pause after the loaded timeline stays nonzero and Play resumes from that position on first pause', async () => {
    const harness = createContentScriptHarness({ capturedDuration: 420 });
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const pageAudio = harness.createAudio('blob:page-read-aloud', {
        currentTime: 84,
        seekable: [[0, 420]]
    });
    await pageAudio.play();
    await harness.flushMicrotasks();
    const capturedAudio = harness.capturedAudioElements[0];
    const seekBar = harness.findPlayerElement((element) => element.tagName === 'INPUT' && element.type === 'range');

    harness.findButton('Pause').click();
    await harness.flushMicrotasks();
    await harness.runIntervals();

    const playButton = harness.findButton('Play');
    assert.equal(capturedAudio.currentTime, 84);
    assert.equal(seekBar.disabled, false);
    assert.equal(seekBar.value, '200');
    assert.ok(playButton);
    assert.equal(playButton.disabled, false);
    assert.equal(harness.findButton('Skip back 15 seconds').disabled, false);
    assert.equal(harness.findButton('Skip forward 15 seconds').disabled, false);
    assert.equal(pageAudio.pauseCalls, 1);

    playButton.click();
    await harness.flushMicrotasks();
    await harness.runIntervals();

    assert.equal(capturedAudio.playCalls, 1);
    assert.equal(capturedAudio.currentTime, 84);
    assert.equal(seekBar.value, '200');
    assert.ok(harness.findButton('Pause'));
});

test('scrub pause settle and resume keep seek and skip enabled at the accepted position', async () => {
    const harness = createContentScriptHarness({ capturedDuration: 420 });
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const pageAudio = harness.createAudio('blob:page-read-aloud', {
        currentTime: 60,
        seekable: [[0, 420]]
    });
    await pageAudio.play();
    await harness.flushMicrotasks();
    const capturedAudio = harness.capturedAudioElements[0];
    const seekBar = harness.findPlayerElement((element) => element.tagName === 'INPUT' && element.type === 'range');

    seekBar.value = '500';
    seekBar.oninput();
    assert.equal(pageAudio.currentTime, 210);
    harness.findButton('Pause').click();
    await harness.flushMicrotasks();
    await harness.runIntervals();

    assert.equal(capturedAudio.currentTime, 210);
    assert.equal(seekBar.value, '500');
    assert.equal(seekBar.disabled, false);
    assert.equal(harness.findButton('Skip back 15 seconds').disabled, false);
    assert.equal(harness.findButton('Skip forward 15 seconds').disabled, false);

    harness.findButton('Play').click();
    await harness.flushMicrotasks();
    await harness.runIntervals();
    assert.equal(capturedAudio.currentTime, 210);
    assert.equal(seekBar.value, '500');
    assert.equal(seekBar.disabled, false);
});

test('resume seek repeated skips and speed changes target only the captured owner', async () => {
    const harness = createContentScriptHarness({ capturedDuration: 420 });
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const pageAudio = harness.createAudio('blob:page-read-aloud', {
        currentTime: 100,
        seekable: [[0, 420]]
    });
    await pageAudio.play();
    await harness.flushMicrotasks();
    const capturedAudio = harness.capturedAudioElements[0];
    harness.findButton('Pause').click();
    await harness.flushMicrotasks();

    harness.findButton('Skip back 15 seconds').click();
    assert.equal(capturedAudio.currentTime, 85);
    harness.findButton('Skip forward 15 seconds').click();
    assert.equal(capturedAudio.currentTime, 100);
    const seekBar = harness.findPlayerElement((element) => element.tagName === 'INPUT' && element.type === 'range');
    seekBar.value = '500';
    seekBar.oninput();
    assert.equal(capturedAudio.currentTime, 210);

    harness.context.document.dispatchEvent(new harness.context.CustomEvent(
        'ae-read-aloud-player:settings',
        { detail: { settings: { playbackRate: 1.5 } } }
    ));
    const elapsed = harness.findPlayerElement((element) => element.title === 'Elapsed listening time at 1.5x');
    const total = harness.findPlayerElement((element) => element.title === 'Total listening time at 1.5x');
    assert.equal(capturedAudio.playbackRate, 1.5);
    assert.equal(pageAudio.playbackRate, 1);
    assert.equal(elapsed?.textContent, '2:20');
    assert.equal(total?.textContent, '4:40');
    assert.equal(seekBar.value, '500');

    harness.findButton('Play').click();
    await harness.flushMicrotasks();
    assert.equal(capturedAudio.playCalls, 1);
    assert.equal(pageAudio.playCalls, 1);
});

test('captured play rejection leaves Play visible while seek and skip stay enabled', async () => {
    const harness = createContentScriptHarness({ capturedDuration: 420 });
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const pageAudio = harness.createAudio('blob:page-read-aloud', {
        currentTime: 84,
        seekable: [[0, 420]]
    });
    await pageAudio.play();
    await harness.flushMicrotasks();
    const capturedAudio = harness.capturedAudioElements[0];
    harness.findButton('Pause').click();
    await harness.flushMicrotasks();
    capturedAudio.playImplementation = function () {
        this.paused = true;
        return Promise.reject(new Error('captured play rejected'));
    };

    harness.findButton('Play').click();
    await harness.flushMicrotasks();
    await harness.runIntervals();

    assert.equal(capturedAudio.paused, true);
    assert.ok(harness.findButton('Play'));
    assert.equal(harness.findButton('Skip back 15 seconds').disabled, false);
    assert.equal(harness.findButton('Skip forward 15 seconds').disabled, false);
    const seekBar = harness.findPlayerElement((element) => element.tagName === 'INPUT' && element.type === 'range');
    assert.equal(seekBar.disabled, false);
    assert.equal(seekBar.value, '200');
});

test('close pauses the captured owner unloads it and revokes its URL once', async () => {
    const harness = createContentScriptHarness();
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const pageAudio = harness.createAudio('blob:page-read-aloud', {
        currentTime: 84,
        seekable: [[0, 420]]
    });
    await pageAudio.play();
    await harness.flushMicrotasks();
    const capturedAudio = harness.capturedAudioElements[0];

    harness.findButton('Pause').click();
    await harness.flushMicrotasks();
    harness.findButton('Play').click();
    await harness.flushMicrotasks();
    harness.findButton('Close player').click();

    assert.equal(capturedAudio.pauseCalls, 1);
    assert.equal(capturedAudio.src, '');
    assert.deepEqual(harness.revokedPlaybackUrls, ['blob:captured-playback-1']);
    assert.equal(pageAudio.pauseCalls, 1);
    assert.equal(harness.context.document.getElementById('ae_enhanced_player'), null);
});

test('second speech response releases the old captured owner without pausing page competitors', async () => {
    const harness = createContentScriptHarness();
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const pageAudio = harness.createAudio('blob:first-page-read-aloud', {
        currentTime: 84,
        seekable: [[0, 420]]
    });
    await pageAudio.play();
    await harness.flushMicrotasks();
    const capturedAudio = harness.capturedAudioElements[0];
    harness.findButton('Pause').click();
    await harness.flushMicrotasks();
    harness.findButton('Play').click();
    await harness.flushMicrotasks();

    const competitorAudio = harness.createAudio('blob:page-competitor', { seekable: [[0, 420]] });
    await competitorAudio.play();
    await harness.flushMicrotasks();
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    await harness.flushMicrotasks();

    assert.equal(capturedAudio.pauseCalls, 1);
    assert.equal(capturedAudio.src, '');
    assert.equal(competitorAudio.pauseCalls, 0);
    assert.equal(pageAudio.pauseCalls, 1);
    assert.equal(harness.revokedPlaybackUrls[0], 'blob:captured-playback-1');
});

test('late captured readiness cannot reopen a closed player or mutate a replacement session', async () => {
    const harness = createContentScriptHarness({ capturedPlaybackMode: 'loading' });
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const firstPageAudio = harness.createAudio('blob:first-page-read-aloud', { seekable: [[0, 420]] });
    await firstPageAudio.play();
    await harness.flushMicrotasks();

    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    await harness.flushMicrotasks();
    const secondPageAudio = harness.createAudio('blob:second-page-read-aloud', { seekable: [[0, 420]] });
    await secondPageAudio.play();
    await harness.flushMicrotasks();
    await harness.makeCapturedReady(0);

    assert.ok(harness.findButton('Preparing resumable playback'));
    harness.findButton('Close player').click();
    await harness.makeCapturedReady(1);
    await harness.runIntervals();

    assert.equal(harness.context.document.getElementById('ae_enhanced_player'), null);
    assert.equal(harness.revokedPlaybackUrls.length, 2);
});

test('close before capture completion prevents later captured playback allocation', async () => {
    const harness = createContentScriptHarness({ deferCaptureCompletion: true });
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const pageAudio = harness.createAudio('blob:page-read-aloud', { seekable: [[0, 420]] });
    await pageAudio.play();
    await harness.flushMicrotasks();

    harness.findButton('Close player').click();
    await harness.completeCapture();
    await harness.runIntervals();

    assert.equal(harness.capturedAudioElements.length, 0);
    assert.equal(harness.revokedPlaybackUrls.length, 0);
    assert.equal(harness.context.document.getElementById('ae_enhanced_player'), null);
});

test('ended captured owner cannot be replaced by competing page audio', async () => {
    const harness = createContentScriptHarness();
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const pageAudio = harness.createAudio('blob:page-read-aloud', {
        currentTime: 84,
        seekable: [[0, 420]]
    });
    await pageAudio.play();
    await harness.flushMicrotasks();
    harness.findButton('Pause').click();
    await harness.flushMicrotasks();
    const capturedAudio = harness.capturedAudioElements[0];
    capturedAudio.ended = true;
    capturedAudio.paused = true;

    const competitorAudio = harness.createAudio('blob:page-competitor', { seekable: [[0, 420]] });
    await competitorAudio.play();
    await harness.flushMicrotasks();
    await harness.runIntervals();
    harness.context.document.dispatchEvent(new harness.context.CustomEvent(
        'ae-read-aloud-player:settings',
        { detail: { settings: { playbackRate: 2 } } }
    ));

    assert.equal(capturedAudio.playbackRate, 2);
    assert.equal(competitorAudio.playbackRate, 1);
    assert.equal(competitorAudio.pauseCalls, 0);
    assert.ok(harness.findButton('Play'));
});

test('passive tracking never pauses another page-owned Read Aloud element', async () => {
    const harness = createContentScriptHarness();
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const firstAudio = harness.createAudio('blob:first-read-aloud');
    const secondAudio = harness.createAudio('blob:second-read-aloud');

    await firstAudio.play();
    await secondAudio.play();
    await harness.flushMicrotasks();

    assert.equal(firstAudio.pauseCalls, 0);
    assert.equal(secondAudio.pauseCalls, 0);
});

test('pause and resume keep targeting the session-owned audio element', async () => {
    const harness = createContentScriptHarness();
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const ownedAudio = harness.createAudio('blob:owned-read-aloud', {
        currentTime: 90,
        seekable: [[0, 180]]
    });
    await ownedAudio.play();
    await harness.flushMicrotasks();
    const capturedAudio = harness.capturedAudioElements[0];

    const staleAudio = harness.createAudio('blob:stale-candidate', {
        currentTime: 30,
        seekable: [[0, 180]]
    });
    staleAudio.paused = false;

    const playPauseButton = harness.findButton('Pause');
    assert.ok(playPauseButton);
    playPauseButton.click();
    await harness.flushMicrotasks();
    await harness.runIntervals();

    assert.equal(ownedAudio.pauseCalls, 1);
    assert.equal(staleAudio.pauseCalls, 0);
    assert.equal(playPauseButton.getAttribute('aria-label'), 'Play');

    playPauseButton.click();
    await harness.flushMicrotasks();
    await harness.runIntervals();

    assert.equal(ownedAudio.playCalls, 1);
    assert.equal(capturedAudio.playCalls, 1);
    assert.equal(staleAudio.playCalls, 0);
    assert.equal(playPauseButton.getAttribute('aria-label'), 'Pause');
});

test('a newly played competitor cannot replace a valid paused session owner', async () => {
    const harness = createContentScriptHarness();
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const ownedAudio = harness.createAudio('blob:owned-read-aloud', {
        currentTime: 90,
        seekable: [[0, 180]]
    });
    await ownedAudio.play();
    await harness.flushMicrotasks();
    const capturedAudio = harness.capturedAudioElements[0];

    const playPauseButton = harness.findButton('Pause');
    playPauseButton.click();
    await harness.flushMicrotasks();

    const competitorAudio = harness.createAudio('blob:competing-read-aloud', {
        currentTime: 15,
        seekable: [[0, 180]]
    });
    await competitorAudio.play();
    await harness.flushMicrotasks();
    await harness.runIntervals();

    assert.equal(playPauseButton.getAttribute('aria-label'), 'Play');
    assert.equal(ownedAudio.pauseCalls, 1);
    assert.equal(competitorAudio.pauseCalls, 0);

    harness.context.document.dispatchEvent(new harness.context.CustomEvent(
        'ae-read-aloud-player:settings',
        { detail: { settings: { playbackRate: 2 } } }
    ));
    assert.equal(ownedAudio.playbackRate, 1);
    assert.equal(capturedAudio.playbackRate, 2);
    assert.equal(competitorAudio.playbackRate, 1);

    playPauseButton.click();
    await harness.flushMicrotasks();
    assert.equal(ownedAudio.playCalls, 1);
    assert.equal(capturedAudio.playCalls, 1);
    assert.equal(competitorAudio.playCalls, 1);

    harness.findButton('Close player').click();
    assert.equal(ownedAudio.pauseCalls, 1);
    assert.equal(competitorAudio.pauseCalls, 0);
    assert.equal(harness.context.document.getElementById('ae_enhanced_player'), null);
});

test('a rejected play attempt never becomes the session owner', async () => {
    const harness = createContentScriptHarness();
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const rejectedAudio = harness.createAudio('blob:rejected-read-aloud', {
        seekable: [[0, 180]]
    });
    rejectedAudio.playImplementation = function () {
        this.paused = true;
        return Promise.reject(new Error('playback rejected'));
    };

    await assert.rejects(rejectedAudio.play(), /playback rejected/);
    await harness.flushMicrotasks();
    await harness.runIntervals();

    assert.equal(harness.context.document.getElementById('ae_enhanced_player'), null);

    const playableAudio = harness.createAudio('blob:playable-read-aloud', {
        seekable: [[0, 180]]
    });
    await playableAudio.play();
    await harness.flushMicrotasks();

    harness.findButton('Pause').click();
    assert.equal(rejectedAudio.pauseCalls, 0);
    assert.equal(playableAudio.pauseCalls, 1);
});

test('a pre-session play that resolves later cannot claim the new response', async () => {
    const harness = createContentScriptHarness();
    let resolvePendingPlay;
    const earlierAudio = harness.createAudio('blob:earlier-read-aloud', {
        seekable: [[0, 180]]
    });
    earlierAudio.playImplementation = function () {
        return new Promise((resolve) => {
            resolvePendingPlay = () => {
                this.paused = false;
                resolve();
            };
        });
    };

    const earlierPlay = earlierAudio.play();
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    resolvePendingPlay();
    await earlierPlay;
    await harness.flushMicrotasks();
    await harness.runIntervals();

    assert.equal(harness.context.document.getElementById('ae_enhanced_player'), null);

    const newAudio = harness.createAudio('blob:new-read-aloud', {
        seekable: [[0, 180]]
    });
    await newAudio.play();
    await harness.flushMicrotasks();

    harness.findButton('Pause').click();
    assert.equal(earlierAudio.pauseCalls, 0);
    assert.equal(newAudio.pauseCalls, 1);
});

test('skip controls use the owned element and clamp to loaded seekable ranges', async () => {
    const harness = createContentScriptHarness();
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const ownedAudio = harness.createAudio('blob:owned-read-aloud', {
        currentTime: 180,
        seekable: [[0, 120], [180, 240]]
    });
    await ownedAudio.play();
    await harness.flushMicrotasks();

    harness.findButton('Skip back 15 seconds').click();
    assert.equal(ownedAudio.currentTime, 120);

    ownedAudio.currentTime = 115;
    harness.findButton('Skip forward 15 seconds').click();
    assert.equal(ownedAudio.currentTime, 180);
});

test('captured duration enables partial seeking and speed-adjusted labels without moving position', async () => {
    const harness = createContentScriptHarness({ capturedDuration: 420 });
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const ownedAudio = harness.createAudio('blob:owned-read-aloud', {
        currentTime: 60,
        seekable: [[0, 120], [180, 240]]
    });
    await ownedAudio.play();
    await harness.flushMicrotasks();

    const seekBar = harness.findPlayerElement((element) => element.tagName === 'INPUT' && element.type === 'range');
    assert.ok(seekBar);
    assert.equal(seekBar.style.display, 'block');
    assert.equal(seekBar.disabled, false);
    assert.equal(seekBar.value, '143');

    harness.context.document.dispatchEvent(new harness.context.CustomEvent(
        'ae-read-aloud-player:settings',
        { detail: { settings: { playbackRate: 2 } } }
    ));

    const elapsed = harness.findPlayerElement((element) => element.title === 'Elapsed listening time at 2x');
    const total = harness.findPlayerElement((element) => element.title === 'Total listening time at 2x');
    assert.equal(elapsed?.textContent, '0:30');
    assert.equal(total?.textContent, '3:30');
    assert.equal(ownedAudio.currentTime, 60);
    assert.equal(seekBar.value, '143');

    seekBar.value = '500';
    seekBar.oninput();
    assert.equal(ownedAudio.currentTime, 210);

    seekBar.value = '800';
    seekBar.oninput();
    assert.equal(ownedAudio.currentTime, 240);
    assert.equal(seekBar.value, '571');
});

test('a new speech response transfers controls only after its next audio element plays', async () => {
    const harness = createContentScriptHarness();
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const firstAudio = harness.createAudio('blob:first-read-aloud', { seekable: [[0, 120]] });
    await firstAudio.play();
    await harness.flushMicrotasks();

    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const secondAudio = harness.createAudio('blob:second-read-aloud', { seekable: [[0, 120]] });
    await secondAudio.play();
    await harness.flushMicrotasks();

    harness.findButton('Pause').click();
    await harness.flushMicrotasks();

    assert.equal(firstAudio.pauseCalls, 0);
    assert.equal(secondAudio.pauseCalls, 1);
});

test('a same-millisecond response cannot reclaim audio that played before the session', async () => {
    const harness = createContentScriptHarness({ now: () => 1000 });
    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const firstAudio = harness.createAudio('blob:first-read-aloud', { seekable: [[0, 120]] });
    await firstAudio.play();
    await harness.flushMicrotasks();

    await harness.context.fetch('https://chatgpt.com/backend-api/synthesize');
    await harness.flushMicrotasks();
    await harness.runIntervals();

    assert.equal(harness.context.document.getElementById('ae_enhanced_player'), null);
    assert.equal(firstAudio.pauseCalls, 0);
});

const listenToPlayback = (harness) => {
    const states = [];
    harness.context.document.addEventListener('ae-read-aloud-player:playback', event => states.push(event.detail));
    return states;
};

test('playback lifecycle reports native start and completion even in a hidden tab', async () => {
    const h = createContentScriptHarness();
    const states = listenToPlayback(h);
    h.context.document.visibilityState = 'hidden';
    h.context.document.dispatchEvent(new h.context.CustomEvent('ae-read-aloud-player:playback-intent', {
        detail: { responseId: 'answer-1', requestId: 'auto-1' }
    }));
    await h.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const audio = h.createAudio('blob:page-read-aloud');
    await audio.play();
    await h.flushMicrotasks();
    assert.ok(states.some(value => value.state === 'starting' && value.requestId === 'auto-1'));
    assert.ok(states.some(value => value.state === 'playing' && value.responseId === 'answer-1'));
    audio.ended = true;
    audio.paused = true;
    audio.dispatchEvent({ type: 'ended' });
    assert.equal(states.at(-1).state, 'ended');
    assert.equal(states.at(-1).sessionId, 1);
});

test('rejected automatic play reports the browser restriction without waiting for a timeout', async () => {
    const h = createContentScriptHarness();
    const states = listenToPlayback(h);
    h.context.document.dispatchEvent(new h.context.CustomEvent('ae-read-aloud-player:playback-intent', {
        detail: { responseId: 'answer', requestId: 'auto-blocked' }
    }));
    await h.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const audio = h.createAudio('blob:blocked-read-aloud');
    const error = new Error('play() requires a user gesture'); error.name = 'NotAllowedError';
    audio.playImplementation = () => Promise.reject(error);
    await assert.rejects(audio.play(), { name: 'NotAllowedError' });
    await h.flushMicrotasks();
    assert.equal(states.at(-1).state, 'error');
    assert.equal(states.at(-1).reason, 'autoplay-blocked');
    assert.equal(states.at(-1).requestId, 'auto-blocked');
});

test('native media failures retain a specific decoder error reason', async () => {
    const h = createContentScriptHarness(); const states = listenToPlayback(h);
    await h.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const audio = h.createAudio('blob:decode-failure'); await audio.play(); await h.flushMicrotasks();
    audio.error = { code: 3 }; audio.dispatchEvent({ type: 'error' });
    assert.equal(states.at(-1).reason, 'media-decode');
});

test('captured playback handoff holds pause and ignores ended from the replaced source', async () => {
    const h = createContentScriptHarness();
    const states = listenToPlayback(h);
    await h.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const audio = h.createAudio('blob:page-read-aloud', { currentTime: 20, seekable: [[0, 420]] });
    await audio.play();
    await h.runIntervals();
    h.findButton('Pause').click();
    await h.flushMicrotasks();
    assert.equal(states.at(-1).state, 'paused');
    const count = states.length;
    audio.dispatchEvent({ type: 'ended' });
    assert.equal(states.length, count);
    const captured = h.capturedAudioElements[0];
    await captured.play();
    captured.dispatchEvent({ type: 'playing' });
    assert.equal(states.at(-1).state, 'playing');
    captured.ended = true;
    captured.dispatchEvent({ type: 'ended' });
    assert.equal(states.at(-1).state, 'ended');
});

test('snapshot describes a paused owner and close publishes closed before releasing audio', async () => {
    const h = createContentScriptHarness();
    const states = listenToPlayback(h);
    await h.context.fetch('https://chatgpt.com/backend-api/synthesize');
    const audio = h.createAudio('blob:page-read-aloud', { currentTime: 20, seekable: [[0, 420]] });
    await audio.play();
    await h.runIntervals();
    h.findButton('Pause').click();
    h.context.document.dispatchEvent(new h.context.CustomEvent('ae-read-aloud-player:playback-request'));
    assert.equal(states.at(-1).state, 'paused');
    h.findButton('Close player').click();
    assert.equal(states.at(-1).state, 'closed');
    h.capturedAudioElements[0].dispatchEvent({ type: 'ended' });
    assert.equal(states.at(-1).state, 'closed');
});

test('cancelled automatic intent cannot start synthesis later', async () => {
    const h = createContentScriptHarness();
    const states = listenToPlayback(h);
    h.context.document.dispatchEvent(new h.context.CustomEvent('ae-read-aloud-player:playback-intent', {
        detail: {responseId:'late',requestId:'auto-late'}
    }));
    h.context.document.dispatchEvent(new h.context.CustomEvent('ae-read-aloud-player:playback-cancel', {
        detail: {requestId:'auto-late'}
    }));
    await assert.rejects(h.context.fetch('https://chatgpt.com/backend-api/synthesize'), {name:'AbortError'});
    assert.equal(states.some(s=>s.requestId==='auto-late'&&s.state==='starting'),false);
});

test('completed capture cannot start its delayed page audio after cancellation', async () => {
    const h = createContentScriptHarness();
    const states = listenToPlayback(h);
    h.context.document.dispatchEvent(new h.context.CustomEvent('ae-read-aloud-player:playback-intent', {
        detail: {responseId:'late',requestId:'auto-late'}
    }));
    await h.context.fetch('https://chatgpt.com/backend-api/synthesize');
    await h.flushMicrotasks();
    h.context.document.dispatchEvent(new h.context.CustomEvent('ae-read-aloud-player:playback-cancel', {
        detail: {requestId:'auto-late'}
    }));
    const audio=h.createAudio('blob:late-page-audio');
    await assert.rejects(audio.play(),{name:'AbortError'});
    assert.equal(states.some(s=>s.requestId==='auto-late'&&s.state==='playing'),false);
});
