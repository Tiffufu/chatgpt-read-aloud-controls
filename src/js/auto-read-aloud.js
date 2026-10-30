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
    const QUEUE_EVENT = 'ae-read-aloud-player:queue';
    const QUEUE_REQUEST = 'ae-read-aloud-player:queue-request';
    const QUEUE_COMMAND = 'ae-read-aloud-player:queue-command';
    const START_ERROR = 'Read Aloud could not start. Start it manually to continue the queue, or turn automatic reading off and on to reset it.';
    const RECOVER = ' Start Read Aloud manually to continue the queue.';
    const playbackError = reason => ({
        'autoplay-blocked': 'The browser blocked automatic playback.' + RECOVER,
        'request-failed': 'ChatGPT’s Read Aloud audio request failed.' + RECOVER,
        'media-network': 'Read Aloud audio stopped because of a network error.' + RECOVER,
        'media-decode': 'The browser could not decode the Read Aloud audio.' + RECOVER,
        'media-unsupported': 'The browser could not play the Read Aloud audio format.' + RECOVER,
        'media-aborted': 'Read Aloud audio playback was interrupted.' + RECOVER,
        'media-source-unavailable': 'Read Aloud stopped because its audio source is no longer available.' + RECOVER
    }[reason] || 'Read Aloud audio playback failed.' + RECOVER);

    const sentenceSegmenter = typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'sentence' }) : null;

    function createSnippet(value) {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        const characters = Array.from(text.slice(0, 210));
        let opening = '';
        const sentences = sentenceSegmenter ? sentenceSegmenter.segment(text.slice(0, 210))
            : (text.slice(0, 210).match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [text]);
        for (const sentence of sentences) {
            opening += sentence.segment ?? sentence;
            const candidate = opening.trim();
            if (Array.from(candidate).length > 104) break;
            if (candidate.length >= 40) return candidate;
        }
        if (characters.length <= 104) return text;
        const prefix = characters.slice(0, 105).join('');
        const boundary = prefix.lastIndexOf(' ');
        return (boundary > 0 ? prefix.slice(0, boundary) : characters.slice(0, 104).join('')).trimEnd() + '…';
    }

    function createAutoReadController({ start, schedule = setTimeout, cancel = clearTimeout, onError: reportError = () => {}, onCancel = () => {}, onChange = () => {} }) {
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
        let activeItem = null;
        let undoItems = [];
        let error = '';
        let lastPublished = '';
        let disposed = false;

        const busy = () => ['starting', 'playing', 'paused'].includes(playback.state);
        const serialize = item => ({
            id: item.id, revision: item.revision, signature: item.signature,
            snippet: createSnippet(item.snippet || records.get(item.id)?.snippet || 'Response'),
            source: item.source === 'manual' ? 'manual' : 'automatic'
        });
        const getSnapshot = () => ({
            items: queue.filter(valid).map(serialize),
            current: playback.state !== 'closed' && activeItem ? serialize(activeItem) : null,
            state: playback.state, suspended, error, enabled,
            canUndo: undoItems.some(({ item }) => valid(item))
        });
        const emit = (force = false) => {
            const value = getSnapshot();
            const key = JSON.stringify(value);
            if (!force && key === lastPublished) return;
            lastPublished = key;
            onChange(value);
        };
        const onError = message => { error = message; reportError(message); emit(); };
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
            undoItems = [];
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
            if (!attempt || attempt.clicked || disposed || suspended || busy()) return;
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
            if (disposed || suspended || busy()) return;
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
                if (playback.state === 'starting') playback = { ...playback, state: 'error' };
                onError(message);
            }, 15000);
            tryStart();
        };
        const scan = (value) => {
            if (disposed) return;
            if (!current) { baseline(value); emit(); return; }
            // An existing conversation hydrates after document_start. Its first
            // loaded user turn is history, not evidence of a fresh submission.
            if (!current.userKey && !current.turns.length && !generationOpen
                && !value.generating && /\/c\//.test(value.conversation)) {
                baseline(value);
                emit();
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
                    emit();
                    return;
                }
            }
            // Mounting history, scrolling, and tab focus can all change userKey.
            // Only an observed native generation control or a submit action
            // opens a generation cycle; DOM insertion alone never does.
            if (enabled && value.generating && !current.generating) {
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
            const canGenerate = enabled && generationOpen && userSubmitted;
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
                    eligible: enabled && !generationCancelled && (previous?.eligible
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
                    queue.push({ ...serialize(record), source: 'automatic' });
                }
            });
            records = nextRecords;
            current = value;
            queue = queue.filter(valid);
            if (completedCycle) generationOpen = false;
            if (attempt && !valid(attempt.item)) {
                queue = queue.filter(item => item !== attempt.item);
                clearAttempt(true);
            }
            pump();
            emit();
        };

        const edit = () => {
            if (attempt && (!queue.includes(attempt.item) || queue[0] !== attempt.item)) clearAttempt(true);
            pump();
            emit();
        };

        return {
            scan,
            getSnapshot,
            publish: () => emit(true),
            setEnabled(value, snapshot) {
                if (enabled === value && current) { scan(snapshot); return; }
                enabled = value;
                queue = queue.filter(item => item.source === 'manual');
                if (attempt && !queue.includes(attempt.item)) clearAttempt(true);
                suspended = false;
                undoItems = [];
                baseline(snapshot);
                queue = queue.filter(item => records.get(item.id)?.signature === item.signature)
                    .map(item => { item.revision = records.get(item.id).revision; return item; });
                if (activeItem && records.get(activeItem.id)?.signature === activeItem.signature) {
                    activeItem.revision = records.get(activeItem.id).revision;
                }
                onError('');
                pump();
                emit();
            },
            enqueue(responseId) {
                const record = records.get(responseId);
                if (disposed || !record || record.state !== 'complete' || !record.hasText) return false;
                const existing = queue.find(item => item.id === responseId && valid(item));
                if (existing) {
                    existing.source = 'manual';
                    record.handled = true;
                    if (suspended && !busy()) { suspended = false; onError(''); pump(); }
                    emit();
                    return true;
                }
                if (busy() && playback.responseId === responseId) return false;
                record.handled = true;
                queue.push({ ...serialize(record), source: 'manual' });
                if (suspended && !busy()) { suspended = false; onError(''); }
                pump();
                emit();
                return true;
            },
            remove(responseId) {
                const index = queue.findIndex(item => item.id === responseId);
                if (index < 0) return;
                undoItems = [{ item: queue[index], index }];
                queue.splice(index, 1);
                edit();
            },
            move(responseId, direction) {
                const from = queue.findIndex(item => item.id === responseId);
                const target = from + direction;
                if (![1, -1].includes(direction) || from < 0 || target < 0 || target >= queue.length) return;
                queue.splice(target, 0, queue.splice(from, 1)[0]);
                edit();
            },
            reorder(responseId, targetId) {
                const from = queue.findIndex(item => item.id === responseId);
                const to = queue.findIndex(item => item.id === targetId);
                if (from < 0 || to < 0 || from === to) return;
                queue.splice(to, 0, queue.splice(from, 1)[0]);
                edit();
            },
            clear() {
                undoItems = queue.map((item, index) => ({ item, index }));
                queue = [];
                suspended = false;
                onError('');
                edit();
            },
            undo() {
                const restore = undoItems;
                undoItems = [];
                restore.forEach(({ item, index }) => {
                    if (valid(item) && !queue.some(value => value.id === item.id)
                        && !(busy() && playback.responseId === item.id)) {
                        queue.splice(Math.min(index, queue.length), 0, item);
                    }
                });
                edit();
            },
            retry() { suspended = false; onError(''); pump(); emit(); },
            dispose() { disposed = true; enabled = false; clearQueue(); emit(); },
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
                playback = { ...playback, state: 'starting', responseId, requestId: null };
                activeItem = record ? { ...serialize(record), source: 'manual' } : null;
                emit();
            },
            playback(value) {
                if (!value || !Number.isFinite(value.sessionId) || value.sessionId < playback.sessionId) return;
                // The old page source may disappear after ending while the
                // next response is already being requested. It cannot cancel
                // or suspend that different response's pending start.
                if (value.state === 'error' && value.reason === 'media-source-unavailable'
                    && attempt && attempt.item.id !== value.responseId) return;
                const newSession = value.sessionId !== playback.sessionId;
                playback = value;
                const playingRecord = records.get(value.responseId);
                if (playingRecord && (newSession || !activeItem || activeItem.id !== value.responseId)) {
                    activeItem = serialize(attempt?.item?.id === value.responseId ? attempt.item : playingRecord);
                }
                if (attempt?.clicked && value.state === 'playing'
                    && value.requestId === attempt.requestId && value.responseId === attempt.item.id) {
                    queue = queue.filter(item => item !== attempt.item);
                    clearAttempt();
                    onError('');
                }
                if (value.state === 'closed') {
                    if (value.reason !== 'cancelled-start') clearQueue();
                    emit();
                    return;
                }
                if (value.state === 'error') {
                    if (!enabled && !queue.length && !activeItem) return;
                    suspended = true;
                    const failedAttempt = attempt;
                    clearAttempt(true);
                    if (failedAttempt) activeItem = serialize(failedAttempt.item);
                    else if (value.reason !== 'media-source-unavailable'
                        && activeItem && activeItem.id === value.responseId && valid(activeItem)
                        && !queue.some(item => item.id === activeItem.id)) queue.unshift(activeItem);
                    onError(playbackError(value.reason));
                    return;
                }
                if (value.state === 'ended') pump();
                emit();
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
        let highlightTimer = null;
        let restoreHighlight = () => {};
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
                hasText: Boolean(text), signature: hash(text), snippet: createSnippet(text), node, read
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
            reveal(id) {
                const response = entries().find(node => responseId(node) === id);
                if (!response) return false;
                restoreHighlight();
                document.defaultView.clearTimeout(highlightTimer);
                const previousMargin = response.style.scrollMarginTop;
                const player = document.getElementById?.('ae_enhanced_player')?.getBoundingClientRect();
                const margin = player && player.top < document.defaultView.innerHeight / 2 ? player.bottom + 16 : 16;
                response.style.scrollMarginTop = `${margin}px`;
                response.setAttribute('data-ae-queue-highlight', '');
                const reduced = document.defaultView.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
                response.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
                restoreHighlight = () => {
                    response.removeAttribute('data-ae-queue-highlight');
                    response.style.scrollMarginTop = previousMargin;
                };
                highlightTimer = document.defaultView.setTimeout(() => {
                    restoreHighlight();
                    restoreHighlight = () => {};
                }, 1600);
                return true;
            },
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
        let scheduledNativeStart = null;
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
            onCancel: requestId => {
                if (scheduledNativeStart?.requestId === requestId) scheduledNativeStart = null;
                dispatch(CANCEL_EVENT, { requestId });
            },
            onChange: value => dispatch(QUEUE_EVENT, value),
            start(item, requestId) {
                if (!contextAvailable()) return false;
                const response = adapter.find(item.id);
                if (!response?.read || response.read.disabled || response.read.getAttribute('aria-disabled') === 'true'
                    || response.read.getAttribute('aria-pressed') === 'true') return false;
                if (response.signature !== item.signature || response.state !== 'complete') return false;
                const pending = { requestId };
                scheduledNativeStart = pending;
                // HTMLElement.click suppresses reentrant clicks on the same
                // button. Let the intercepted user click finish first.
                root.queueMicrotask(() => {
                    if (scheduledNativeStart !== pending || !contextAvailable()) return;
                    scheduledNativeStart = null;
                    const latest = adapter.find(item.id);
                    if (!latest?.read || latest.read.disabled || latest.signature !== item.signature
                        || latest.state !== 'complete' || latest.read.getAttribute('aria-pressed') === 'true') return;
                    automaticClick = true;
                    try {
                        dispatch(INTENT_EVENT, { responseId: item.id, requestId });
                        latest.read.click();
                    } finally {
                        automaticClick = false;
                    }
                });
                return true;
            }
        });
        const invalidate = () => {
            if (disposed) return;
            disposed = true;
            enabled = false;
            controller.dispose();
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
        document.addEventListener(QUEUE_REQUEST, () => { if (!disposed) controller.publish(); });
        document.addEventListener(QUEUE_COMMAND, event => {
            if (!initialized || !contextAvailable()) return;
            const value = event.detail;
            if (!value || typeof value.action !== 'string') return;
            const id = typeof value.id === 'string' ? value.id : null;
            scan();
            if (value.action === 'reveal' && id) {
                if (!adapter.reveal(id)) {
                    error = 'This response is no longer available in the conversation.';
                    dispatch(QUEUE_EVENT, { ...controller.getSnapshot(), error });
                }
            } else if (value.action === 'remove' && id) controller.remove(id);
            else if (value.action === 'move' && id) controller.move(id, value.direction);
            else if (value.action === 'reorder' && id && typeof value.targetId === 'string') controller.reorder(id, value.targetId);
            else if (value.action === 'clear') controller.clear();
            else if (value.action === 'undo') controller.undo();
            else if (value.action === 'retry') controller.retry();
        });
        document.addEventListener('ae-read-aloud-player:settings', event => settings(event.detail?.settings));
        document.addEventListener('click', event => {
            if (automaticClick || !initialized || !contextAvailable()) return;
            const action = adapter.clickKind(event.target);
            if (action?.type === 'read' && action.button.getAttribute('aria-pressed') !== 'true') {
                scan();
                const value = controller.getSnapshot();
                const busy = ['starting', 'playing', 'paused'].includes(value.state);
                if (busy && value.current?.id !== action.id && controller.enqueue(action.id)) {
                    // Suppress the page action only after a different response
                    // was successfully admitted behind current playback.
                    event.preventDefault();
                    event.stopImmediatePropagation();
                } else {
                    // Keep the original user gesture when idle, restarting the
                    // current response, or unable to parse a response safely.
                    controller.manualStart(action.id);
                    dispatch(INTENT_EVENT, { responseId: action.id, requestId: null });
                }
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

    return Object.freeze({ createSnippet, createAutoReadController, createChatGPTAdapter, install });
});
