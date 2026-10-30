/** Attached queue presentation. Scheduling and ChatGPT selectors live elsewhere. */
(function (root) {
    'use strict';

    const icons = {
        queue: '<path d="M4 6h16M4 12h10M4 18h10m4-5 4 3-4 3Z"/>',
        speaker: '<path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
        up: '<path d="m5 15 7-7 7 7"/>',
        down: '<path d="m5 9 7 7 7-7"/>',
        close: '<path d="m6 6 12 12M18 6 6 18"/>',
        grip: '<path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01"/>'
    };
    const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

    function create({ document, container, toggleHost, onCommand, expanded: initiallyExpanded = false }) {
        let expanded = initiallyExpanded;
        let collapsed = false;
        let state = { items: [], current: null, state: 'closed' };
        let dragId = null;
        let deferredSnapshot = null;
        const currentResponse = () => ['ended', 'closed'].includes(state.state) ? null : state.current;
        const waitingItems = () => state.items.filter(item => item.id !== currentResponse()?.id);
        const make = (tag, className, text) => {
            const node = document.createElement(tag);
            node.className = className;
            if (text !== undefined) node.textContent = text;
            return node;
        };
        const button = (className, label, action) => {
            const node = make('button', className);
            node.type = 'button';
            node.setAttribute('aria-label', label);
            node.title = label;
            node.addEventListener('click', action);
            return node;
        };
        const send = (value, notice = '') => {
            onCommand(value);
            feedback.textContent = notice;
            noticeArea.hidden = !notice && !state.canUndo;
        };
        const toggle = button('ae-rq-toggle', 'Show reading queue', () => { expanded = !expanded; show(); });
        toggle.innerHTML = svg('queue');
        const count = make('span', 'ae-rq-count');
        toggle.append(count);
        const panel = make('section', 'ae-rq-panel');
        panel.id = 'ae_reading_queue';
        panel.setAttribute('aria-label', 'Reading queue');
        toggle.setAttribute('aria-controls', panel.id);
        const head = make('div', 'ae-rq-head');
        const heading = make('h3', 'ae-rq-heading', 'Reading queue');
        const upcoming = make('span', 'ae-rq-upcoming');
        const clear = button('ae-rq-text-button ae-rq-clear', 'Clear upcoming', () => send({ action: 'clear' }, 'Cleared upcoming responses.'));
        clear.textContent = 'Clear';
        head.append(heading);
        const now = make('div', 'ae-rq-now');
        const speaker = make('span', '');
        speaker.innerHTML = svg('speaker');
        const nowCopy = make('div', 'ae-rq-now-copy');
        const nowLabel = make('div', 'ae-rq-label');
        const current = button('ae-rq-current ae-rq-snippet', 'Show current response', () => {
            if (currentResponse()) send({ action: 'reveal', id: currentResponse().id });
        });
        nowCopy.append(nowLabel, current);
        now.append(speaker, nowCopy);
        const listLabel = make('div', 'ae-rq-up-next');
        listLabel.append(upcoming, clear);
        const list = make('ol', 'ae-rq-list');
        const empty = make('div', 'ae-rq-empty', 'Nothing else queued.');
        const error = make('p', 'ae-rq-error');
        error.setAttribute('role', 'status');
        const retry = button('ae-rq-text-button ae-rq-retry', 'Retry reading queue', () => send({ action: 'retry' }));
        retry.textContent = 'Retry';
        const noticeArea = make('div', 'ae-rq-feedback');
        const feedback = make('span', '');
        feedback.setAttribute('role', 'status');
        const undo = button('ae-rq-text-button ae-rq-undo', 'Undo queue removal', () => send({ action: 'undo' }, 'Restored to the queue.'));
        undo.textContent = 'Undo';
        noticeArea.append(feedback, undo);
        panel.append(head, now, listLabel, list, empty, error, retry, noticeArea);
        toggleHost.append(toggle);
        container.append(panel);

        function show() {
            panel.hidden = !expanded || collapsed;
            toggle.setAttribute('aria-expanded', String(expanded));
            toggle.hidden = collapsed;
            const label = `${expanded ? 'Hide' : 'Show'} reading queue: ${currentResponse() ? '1 current response' : 'no current response'}, ${waitingItems().length} waiting`;
            toggle.setAttribute('aria-label', label);
            toggle.title = label;
            if (!panel.hidden && document.defaultView.getComputedStyle(container).position === 'fixed') {
                const rect = container.getBoundingClientRect();
                const height = document.defaultView.innerHeight;
                if (rect.bottom > height - 12) container.style.top = `${Math.max(12, height - rect.height - 12)}px`;
            }
        }

        function endDrag() {
            dragId = null;
            list.querySelectorAll('[data-drop]').forEach(node => node.removeAttribute('data-drop'));
            if (deferredSnapshot) {
                const latest = deferredSnapshot;
                deferredSnapshot = null;
                update(latest);
            }
        }

        function update(value) {
            // A playback snapshot or arrival must not detach a native drag source.
            if (dragId) { deferredSnapshot = value; return; }
            state = value;
            const active = currentResponse();
            const waiting = waitingItems();
            const focused = document.activeElement;
            const focusKey = panel.contains(focused) ? focused.dataset.aeQueueFocus : null;
            const focusId = focused?.closest?.('.ae-rq-row')?.dataset.id;
            const total = waiting.length + (active ? 1 : 0);
            count.textContent = String(total);
            count.hidden = !total;
            upcoming.textContent = `UP NEXT · ${waiting.length}`;
            listLabel.hidden = !waiting.length;
            clear.disabled = !waiting.length;
            now.hidden = !active;
            current.textContent = active?.snippet || '';
            current.title = active?.snippet || '';
            current.disabled = !active;
            nowLabel.textContent = ({ playing: 'Now playing', paused: 'Paused', starting: 'Starting…', ended: 'Finished', error: 'Playback interrupted' })[state.state] || 'Ready when you are';
            error.textContent = state.error || '';
            error.hidden = !state.error;
            retry.hidden = !state.suspended;
            undo.hidden = !state.canUndo;
            empty.hidden = Boolean(waiting.length);
            empty.textContent = active ? 'Nothing else queued.' : 'Nothing queued. Choose Read Aloud on a response to begin.';
            noticeArea.hidden = !feedback.textContent && !state.canUndo;
            list.replaceChildren();
            waiting.forEach((item, index) => {
                const row = make('li', 'ae-rq-row');
                row.dataset.id = item.id;
                const handle = make('span', 'ae-rq-handle');
                handle.innerHTML = svg('grip');
                handle.draggable = true;
                handle.title = 'Drag to reorder. Arrow buttons also change the order.';
                handle.setAttribute('aria-hidden', 'true');
                handle.addEventListener('dragstart', event => {
                    dragId = item.id;
                    event.dataTransfer.setData('text/plain', item.id);
                    event.dataTransfer.effectAllowed = 'move';
                });
                handle.addEventListener('dragend', endDrag);
                row.addEventListener('dragover', event => {
                    if (!dragId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    list.querySelectorAll('[data-drop]').forEach(node => node.removeAttribute('data-drop'));
                    row.dataset.drop = waiting.findIndex(entry => entry.id === dragId) < index ? 'after' : 'before';
                });
                row.addEventListener('dragleave', () => row.removeAttribute('data-drop'));
                row.addEventListener('drop', event => {
                    event.preventDefault();
                    const id = dragId;
                    endDrag();
                    if (id && id !== item.id) send({ action: 'reorder', id, targetId: item.id }, 'Queue order updated.');
                });
                const message = button('ae-rq-message', `Show response: ${item.snippet}`, () => send({ action: 'reveal', id: item.id }));
                message.dataset.aeQueueFocus = `${item.id}:message`;
                message.append(make('span', 'ae-rq-snippet', item.snippet));
                const controls = make('div', 'ae-rq-controls');
                const actionButton = (icon, label, command, disabled) => {
                    const node = button('ae-rq-icon', `${label}: ${item.snippet}`, () => send({ ...command, id: item.id }, label === 'Remove' ? 'Removed from upcoming.' : 'Queue order updated.'));
                    node.innerHTML = svg(icon);
                    node.dataset.aeQueueFocus = `${item.id}:${label}`;
                    node.disabled = Boolean(disabled);
                    return node;
                };
                controls.append(actionButton('up', 'Move up', { action: 'move', direction: -1 }, index === 0), actionButton('down', 'Move down', { action: 'move', direction: 1 }, index === waiting.length - 1), actionButton('close', 'Remove', { action: 'remove' }));
                row.append(handle, message, controls);
                list.append(row);
            });
            if (focusKey) {
                const buttons = Array.from(list.querySelectorAll('button'));
                const replacement = buttons.find(node => node.dataset.aeQueueFocus === focusKey && !node.disabled)
                    || buttons.find(node => node.dataset.aeQueueFocus === `${focusId}:message`)
                    || buttons.find(node => !node.disabled) || toggle;
                replacement.focus({ preventScroll: true });
            }
            show();
        }

        update(state);
        document.defaultView.addEventListener('resize', show);
        return {
            update,
            getExpanded: () => expanded,
            setCollapsed(value) { collapsed = value; show(); },
            setTheme(theme) {
                container.style.setProperty('--ae-rq-border', theme.playerBorder);
                container.style.setProperty('--ae-rq-hover', theme.controlHoverBackground);
                container.style.setProperty('--ae-rq-muted', theme.secondaryText);
                container.style.setProperty('--ae-rq-focus', theme.focusRing);
            },
            destroy() {
                document.defaultView.removeEventListener('resize', show);
                toggle.remove(); panel.remove(); dragId = null; deferredSnapshot = null;
            }
        };
    }

    root.AEPlayerReadingQueue = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
