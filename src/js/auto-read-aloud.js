/** Automatic native Read Aloud. Queues and errors belong to this tab only. */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root?.document && root?.chrome?.storage) api.install(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
    'use strict';

    const PLAYBACK_EVENT = 'ae-read-aloud-player:playback';
    const SNAPSHOT_EVENT = 'ae-read-aloud-player:playback-request';
    const INTENT_EVENT = 'ae-read-aloud-player:playback-intent';
    const CANCEL_EVENT = 'ae-read-aloud-player:playback-cancel';
    const START_ERROR = 'Read Aloud could not start. Start it manually to continue the queue, or turn automatic reading off and on to reset it.';
    const RECOVER = ' Start Read Aloud manually to continue the queue.';
    const playbackError = reason => ({
        'autoplay-blocked': 'The browser blocked automatic playback.' + RECOVER,
        'request-failed': 'ChatGPT’s Read Aloud audio request failed.' + RECOVER,
        'media-network': 'Read Aloud audio stopped because of a network error.' + RECOVER,
        'media-decode': 'The browser could not decode the Read Aloud audio.' + RECOVER,
        'media-unsupported': 'The browser could not play the Read Aloud audio format.' + RECOVER,
        'media-aborted': 'Read Aloud audio playback was interrupted.' + RECOVER
    }[reason] || 'Read Aloud audio playback failed.' + RECOVER);

    function createAutoReadController({ start, schedule = setTimeout, cancel = clearTimeout, onError = () => {}, onCancel = () => {} }) {
        let enabled = false;
        let current = null;
        let records = new Map();
        let queue = [];
        let generationOpen = false;
        let generationCancelled = false;
        let regenerationId = null;
        let requestedUserKey = null;
        let requestedAt = 0;
        let generationIds = new Set();
        let generationBaselineIds = new Set();
        let suspended = false;
        let attempt = null;
        let sequence = 0;
        let playback = { sessionId: 0, state: 'closed' };

        const busy = () => ['starting', 'playing', 'paused'].includes(playback.state);
        const clearAttempt = (notify = false) => {
            if (!attempt) return;
            const previous = attempt;
            attempt = null;
            cancel(previous.timer);
            if (notify && previous.clicked) onCancel(previous.requestId);
        };
        const clearQueue = () => {
            clearAttempt(true);
            queue = [];
            suspended = false;
            onError('');
        };
        const baseline = (value) => {
            current = value;
            generationOpen = Boolean(value.generating);
            generationCancelled = false;
            requestedUserKey = null;
            generationIds = new Set(value.generating ? value.turns.filter(turn => turn.state === 'generating').map(turn => turn.id) : []);
            generationBaselineIds = new Set(value.turns.map(turn => turn.id));
            if (value.generating) generationBaselineIds.delete(value.turns[value.turns.length - 1]?.id);
            records = new Map(value.turns.map(turn => [turn.id, {
                ...turn, revision: 0, eligible: Boolean(value.generating) && turn.state === 'generating', handled: false
            }]));
        };
        const valid = (item) => {
            const record = records.get(item.id);
            return record && record.revision === item.revision && record.signature === item.signature
                && record.state === 'complete' && record.hasText;
        };
        const tryStart = () => {
            if (!attempt || attempt.clicked || !enabled || suspended || busy()) return;
            if (!valid(attempt.item)) {
                queue = queue.filter(item => item !== attempt.item);
                clearAttempt();
                pump();
                return;
            }
            // Set before click: the page may synchronously publish a playback event.
            const pending = attempt;
            pending.clicked = true;
            try {
                if (!start(pending.item, pending.requestId) && attempt === pending) pending.clicked = false;
            } catch (_error) {
                if (attempt === pending) {
                    pending.clicked = false;
                    suspended = true;
                    clearAttempt(true);
                    onError(START_ERROR);
                }
            }
        };
        const pump = () => {
            if (!enabled || suspended || busy()) return;
            if (attempt) { tryStart(); return; }
            while (queue.length && !valid(queue[0])) queue.shift();
            if (!queue.length) return;
            const pending = {
                item: queue[0], requestId: `auto-${++sequence}`, clicked: false, timer: null
            };
            attempt = pending;
            pending.timer = schedule(() => {
                if (attempt !== pending) return;
                const message = pending.clicked
                    ? 'Read Aloud playback was not confirmed within 15 seconds.' + RECOVER
                    : 'ChatGPT’s Read Aloud button was unavailable for 15 seconds.' + RECOVER;
                suspended = true;
                clearAttempt(true);
                onError(message);
            }, 15000);
            tryStart();
        };
        const scan = (value) => {
            if (!enabled) { current = value; return; }
            if (!current) { baseline(value); return; }
            // An existing conversation hydrates after document_start. Its first
            // loaded user turn is history, not evidence of a fresh submission.
            if (!current.userKey && !current.turns.length && !generationOpen
                && !value.generating && /\/c\//.test(value.conversation)) {
                baseline(value);
                return;
            }
            if (current.conversation !== value.conversation) {
                const assigned = !/\/c\//.test(current.conversation)
                    && /\/c\//.test(value.conversation)
                    && current.userKey === value.userKey
                    && value.turns.some(turn => generationIds.has(turn.id));
                if (!assigned) {
                    clearQueue();
                    baseline(value);
                    return;
                }
            }
            // Mounting history, scrolling, and tab focus can all change userKey.
            // Only an observed native generation control or a submit action
            // opens a generation cycle; DOM insertion alone never does.
            if (value.generating && !current.generating) {
                if (!generationOpen) generationBaselineIds = new Set(records.keys());
                generationOpen = true;
                generationCancelled = false;
                requestedUserKey = null;
            }
            if (requestedUserKey !== null && !value.generating && Date.now() - requestedAt > 15000) {
                generationOpen = false;
                requestedUserKey = null;
            }
            const userSubmitted = requestedUserKey === null || (value.userKey !== requestedUserKey
                && (!requestedUserKey || !value.userKeys || value.userKeys.includes(requestedUserKey)));
            const canGenerate = generationOpen && userSubmitted;
            const latestId = value.turns[value.turns.length - 1]?.id;
            const nextRecords = new Map();
            let completedCycle = false;
            value.turns.forEach(turn => {
                const previous = records.get(turn.id);
                const begins = canGenerate && turn.id === latestId
                    && turn.state === 'generating' && previous?.state !== 'generating';
                const revised = previous && turn.id === regenerationId && turn.signature !== previous.signature && generationOpen
                    && previous.state === 'complete' && turn.state === 'complete';
                const record = {
                    ...turn,
                    revision: (previous?.revision || 0) + (begins || revised ? 1 : 0),
                    eligible: !generationCancelled && (previous?.eligible
                        || (canGenerate && turn.id === latestId
                            && (begins || !generationBaselineIds.has(turn.id) || revised))),
                    handled: begins || revised ? false : Boolean(previous?.handled)
                };
                if (turn.state === 'cancelled') record.eligible = false;
                if (record.eligible) generationIds.add(record.id);
                nextRecords.set(turn.id, record);
                if (record.state === 'complete' && record.hasText && record.eligible && !record.handled
                    && turn.id === latestId && !value.generating && !generationCancelled) {
                    record.handled = true;
                    record.eligible = false;
                    completedCycle = true;
                    queue.push({ id: record.id, revision: record.revision, signature: record.signature });
                }
            });
            records = nextRecords;
            current = value;
            if (completedCycle) generationOpen = false;
            if (attempt && !valid(attempt.item)) {
                queue = queue.filter(item => item !== attempt.item);
                clearAttempt(true);
            }
            pump();
        };

        return {
            scan,
            setEnabled(value, snapshot) {
                if (enabled === value) { if (value) scan(snapshot); return; }
                enabled = value;
                clearQueue();
                baseline(snapshot);
            },
            beginGeneration(responseId = null) {
                generationBaselineIds = new Set(records.keys());
                generationOpen = true;
                generationCancelled = false;
                regenerationId = responseId;
                requestedUserKey = responseId ? null : current?.userKey ?? '';
                requestedAt = Date.now();
            },
            cancelGeneration() {
                generationCancelled = true;
                generationOpen = false;
                records.forEach(record => { if (!record.handled) record.eligible = false; });
            },
            manualStart(responseId) {
                clearAttempt(true);
                queue = queue.filter(item => item.id !== responseId);
                const record = records.get(responseId);
                if (record) record.handled = true;
                suspended = false;
                onError('');
                // Hold the queue before the native fetch or play event arrives.
                playback = { ...playback, state: 'starting' };
            },
            playback(value) {
                if (!value || !Number.isFinite(value.sessionId) || value.sessionId < playback.sessionId) return;
                playback = value;
                if (attempt?.clicked && value.state === 'playing'
                    && value.requestId === attempt.requestId && value.responseId === attempt.item.id) {
                    queue = queue.filter(item => item !== attempt.item);
                    clearAttempt();
                    onError('');
                }
                if (value.state === 'closed') {
                    if (value.reason !== 'cancelled-start') clearQueue();
                    return;
                }
                if (value.state === 'error') {
                    if (!enabled) return;
                    suspended = true;
                    clearAttempt(true);
                    onError(playbackError(value.reason));
                    return;
                }
                if (value.state === 'ended') pump();
            }
        };
    }

    // Keep ChatGPT markup assumptions here, separate from queue and media state.
    function createChatGPTAdapter(document, location) {
        const TURN = '[data-turn-key], [data-message-author-role="assistant"]';
        const READ = 'button[aria-label="Read aloud"], button[aria-label="Read Aloud"], button[data-testid="voice-play-turn-action-button"]';
        const STOP = 'button[data-testid="stop-button"], button[aria-label="Stop generating"], button[aria-label="Stop streaming"], button[aria-label="Stop"]';
        const SEND = 'button[data-testid="send-button"], button[data-testid="composer-submit-button"], button[aria-label="Send"], button[aria-label="Send prompt"]';
        const ids = new WeakMap();
        let nextId = 0;
        const responseId = node => {
            const identified = node.closest('[data-turn-key], [data-message-id]') || node;
            const id = identified.getAttribute('data-turn-key') || identified.getAttribute('data-message-id');
            if (id) return id;
            if (!ids.has(node)) ids.set(node, `response-${++nextId}`);
            return ids.get(node);
        };
        const hash = text => {
            let result = 2166136261;
            for (let i = 0; i < text.length; i++) result = Math.imul(result ^ text.charCodeAt(i), 16777619);
            return `${text.length}:${result >>> 0}`;
        };
        const entries = () => {
            const seen = new Set();
            return Array.from(document.querySelectorAll(TURN)).filter(node => {
                const id = responseId(node);
                if (seen.has(id)) return false;
                // Work turns include user turns; their response actions identify assistant turns.
                const assistant = node.matches('[data-message-author-role="assistant"]')
                    || node.querySelector('[data-message-author-role="assistant"], [data-conversation-role="assistant"]')
                    || node.querySelector(READ);
                if (!assistant) return false;
                seen.add(id);
                return true;
            });
        };
        const describe = node => {
            const stateNode = node.matches('[data-talvt-turn-state]') ? node : node.querySelector('[data-talvt-turn-state]');
            const explicit = stateNode?.getAttribute('data-talvt-turn-state');
            const streaming = ['generating', 'streaming', 'in_progress', 'in-progress'].includes(explicit)
                || node.matches('[data-is-streaming="true"]') || node.querySelector('[data-is-streaming="true"], .result-streaming');
            const body = node.querySelector('[data-dil-message-id], .markdown, [data-testid="message-text"]')
                || (node.matches('[data-message-author-role="assistant"]') ? node : null);
            const text = (body?.textContent || '').replace(/\s+/g, ' ').trim();
            const read = node.querySelector(READ);
            return {
                id: responseId(node),
                state: explicit === 'cancelled' || explicit === 'error' ? 'cancelled'
                    : streaming ? 'generating' : explicit === 'complete' || read ? 'complete' : 'tool',
                hasText: Boolean(text), signature: hash(text), node, read
            };
        };
        const conversation = () => new URL(location.href).pathname.replace(/\/$/, '') || '/';
        return {
            snapshot() {
                const turns = entries().map(describe);
                const users = document.querySelectorAll('[data-message-author-role="user"], [data-turn-key]:has(button[aria-label="Edit message"])');
                const lastUser = users[users.length - 1];
                return {
                    conversation: conversation(), userKey: lastUser ? responseId(lastUser) : '',
                    userKeys: Array.from(users, responseId),
                    generating: Boolean(document.querySelector(STOP)),
                    turns
                };
            },
            find(id) { return entries().map(describe).find(turn => turn.id === id); },
            clickKind(target) {
                const button = target?.closest?.('button');
                if (!button) return null;
                if (button.matches(READ)) {
                    const node = button.closest(TURN);
                    return node ? { type: 'read', id: responseId(node), button } : null;
                }
                if (button.matches(STOP)) return { type: 'cancel' };
                if (button.matches(SEND) && !button.disabled) return { type: 'generate' };
                if (/^(regenerate|retry|try again)/i.test(button.getAttribute('aria-label') || button.textContent || '')) {
                    const node = button.closest(TURN);
                    return { type: 'generate', id: node ? responseId(node) : null };
                }
                return null;
            },
            isComposer(target) {
                return Boolean(target?.closest?.('#prompt-textarea, [contenteditable="true"][role="textbox"], textarea[placeholder]'));
            },
            composerHasText() {
                const composer = document.querySelector('#prompt-textarea, [contenteditable="true"][role="textbox"], textarea[placeholder]');
                return Boolean((composer?.value || composer?.textContent || '').trim());
            }
        };
    }

    function install(root) {
        const document = root.document;
        const chrome = root.chrome;
        const adapter = createChatGPTAdapter(document, root.location);
        let error = '';
        let automaticClick = false;
        let enabled = false;
        let initialized = false;
        let scanScheduled = false;
        let settingsRevision = 0;
        let disposed = false;
        let observer = null;
        let scanInterval = null;
        const dispatch = (name, detail) => document.dispatchEvent(new root.CustomEvent(name, { detail }));
        const controller = createAutoReadController({
            schedule: root.setTimeout.bind(root), cancel: root.clearTimeout.bind(root),
            onError: message => {
                error = message;
            },
            onCancel: requestId => dispatch(CANCEL_EVENT, { requestId }),
            start(item, requestId) {
                if (!contextAvailable()) return false;
                const response = adapter.find(item.id);
                if (!response?.read || response.read.disabled || response.read.getAttribute('aria-disabled') === 'true') return false;
                if (response.signature !== item.signature || response.state !== 'complete') return false;
                automaticClick = true;
                try {
                    dispatch(INTENT_EVENT, { responseId: item.id, requestId });
                    response.read.click();
                } finally {
                    automaticClick = false;
                }
                return true;
            }
        });
        const invalidate = () => {
            if (disposed) return;
            disposed = true;
            enabled = false;
            controller.setEnabled(false, adapter.snapshot());
            observer?.disconnect();
            if (scanInterval !== null) root.clearInterval?.(scanInterval);
        };
        const contextAvailable = () => {
            if (disposed) return false;
            if (chrome.runtime && !chrome.runtime.id) { invalidate(); return false; }
            return true;
        };
        const scan = () => { if (initialized && contextAvailable()) controller.scan(adapter.snapshot()); };
        const scheduleScan = () => {
            if (scanScheduled) return;
            scanScheduled = true;
            root.queueMicrotask(() => { scanScheduled = false; scan(); });
        };
        const settings = value => {
            if (!contextAvailable()) return;
            settingsRevision += 1;
            enabled = value?.autoReadAloud === true;
            if (initialized) controller.setEnabled(enabled, adapter.snapshot());
        };
        document.addEventListener('ae-read-aloud-player:extension-invalidated', invalidate);
        document.addEventListener(PLAYBACK_EVENT, event => { if (!disposed) controller.playback(event.detail); });
        document.addEventListener('ae-read-aloud-player:settings', event => settings(event.detail?.settings));
        document.addEventListener('click', event => {
            if (automaticClick || !contextAvailable()) return;
            const action = adapter.clickKind(event.target);
            if (action?.type === 'read' && action.button.getAttribute('aria-pressed') !== 'true') {
                dispatch(INTENT_EVENT, { responseId: action.id, requestId: null });
                controller.manualStart(action.id);
            } else if (action?.type === 'cancel') controller.cancelGeneration();
            else if (action?.type === 'generate' && (action.id || adapter.composerHasText())) controller.beginGeneration(action.id);
        }, true);
        document.addEventListener('submit', event => {
            if (!contextAvailable()) return;
            if (adapter.composerHasText() && (adapter.isComposer(event.target) || event.target?.querySelector?.('#prompt-textarea, [contenteditable="true"][role="textbox"]'))) {
                controller.beginGeneration();
            }
        }, true);
        document.addEventListener('keydown', event => {
            if (!contextAvailable()) return;
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && adapter.isComposer(event.target) && adapter.composerHasText()) {
                controller.beginGeneration();
            }
        }, true);
        chrome.runtime?.onMessage?.addListener((message, _sender, respond) => {
            if (message?.type === 'AE_AUTO_READ_STATUS') respond({ error });
        });
        chrome.storage.onChanged?.addListener((changes, area) => {
            if (area === 'local' && changes.ae_player_settings) settings(changes.ae_player_settings.newValue);
        });
        const ready = async () => {
            if (!contextAvailable()) return;
            const revision = settingsRevision;
            try {
                const stored = await chrome.storage.local.get('ae_player_settings');
                if (settingsRevision === revision) settings(stored?.ae_player_settings);
            } catch (_error) { /* Remain off if storage is unavailable. */ }
            if (!contextAvailable()) return;
            initialized = true;
            controller.setEnabled(enabled, adapter.snapshot());
            observer = new root.MutationObserver(mutations => {
                if (mutations.some(mutation => {
                    const element = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
                    return !element?.closest?.('#ae_enhanced_player');
                })) scheduleScan();
            });
            observer.observe(document.body, {
                subtree: true, childList: true, characterData: true, attributes: true,
                attributeFilter: ['data-talvt-turn-state', 'data-is-streaming', 'aria-label', 'aria-pressed', 'disabled']
            });
            root.addEventListener('popstate', scheduleScan);
            document.addEventListener('visibilitychange', scheduleScan);
            dispatch(SNAPSHOT_EVENT);
            // Handles SPA URL changes even when the conversation DOM has no mutation.
            scanInterval = root.setInterval(scan, 1000);
        };
        if (document.body) ready();
        else document.addEventListener('DOMContentLoaded', ready, { once: true });
    }

    return Object.freeze({ createAutoReadController, createChatGPTAdapter, install });
});
