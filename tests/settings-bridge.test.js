const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../src/js/settings-bridge.js'), 'utf8');
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function harness() {
    const document = new EventTarget();
    class CustomEvent extends Event {
        constructor(name, options = {}) { super(name); this.detail = options.detail; }
    }
    const snapshots = [], errors = [], invalidations = [];
    let stored = { autoReadAloud: true, playbackRate: 1.25 };
    let fail = null;
    let reads = 0;
    const runtime = { id: 'extension-id', onMessage: { addListener() {} } };
    const local = {
        async get() { reads++; if (fail) throw fail; return { ae_player_settings: stored }; },
        async set(value) { if (fail) throw fail; stored = value.ae_player_settings; }
    };
    document.addEventListener('ae-read-aloud-player:settings', e => snapshots.push(e.detail));
    document.addEventListener('ae-read-aloud-player:extension-invalidated', e => invalidations.push(e));
    vm.runInNewContext(source, { document, CustomEvent, chrome: {
        runtime, storage: { local, onChanged: { addListener() {} } }
    }, console: { error: (...args) => errors.push(args) } });
    return { runtime, snapshots, errors, invalidations, get stored() { return stored; },
        get reads() { return reads; }, fail(error) { fail = error; },
        emit(name, settings) { document.dispatchEvent(new CustomEvent('ae-read-aloud-player:' + name,
            { detail: { settings } })); }
    };
}

test('settings bridge persists player updates while retaining unrelated preferences', async () => {
    const h = harness(); await settle();
    h.emit('settings-update-request', { playbackRate: 1.5 }); await settle();
    assert.deepEqual({ ...h.stored }, { autoReadAloud: true, playbackRate: 1.5 });
    assert.equal(h.snapshots.at(-1).settings.playbackRate, 1.5);
});

test('invalidated settings bridge stops storage work and reports refresh without resetting settings', async () => {
    const h = harness(); await settle();
    const before = h.snapshots.length;
    h.runtime.id = undefined;
    h.fail(new Error('Extension context invalidated.'));
    h.emit('settings-update-request', { playbackRate: 2 }); await settle();
    const reads = h.reads;
    h.emit('settings-request'); h.emit('settings-update-request', { playbackRate: 1 }); await settle();
    assert.equal(h.errors.length, 0);
    assert.equal(h.invalidations.length, 1);
    assert.equal(h.snapshots.length, before);
    assert.equal(h.reads, reads);
    assert.equal(h.stored.playbackRate, 1.25);
});

test('context invalidation during a storage request is handled without a console error', async () => {
    const h = harness(); await settle();
    h.fail(new Error('Extension context invalidated.'));
    h.emit('settings-update-request', { playbackRate: 2 }); await settle();
    assert.equal(h.errors.length, 0);
    assert.equal(h.invalidations.length, 1);
});

test('ordinary storage failures remain visible', async () => {
    const h = harness(); await settle();
    h.fail(new Error('Storage quota exceeded'));
    h.emit('settings-update-request', { playbackRate: 2 }); await settle();
    assert.equal(h.errors.length, 1);
    assert.equal(h.invalidations.length, 0);
});
