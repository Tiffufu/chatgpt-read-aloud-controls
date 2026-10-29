const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const modulePath = path.join(root, 'src/js/auto-read-aloud.js');
const load = () => fs.existsSync(modulePath) ? require(modulePath) : {};
const turn = (id, state = 'complete', signature = id) => ({ id, state, signature, hasText: true });
const snapshot = (turns = [], extra = {}) => ({ conversation: '/c/test', userKey: 'user-1', generating: false, turns, ...extra });

function harness(initial = snapshot(), options = {}) {
    const { createAutoReadController } = load();
    assert.equal(typeof createAutoReadController, 'function');
    let current = initial;
    let timeout;
    const starts = [];
    const errors = [];
    const controller = createAutoReadController({
        start: (item, requestId) => {
            if (options.missingAction) return false;
            starts.push({ id: item.id, requestId });
            return true;
        },
        schedule: (callback, ms) => { assert.equal(ms, 15000); timeout = callback; return 1; },
        cancel() { timeout = null; },
        onError: (message) => errors.push(message),
        onCancel: (requestId) => options.cancelled?.push(requestId)
    });
    controller.setEnabled(true, current);
    return {
        controller, starts, errors,
        submit(turns, extra = {}) { controller.beginGeneration(); this.scan(turns, extra); },
        scan(turns, extra = {}) { current = snapshot(turns, extra); controller.scan(current); },
        generation(id) { controller.beginGeneration(id); },
        state(state, sessionId = 1, extra = {}) {
            controller.playback({ state, sessionId, ...extra });
        },
        expire() { timeout?.(); },
        enable(value) { controller.setEnabled(value, current); }
    };
}

test('auto-read defaults off and survives normalization of saved settings', () => {
    const window = {};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'src/js/player-settings.js'), 'utf8'), { window });
    assert.equal(window.AEPlayerSettings.normalizeSettings({}).autoReadAloud, false);
    assert.equal(window.AEPlayerSettings.normalizeSettings({ autoReadAloud: true }).autoReadAloud, true);
    assert.equal(window.AEPlayerSettings.normalizeSettings({ autoReadAloud: 'false' }).autoReadAloud, false);
});

test('historical responses and late history hydration never start narration', () => {
    const h = harness(snapshot([turn('old')]));
    h.scan([turn('earlier'), turn('old')]);
    assert.deepEqual(h.starts, []);
});

test('a response generating when enabled starts exactly once after completion', () => {
    const h = harness(snapshot([turn('a', 'generating')], { generating: true }));
    h.scan([turn('a')]);
    h.scan([turn('a')]);
    assert.deepEqual(h.starts.map(x => x.id), ['a']);
});

test('fast responses following a new user turn are eligible without observing streaming', () => {
    const h = harness(snapshot([turn('old')]));
    h.submit([turn('old'), turn('fast')], { userKey: 'user-2' });
    assert.deepEqual(h.starts.map(x => x.id), ['fast']);
});

test('reasoning and tool pauses wait for the final completed response', () => {
    const h = harness();
    h.scan([turn('tool', 'tool')], { generating: true });
    h.scan([turn('tool', 'tool'), turn('answer', 'generating')], { generating: true });
    assert.equal(h.starts.length, 0);
    h.scan([turn('tool', 'tool'), turn('answer')]);
    assert.deepEqual(h.starts.map(x => x.id), ['answer']);
});

test('cancelled and empty responses are excluded', () => {
    const h = harness();
    h.scan([turn('a', 'generating')], { generating: true });
    h.controller.cancelGeneration();
    h.scan([turn('a')]);
    h.scan([{ ...turn('empty', 'generating'), hasText: false }], { generating: true });
    h.scan([{ ...turn('empty'), hasText: false }]);
    assert.deepEqual(h.starts, []);
});

test('FIFO queue waits through pause and starts the next item only on matching completion', () => {
    const h = harness(snapshot([turn('a', 'generating')], { generating: true }));
    h.scan([turn('a')]);
    h.state('playing', 1, { requestId: h.starts[0].requestId, responseId: 'a' });
    h.submit([turn('a'), turn('b')], { userKey: 'user-2' });
    h.submit([turn('a'), turn('b'), turn('c')], { userKey: 'user-3' });
    h.state('paused');
    h.state('playing');
    h.state('ended', 0);
    assert.deepEqual(h.starts.map(x => x.id), ['a']);
    h.state('ended');
    assert.deepEqual(h.starts.map(x => x.id), ['a', 'b']);
    h.state('playing', 2, { requestId: h.starts[1].requestId, responseId: 'b' });
    h.state('ended', 2);
    assert.deepEqual(h.starts.map(x => x.id), ['a', 'b', 'c']);
});

test('closing clears waiting items but allows future completed responses', () => {
    const h = harness();
    h.state('playing');
    h.submit([turn('b')], { userKey: 'user-2' });
    h.state('closed');
    assert.equal(h.starts.length, 0);
    h.submit([turn('b'), turn('c')], { userKey: 'user-3' });
    assert.deepEqual(h.starts.map(x => x.id), ['c']);
});

test('disabling cancels a pending start and never replays it on re-enable', () => {
    const cancelled = [];
    const h = harness(snapshot([turn('a', 'generating')], { generating: true }), { cancelled });
    h.scan([turn('a')]);
    h.enable(false);
    assert.deepEqual(cancelled, [h.starts[0].requestId]);
    h.enable(true);
    h.scan([turn('a')]);
    assert.equal(h.starts.length, 1);
});

test('manual playback satisfies a matching waiting item and holds the remaining queue', () => {
    const h = harness();
    h.state('playing');
    h.submit([turn('b')], { userKey: 'user-2' });
    h.submit([turn('b'), turn('c')], { userKey: 'user-3' });
    h.controller.manualStart('b');
    h.state('playing', 2, { responseId: 'b' });
    h.state('ended', 1);
    assert.equal(h.starts.length, 0);
    h.state('ended', 2);
    assert.deepEqual(h.starts.map(x => x.id), ['c']);
});

test('navigation clears pending items and baselines loaded historical messages', () => {
    const h = harness();
    h.state('playing');
    h.submit([turn('queued')], { userKey: 'user-2' });
    h.scan([turn('historical')], { conversation: '/c/other', userKey: 'other-user' });
    h.state('ended');
    assert.equal(h.starts.length, 0);
});

test('assigning the first conversation URL preserves an in-flight response', () => {
    const h = harness(snapshot([], { conversation: '/' }));
    h.scan([turn('a', 'generating')], { conversation: '/', generating: true, userKey: 'user-2' });
    h.scan([turn('a')], { conversation: '/c/assigned', userKey: 'user-2' });
    assert.deepEqual(h.starts.map(x => x.id), ['a']);
});

test('regeneration invalidates an older queued revision', () => {
    const h = harness();
    h.state('playing');
    h.scan([turn('a', 'generating', 'draft')], { generating: true });
    h.scan([turn('a', 'complete', 'first')]);
    h.generation('a');
    h.scan([turn('a', 'generating', 'second-draft')], { generating: true });
    h.scan([turn('a', 'complete', 'second')]);
    h.state('ended');
    assert.deepEqual(h.starts.map(x => x.id), ['a']);
});

test('a missing or deleted queued response is discarded before starting', () => {
    const h = harness();
    h.state('playing');
    h.submit([turn('a')], { userKey: 'user-2' });
    h.submit([turn('a'), turn('b')], { userKey: 'user-3' });
    h.scan([turn('b')], { userKey: 'user-3' });
    h.state('ended');
    assert.deepEqual(h.starts.map(x => x.id), ['b']);
});

test('missing native action suspends the queue after 15 seconds without repeated clicks', () => {
    const h = harness(snapshot([turn('a', 'generating')], { generating: true }), { missingAction: true });
    h.scan([turn('a')]);
    h.expire();
    h.scan([turn('a')]);
    assert.equal(h.errors.filter(Boolean).length, 1);
    assert.match(h.errors.find(Boolean), /Read Aloud/);
    assert.equal(h.starts.length, 0);
    h.controller.manualStart('a');
    h.state('playing', 1, { responseId: 'a' });
    h.state('ended');
    assert.equal(h.errors.at(-1), '');
});

test('two controller instances keep queues and paused playback independent', () => {
    const a = harness();
    const b = harness();
    a.state('paused');
    a.submit([turn('a')], { userKey: 'user-2' });
    b.submit([turn('b')], { userKey: 'user-2' });
    assert.equal(a.starts.length, 0);
    assert.deepEqual(b.starts.map(x => x.id), ['b']);
});

test('a new user turn remains eligible until its fast assistant response appears', () => {
    const h = harness(snapshot([turn('old')]));
    h.generation();
    h.scan([turn('old')], { userKey: 'user-2' });
    h.scan([turn('old'), turn('fast')], { userKey: 'user-2' });
    assert.deepEqual(h.starts.map(x => x.id), ['fast']);
});

test('first URL assignment after completion does not cancel the pending native start', () => {
    const cancelled = [];
    const h = harness(snapshot([], { conversation: '/' }), { cancelled });
    h.submit([turn('a')], { conversation: '/', userKey: 'user-2' });
    h.scan([turn('a')], { conversation: '/c/assigned', userKey: 'user-2' });
    assert.equal(h.starts.length, 1);
    assert.deepEqual(cancelled, []);
});

test('initial hydration of an existing conversation does not look like a new submission', () => {
    const h = harness(snapshot([], { userKey: '' }));
    h.scan([turn('historical')], { userKey: 'historical-user' });
    assert.deepEqual(h.starts, []);
    h.submit([turn('historical'), turn('fresh')], { userKey: 'fresh-user' });
    assert.deepEqual(h.starts.map(x => x.id), ['fresh']);
});

test('a superseded pending start is cancelled when its response disappears', () => {
    const cancelled = [];
    const h = harness(snapshot([turn('a', 'generating')], { generating: true }), { cancelled });
    h.scan([turn('a')]);
    h.scan([]);
    assert.deepEqual(cancelled, [h.starts[0].requestId]);
});

test('a later unrelated playback cannot acknowledge an automatic start', () => {
    const h = harness(snapshot([turn('a', 'generating')], { generating: true }));
    h.scan([turn('a')]);
    h.state('playing', 1, { responseId: 'other', requestId: null });
    h.expire();
    assert.equal(h.errors.filter(Boolean).length, 1);
});

test('start timeouts distinguish an unavailable native action from unconfirmed audio', () => {
    const missing = harness(snapshot([turn('a', 'generating')], { generating: true }), { missingAction: true });
    missing.scan([turn('a')]); missing.expire();
    assert.match(missing.errors.at(-1), /button|control/i);
    const clicked = harness(snapshot([turn('a', 'generating')], { generating: true }));
    clicked.scan([turn('a')]); clicked.expire();
    assert.match(clicked.errors.at(-1), /playback.*15 seconds/i);
});

test('browser autoplay rejection reports the needed manual action immediately', () => {
    const h = harness(snapshot([turn('a', 'generating')], { generating: true }));
    h.scan([turn('a')]);
    h.state('error', 1, { requestId: h.starts[0].requestId, responseId: 'a', reason: 'autoplay-blocked' });
    assert.match(h.errors.at(-1), /browser.*automatic playback/i);
    assert.match(h.errors.at(-1), /manually/i);
});

test('an audio error after confirmed playback is not reported as a start failure', () => {
    const h = harness(snapshot([turn('a', 'generating')], { generating: true }));
    h.scan([turn('a')]);
    const identity = { requestId: h.starts[0].requestId, responseId: 'a' };
    h.state('playing', 1, identity);
    h.state('error', 1, { ...identity, reason: 'media-decode' });
    assert.match(h.errors.at(-1), /decode/i);
    assert.doesNotMatch(h.errors.at(-1), /could not start/i);
});

test('disabled automatic reading does not report errors from manual playback', () => {
    const h = harness(); h.enable(false);
    h.state('error', 1, { reason: 'media-decode' });
    assert.equal(h.errors.filter(Boolean).length, 0);
});

test('opening or focusing a tab cannot start newly mounted historical turns', () => {
    const h = harness(snapshot([turn('visible-history')], { userKey: 'visible-user' }));
    h.scan([turn('another-history')], { userKey: 'another-user' });
    h.scan([turn('another-history')], { userKey: 'another-user' });
    assert.deepEqual(h.starts, []);
});

test('a historical rendering transition is not generation without a submission or native generation control', () => {
    const h = harness();
    h.scan([turn('old', 'generating')]);
    h.scan([turn('old')]);
    assert.deepEqual(h.starts, []);
});

test('a narrated reply cannot become eligible again from rendering alone', () => {
    const h = harness(snapshot([turn('a', 'generating')], { generating: true }));
    h.scan([turn('a')]);
    h.state('playing',1,{requestId:h.starts[0].requestId,responseId:'a'});
    h.state('ended');
    h.scan([turn('a','generating')]);
    h.scan([turn('a')]);
    assert.equal(h.starts.length,1);
});

test('older history mounted during a real generation does not enter the queue', () => {
    const h = harness(snapshot([turn('old')]));
    h.submit([turn('earlier-history'),turn('old'),turn('fresh')],{userKey:'user-2'});
    assert.deepEqual(h.starts.map(x=>x.id),['fresh']);
});

test('opening history from a new-chat URL cannot inherit a pending submission', () => {
    const h = harness(snapshot([],{conversation:'/',userKey:''}));
    h.generation();
    h.scan([turn('historical')],{conversation:'/c/history',userKey:'old-user'});
    assert.deepEqual(h.starts,[]);
});

test('a different conversation cannot inherit an in-flight new-chat response', () => {
    const h = harness(snapshot([],{conversation:'/',userKey:''}));
    h.scan([turn('fresh','generating')],{conversation:'/',generating:true,userKey:'new-user'});
    h.scan([turn('history')],{conversation:'/c/history',userKey:'old-user'});
    assert.deepEqual(h.starts,[]);
});

test('a placeholder mounted before the submitted user key appears remains eligible at final completion', () => {
    const h=harness(snapshot([turn('old')]));
    h.generation();
    h.scan([turn('old'),{...turn('fresh'),hasText:false}],{userKey:'user-1'});
    h.scan([turn('old'),turn('fresh')],{userKey:'user-2'});
    assert.deepEqual(h.starts.map(x=>x.id),['fresh']);
});
