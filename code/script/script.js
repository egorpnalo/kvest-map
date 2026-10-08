document.addEventListener('DOMContentLoaded', () => {
    // Если страница открыта не через сервер (файлом или через Live Server), обращаемся к серверу напрямую
    const API_BASE = (location.protocol === 'file:' || (location.port && location.port !== '3000'))
        ? 'http://localhost:3000'
        : '';

    const state = { items: [], activities: [], plots: [], scenarios: [] };

    // ==========================================================
    // 0. Общие утилиты
    // ==========================================================
    const $ = (id) => document.getElementById(id);

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function assetUrl(url) {
        return url ? API_BASE + url : '';
    }

    function plural(n, forms) {
        const n10 = n % 10, n100 = n % 100;
        if (n10 === 1 && n100 !== 11) return forms[0];
        if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
        return forms[2];
    }

    function formatDuration(minutes) {
        const m = Number(minutes) || 0;
        if (m < 60) return `${m} мин`;
        const h = Math.floor(m / 60), rest = m % 60;
        return rest ? `${h} ч ${rest} мин` : `${h} ч`;
    }

    function matches(query, ...fields) {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return fields.some(f => String(f ?? '').toLowerCase().includes(q));
    }

    async function api(path, options = {}) {
        let response;
        try {
            response = await fetch(API_BASE + path, options);
        } catch (err) {
            setServerOnline(false);
            throw new Error('Нет связи с сервером');
        }
        setServerOnline(true);

        let data = null;
        try { data = await response.json(); } catch (e) { /* пустой ответ */ }

        if (!response.ok) {
            throw new Error(data?.error || `Ошибка сервера (${response.status})`);
        }
        return data;
    }

    function setServerOnline(online) {
        $('server-banner').hidden = online;
    }

    // --- Уведомления ---
    function toast(message, type = 'info') {
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = message;
        $('toast-container').appendChild(el);
        setTimeout(() => {
            el.classList.add('hide');
            setTimeout(() => el.remove(), 300);
        }, 3200);
    }

    // --- Модальные окна ---
    function openModal(modal) {
        modal.classList.add('open');
        const firstField = modal.querySelector('input:not([type="hidden"]):not([hidden]), textarea');
        if (firstField) setTimeout(() => firstField.focus(), 50);
    }

    function closeModal(modal) {
        modal.classList.remove('open');
    }

    function requestClose(modal) {
        if (modal === confirmModal && confirmResolve) confirmResolve(false);
        else closeModal(modal);
    }

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('mousedown', (e) => {
            if (e.target === overlay) requestClose(overlay);
        });
        overlay.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => requestClose(overlay));
        });
    });

    // --- Подтверждение ---
    const confirmModal = $('confirm-modal');
    let confirmResolve = null;

    function confirmDialog({ title = 'Подтверждение', text = '', okText = 'Удалить' } = {}) {
        return new Promise(resolve => {
            $('confirm-title').textContent = title;
            $('confirm-text').textContent = text;
            $('confirm-ok').textContent = okText;
            confirmResolve = (result) => {
                confirmResolve = null;
                closeModal(confirmModal);
                resolve(result);
            };
            openModal(confirmModal);
            setTimeout(() => $('confirm-ok').focus(), 50);
        });
    }

    $('confirm-ok').addEventListener('click', () => confirmResolve?.(true));
    $('confirm-cancel').addEventListener('click', () => confirmResolve?.(false));

    // --- Пустые состояния ---
    const EMPTY_ICON = `
        <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 13h5l2 3h4l2-3h5"/>
            <path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/>
        </svg>`;

    function renderEmpty(container, { title = 'Ничего нет', text = '', actionLabel, onAction } = {}) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">${EMPTY_ICON}</div>
                <h3>${escapeHtml(title)}</h3>
                ${text ? `<p>${escapeHtml(text)}</p>` : ''}
                ${actionLabel ? `<button type="button" class="btn btn-green">${escapeHtml(actionLabel)}</button>` : ''}
            </div>`;
        if (actionLabel && onAction) container.querySelector('.empty-state .btn').addEventListener('click', onAction);
    }

    function renderSkeleton(container, count = 3) {
        container.innerHTML = Array.from({ length: count }, () => '<div class="skeleton"></div>').join('');
    }

    function withBusy(button, fn) {
        return async (...args) => {
            if (button.disabled) return;
            button.disabled = true;
            try { await fn(...args); } finally { button.disabled = false; }
        };
    }

    function updateCounts() {
        $('count-items').textContent = state.items.length;
        $('count-activities').textContent = state.activities.length;
        $('count-plots').textContent = state.plots.length;
        if ($('count-scenarios')) $('count-scenarios').textContent = state.scenarios.length;
    }

    // ==========================================================
    // 1. Переключение отделов
    // ==========================================================
    const navButtons = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.section-content');

    function showTab(targetTab) {
        navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === targetTab));
        sections.forEach(section => section.classList.toggle('active', section.id === targetTab));
        if (targetTab !== 'section-1') resetConnectMode();

        if (targetTab === 'section-2') loadActivities();
        if (targetTab === 'section-3') loadItems();
        if (targetTab === 'section-4') loadPlots();
        if (targetTab === 'section-5') loadScenarios();
    }

    navButtons.forEach(button => {
        button.addEventListener('click', () => showTab(button.dataset.tab));
    });

    $('brand-logo-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        showTab('section-1');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ==========================================================
    // 2. Интерактивное полотно
    // ==========================================================
    const canvas = $('canvas');
    const viewport = $('canvas-viewport');
    const connectionsLayer = $('connections-layer');
    const tempLayer = $('temp-layer');
    const connectionMenu = $('connection-menu');
    const canvasEmpty = $('canvas-empty');
    const canvasHint = $('canvas-hint');
    const timelinePanel = $('timeline-panel');
    const connectModeBtn = $('connect-mode-btn');
    const selectActModal = $('select-act-modal');
    const savePlotModal = $('save-plot-modal');
    const savePlotForm = $('save-plot-form');

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const DEFAULT_HINT = 'Тяните за кружок справа на блоке, чтобы провести стрелку. Нажмите на стрелку, чтобы развернуть или удалить её.';
    const CONNECT_HINT = 'Выберите блок, с которого начинается стрелка. Esc — выход из режима';
    const NODE_WIDTH = 240;

    let zIndexCounter = 10;
    let nodes = [];          // [{ id, type, x, y, content, activityData, duration }]
    let connections = [];    // [{ id, fromId, toId }] — стрелка: «toId начинается после fromId»
    let currentPlot = null;  // { _id, title, description } — открытый для редактирования сюжет
    let isDirty = false;
    let schedule = computeSchedule([], []);
    let selectedConnectionId = null;

    let isConnectMode = false;
    let selectedSourceNodeId = null;

    const resizeObserver = new ResizeObserver(() => updateLines());

    function uid(prefix) {
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    }

    function markDirty() {
        isDirty = true;
        $('unsaved-dot').hidden = false;
    }

    function markClean() {
        isDirty = false;
        $('unsaved-dot').hidden = true;
    }

    function setCurrentPlot(plot) {
        currentPlot = plot ? { _id: plot._id, title: plot.title, description: plot.description || '' } : null;
        $('current-plot-name').textContent = currentPlot ? currentPlot.title : 'Новый сюжет';
    }

    function nextNodePosition() {
        const left = viewport.scrollLeft + 60;
        const top = viewport.scrollTop + 40;
        const last = nodes[nodes.length - 1];
        const lastVisible = last && last.x >= viewport.scrollLeft && last.y >= viewport.scrollTop &&
            last.x < viewport.scrollLeft + viewport.clientWidth && last.y < viewport.scrollTop + viewport.clientHeight;

        if (!lastVisible) return { x: left, y: top };

        const step = NODE_WIDTH + 80;
        if (last.x + step + NODE_WIDTH <= viewport.scrollLeft + viewport.clientWidth) {
            return { x: last.x + step, y: last.y };
        }
        return { x: left, y: last.y + 240 };
    }

    function setHint(text, active = false) {
        canvasHint.textContent = text;
        canvasHint.classList.toggle('hint-active', active);
    }

    // --- Время и расписание ---
    function formatClock(minutes) {
        const m = Math.round(Number(minutes) || 0);
        return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    }

    function nodeDuration(node) {
        if (Number.isFinite(node.duration)) return node.duration;
        if (node.type === 'activity') return Number(node.activityData?.durationMinutes) || 0;
        return 0;
    }

    function nodeLabel(node) {
        if (node.type === 'activity') return node.activityData?.title || 'Активность';
        const text = (node.content || '').trim();
        if (!text) return 'Текст';
        return text.length > 40 ? `${text.slice(0, 40)}…` : text;
    }

    // Блок начинается, когда закончились все блоки, стрелки от которых ведут в него.
    // Несвязанные блоки и блоки без входящих стрелок стартуют сразу (параллельно).
    function computeSchedule(nodeList, connList) {
        const ids = new Set(nodeList.map(n => n.id));
        const edges = connList.filter(c => ids.has(c.fromId) && ids.has(c.toId));
        const byId = new Map(nodeList.map(n => [n.id, n]));
        const preds = new Map(nodeList.map(n => [n.id, []]));
        const succs = new Map(nodeList.map(n => [n.id, []]));
        edges.forEach(c => {
            preds.get(c.toId).push(c.fromId);
            succs.get(c.fromId).push(c.toId);
        });

        const indegree = new Map(nodeList.map(n => [n.id, preds.get(n.id).length]));
        const queue = nodeList.filter(n => indegree.get(n.id) === 0).map(n => n.id);
        const times = new Map();

        while (queue.length) {
            const id = queue.shift();
            const start = Math.max(0, ...preds.get(id).map(p => times.get(p)?.end ?? 0));
            const duration = nodeDuration(byId.get(id));
            times.set(id, { start, end: start + duration, duration });
            succs.get(id).forEach(s => {
                indegree.set(s, indegree.get(s) - 1);
                if (indegree.get(s) === 0) queue.push(s);
            });
        }

        nodeList.forEach(n => {
            if (!times.has(n.id)) {
                const duration = nodeDuration(n);
                times.set(n.id, { start: 0, end: duration, duration });
            }
        });

        const all = [...times.values()];
        const total = Math.max(0, ...all.map(t => t.end));
        const sum = all.reduce((s, t) => s + t.duration, 0);

        const criticalNodes = new Set();
        const criticalEdges = new Set();
        if (total > 0) {
            const stack = nodeList.filter(n => times.get(n.id).end === total).map(n => n.id);
            while (stack.length) {
                const id = stack.pop();
                if (criticalNodes.has(id)) continue;
                criticalNodes.add(id);
                const start = times.get(id).start;
                edges.forEach(c => {
                    if (c.toId === id && times.get(c.fromId).end === start) {
                        criticalEdges.add(c.id);
                        stack.push(c.fromId);
                    }
                });
            }
        }

        const events = [];
        all.forEach(t => { if (t.duration > 0) events.push([t.start, 1], [t.end, -1]); });
        events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        let running = 0;
        let maxParallel = 0;
        events.forEach(([, delta]) => {
            running += delta;
            maxParallel = Math.max(maxParallel, running);
        });

        const linked = new Set(edges.flatMap(c => [c.fromId, c.toId]));
        return { times, total, sum, maxParallel, criticalNodes, criticalEdges, linked };
    }

    function hasPath(fromId, toId, connList = connections) {
        const stack = [fromId];
        const seen = new Set();
        while (stack.length) {
            const id = stack.pop();
            if (id === toId) return true;
            if (seen.has(id)) continue;
            seen.add(id);
            connList.forEach(c => { if (c.fromId === id) stack.push(c.toId); });
        }
        return false;
    }

    function tryConnect(fromId, toId) {
        if (fromId === toId) return false;
        if (connections.some(c => c.fromId === fromId && c.toId === toId)) {
            toast('Эти блоки уже связаны', 'error');
            return false;
        }
        if (connections.some(c => c.fromId === toId && c.toId === fromId)) {
            toast('Стрелка между этими блоками уже есть. Нажмите на неё, чтобы развернуть.', 'error');
            return false;
        }
        if (hasPath(toId, fromId)) {
            toast('Так нельзя: стрелки замкнутся в круг, и у квеста не будет конца', 'error');
            return false;
        }
        connections.push({ id: uid('conn'), fromId, toId });
        markDirty();
        refreshCanvasState();
        return true;
    }

    function refreshCanvasState() {
        if (selectedConnectionId && !connections.some(c => c.id === selectedConnectionId)) {
            selectedConnectionId = null;
        }
        schedule = computeSchedule(nodes, connections);
        updateNodeTimes();
        updateLines();
        renderStats();
        if (!timelinePanel.hidden) renderTimeline();
    }

    function updateNodeTimes() {
        const showUnlinked = nodes.length > 1;
        nodes.forEach(node => {
            const el = $(node.id);
            if (!el) return;
            const t = schedule.times.get(node.id);
            el.querySelector('.node-time').textContent = `${formatClock(t.start)} – ${formatClock(t.end)}`;
            el.classList.toggle('critical', schedule.criticalNodes.has(node.id));
            el.querySelector('.node-flag').hidden = !showUnlinked || schedule.linked.has(node.id);
            const input = el.querySelector('.node-duration input');
            if (document.activeElement !== input) input.value = nodeDuration(node);
        });
    }

    function renderStats() {
        $('quest-stats').hidden = nodes.length === 0;
        $('stats-total').textContent = formatDuration(schedule.total);

        const lines = [];
        if (schedule.total === 0) {
            lines.push('Укажите время у блоков, чтобы посчитать длительность');
        } else if (schedule.maxParallel > 1) {
            lines.push(`Одновременно идут до ${schedule.maxParallel} веток`);
            lines.push(`Если всё делать по очереди — ${formatDuration(schedule.sum)}`);
        } else {
            lines.push('Все блоки идут друг за другом');
        }
        $('stats-details').innerHTML = lines.map(l => `<span>${escapeHtml(l)}</span>`).join('');
    }

    // --- Таймлайн ---
    function niceStep(total) {
        return [5, 10, 15, 30, 60, 120, 240, 480].find(s => total / s <= 8) || 960;
    }

    function renderTimeline() {
        const body = $('timeline-body');
        const rows = nodes
            .map(node => ({ node, t: schedule.times.get(node.id) }))
            .filter(r => r.t.duration > 0)
            .sort((a, b) => a.t.start - b.t.start || a.t.end - b.t.end);

        if (rows.length === 0) {
            body.innerHTML = '<div class="list-empty">Ничего нет — укажите время у блоков на полотне.</div>';
            return;
        }

        const total = schedule.total;
        const step = niceStep(total);
        const ticks = [];
        for (let m = 0; m <= total; m += step) ticks.push(m);
        const pct = (m) => `${(m / total * 100).toFixed(3)}%`;
        const grid = ticks.map(m => `<span class="tl-grid" style="left:${pct(m)}"></span>`).join('');

        body.innerHTML = `
            <div class="tl-row tl-scale">
                <div class="tl-label"></div>
                <div class="tl-track">${ticks.map(m => `<span class="tl-tick" style="left:${pct(m)}">${formatClock(m)}</span>`).join('')}</div>
            </div>
            ${rows.map(({ node, t }) => `
                <div class="tl-row" data-node="${node.id}" title="Показать блок на полотне">
                    <div class="tl-label">${escapeHtml(nodeLabel(node))}</div>
                    <div class="tl-track">
                        ${grid}
                        <div class="tl-bar ${node.type === 'text' ? 'text' : ''} ${schedule.criticalNodes.has(node.id) ? 'critical' : ''}"
                             style="left:${pct(t.start)};width:${pct(t.duration)}">
                            ${formatClock(t.start)} – ${formatClock(t.end)}
                        </div>
                    </div>
                </div>`).join('')}`;
    }

    function setTimelineOpen(open) {
        timelinePanel.hidden = !open;
        canvasHint.hidden = open;
        $('timeline-toggle').textContent = open ? 'Скрыть таймлайн' : 'Показать таймлайн';
        if (open) renderTimeline();
    }

    $('timeline-toggle').addEventListener('click', () => setTimelineOpen(timelinePanel.hidden));
    $('timeline-close').addEventListener('click', () => setTimelineOpen(false));
    $('timeline-body').addEventListener('click', (e) => {
        const row = e.target.closest('[data-node]');
        if (row) focusNode(row.dataset.node);
    });

    function focusNode(id) {
        const el = $(id);
        if (!el) return;
        viewport.scrollTo({
            left: Math.max(0, el.offsetLeft + el.offsetWidth / 2 - viewport.clientWidth / 2),
            top: Math.max(0, el.offsetTop - viewport.clientHeight / 4),
            behavior: 'smooth'
        });
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
    }

    // --- Режим связывания по клику ---
    connectModeBtn.addEventListener('click', () => {
        if (isConnectMode) {
            resetConnectMode();
            return;
        }
        if (nodes.length < 2) {
            toast('Для связи нужно хотя бы два блока на полотне', 'error');
            return;
        }
        deselectConnection();
        isConnectMode = true;
        connectModeBtn.classList.add('active');
        connectModeBtn.textContent = 'Готово';
        viewport.classList.add('connect-mode');
        setHint(CONNECT_HINT, true);
    });

    function resetConnectMode() {
        isConnectMode = false;
        selectedSourceNodeId = null;
        connectModeBtn.classList.remove('active');
        connectModeBtn.textContent = 'Связать блоки';
        viewport.classList.remove('connect-mode');
        document.querySelectorAll('.canvas-node').forEach(el => el.classList.remove('connecting-source'));
        setHint(DEFAULT_HINT);
    }

    function handleConnectClick(node, el) {
        if (!selectedSourceNodeId) {
            selectedSourceNodeId = node.id;
            el.classList.add('connecting-source');
            setHint('Теперь выберите блок, который начнётся после него', true);
            return;
        }

        const fromId = selectedSourceNodeId;
        selectedSourceNodeId = null;
        document.querySelectorAll('.connecting-source').forEach(n => n.classList.remove('connecting-source'));
        if (fromId === node.id) {
            setHint(CONNECT_HINT, true);
            return;
        }
        tryConnect(fromId, node.id);
        setHint('Выберите начало следующей стрелки или нажмите «Готово»', true);
    }

    // --- Очистка ---
    $('clear-canvas-btn').addEventListener('click', async () => {
        if (nodes.length === 0 && !currentPlot) {
            toast('Полотно уже пустое');
            return;
        }
        const ok = await confirmDialog({
            title: 'Очистить полотно?',
            text: 'Все блоки и связи будут убраны с полотна. Сохранённые сюжеты не пострадают.',
            okText: 'Очистить'
        });
        if (!ok) return;
        nodes = [];
        connections = [];
        selectedConnectionId = null;
        setCurrentPlot(null);
        markClean();
        resetConnectMode();
        renderCanvas();
    });

    // --- Добавление блоков ---
    $('add-block-btn').addEventListener('click', () => {
        const node = { id: uid('node'), type: 'text', ...nextNodePosition(), content: '' };
        nodes.push(node);
        markDirty();
        renderCanvas();
        document.querySelector(`#${node.id} textarea`)?.focus();
    });

    let canvasActFilter = 'all';
    document.querySelectorAll('#canvas-act-filters .pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#canvas-act-filters .pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            canvasActFilter = btn.dataset.canvasFilter || 'all';
            renderCanvasActList();
        });
    });

    $('add-act-canvas-btn').addEventListener('click', async () => {
        $('canvas-act-search').value = '';
        canvasActFilter = 'all';
        document.querySelectorAll('#canvas-act-filters .pill-btn').forEach(b => b.classList.toggle('active', b.dataset.canvasFilter === 'all'));
        renderCanvasActList();
        openModal(selectActModal);
        await loadActivities();
        renderCanvasActList();
    });

    $('canvas-act-search').addEventListener('input', renderCanvasActList);

    function renderCanvasActList() {
        const list = $('canvas-act-list');
        const query = $('canvas-act-search').value;

        if (state.activities.length === 0) {
            renderEmpty(list, {
                text: 'Активностей пока нет. Сначала создайте их в разделе «Активности».',
                actionLabel: 'Перейти к активностям',
                onAction: () => { closeModal(selectActModal); showTab('section-2'); }
            });
            return;
        }

        let filtered = state.activities.filter(a => matches(query, a.title, a.description));
        if (canvasActFilter === 'only-attrs') {
            filtered = filtered.filter(a => (a.items || []).every(i => (i.type || 'attribute') === 'attribute'));
        } else if (canvasActFilter === 'only-mats') {
            filtered = filtered.filter(a => (a.items || []).some(i => i.type === 'material'));
        }

        if (filtered.length === 0) {
            renderEmpty(list, { title: 'Ничего не найдено', text: 'Попробуйте изменить запрос или фильтр.' });
            return;
        }

        list.innerHTML = '';
        filtered.forEach(act => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'act-select-card';
            const items = act.items || [];
            const attrsCount = items.filter(i => (i.type || 'attribute') === 'attribute').length;
            const matsCount = items.filter(i => i.type === 'material').length;

            btn.innerHTML = `
                <strong>${escapeHtml(act.title)}</strong>
                <span class="badge badge-blue">${formatDuration(act.durationMinutes)}</span>
                <div class="badge-row" style="margin-top: 4px;">
                    ${attrsCount ? `<span class="badge badge-attribute">${attrsCount} атр.</span>` : ''}
                    ${matsCount ? `<span class="badge badge-material">${matsCount} мат.</span>` : ''}
                    ${!items.length ? `<span class="card-muted" style="font-size: 11px;">Без реквизита</span>` : ''}
                </div>`;
            btn.addEventListener('click', () => {
                nodes.push({ id: uid('node'), type: 'activity', ...nextNodePosition(), activityData: act });
                closeModal(selectActModal);
                markDirty();
                renderCanvas();
            });
            list.appendChild(btn);
        });
    }

    // --- Рендер полотна ---
    function renderCanvas() {
        resizeObserver.disconnect();
        canvas.querySelectorAll('.canvas-node').forEach(n => n.remove());

        nodes.forEach(node => {
            const el = createNodeElement(node);
            canvas.appendChild(el);
            resizeObserver.observe(el);
        });

        canvasEmpty.hidden = nodes.length > 0;
        refreshCanvasState();
    }

    function createNodeElement(node) {
        const isActivity = node.type === 'activity';
        const el = document.createElement('div');
        el.className = `canvas-node ${isActivity ? 'canvas-node-activity' : 'canvas-node-text'}`;
        el.id = node.id;
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        el.style.zIndex = zIndexCounter++;

        const header = document.createElement('div');
        header.className = 'canvas-node-header';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'node-title';
        titleSpan.textContent = isActivity ? node.activityData.title : 'Текст';
        titleSpan.title = titleSpan.textContent;

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-btn';
        deleteBtn.title = 'Удалить блок';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteNode(node.id);
        });

        header.append(titleSpan, deleteBtn);
        el.appendChild(header);

        if (isActivity) {
            const act = node.activityData;
            const items = act.items || [];
            if (act.description || items.length) {
                const body = document.createElement('div');
                body.className = 'canvas-node-body';
                body.innerHTML = `
                    ${act.description ? `<p>${escapeHtml(act.description)}</p>` : ''}
                    ${items.length ? `<div class="items-tags">${items.map(i => `<span class="item-tag ${i.type === 'material' ? 'item-tag-material' : 'item-tag-attribute'}">${escapeHtml(i.name)}</span>`).join('')}</div>` : ''}`;
                el.appendChild(body);
            }
        } else {
            const textarea = document.createElement('textarea');
            textarea.className = 'text-block-content';
            textarea.placeholder = 'Введите текст сюжета...';
            textarea.value = node.content || '';
            textarea.addEventListener('input', (e) => {
                node.content = e.target.value;
                markDirty();
                if (!timelinePanel.hidden) renderTimeline();
            });
            el.appendChild(textarea);
        }

        const footer = document.createElement('div');
        footer.className = 'node-footer';
        footer.innerHTML = `
            <label class="node-duration" title="Сколько минут занимает этот блок">
                <input type="number" min="0" max="1440" step="1" value="${nodeDuration(node)}">
                <span>мин</span>
            </label>
            <span class="node-flag" title="К блоку не ведут стрелки — считается, что он начинается сразу" hidden>не связан</span>
            <span class="node-time" title="Начало и конец от старта квеста"></span>`;

        const durationInput = footer.querySelector('input');
        durationInput.addEventListener('input', () => {
            const value = Math.max(0, Math.min(1440, Math.round(Number(durationInput.value) || 0)));
            if (isActivity && value === Number(node.activityData.durationMinutes)) delete node.duration;
            else node.duration = value;
            markDirty();
            refreshCanvasState();
        });
        durationInput.addEventListener('blur', () => { durationInput.value = nodeDuration(node); });
        el.appendChild(footer);

        const port = document.createElement('span');
        port.className = 'node-port';
        port.title = 'Потяните к блоку, который начнётся после этого';
        port.setAttribute('role', 'button');
        port.setAttribute('aria-label', `Провести стрелку от блока «${nodeLabel(node)}»`);
        el.appendChild(port);
        makePortDraggable(port, node, el);

        el.addEventListener('click', (e) => {
            if (!isConnectMode) return;
            e.stopPropagation();
            handleConnectClick(node, el);
        });

        makeDraggable(el, header, node);
        return el;
    }

    async function deleteNode(id) {
        const node = nodes.find(n => n.id === id);
        const hasContent = node && (node.type === 'activity' || (node.content || '').trim());
        if (hasContent) {
            const ok = await confirmDialog({ title: 'Удалить блок?', text: 'Блок и все его стрелки будут убраны с полотна.' });
            if (!ok) return;
        }
        nodes = nodes.filter(n => n.id !== id);
        connections = connections.filter(c => c.fromId !== id && c.toId !== id);
        markDirty();
        renderCanvas();
    }

    // --- Перетаскивание блоков ---
    function makeDraggable(element, handle, nodeData) {
        handle.addEventListener('pointerdown', (e) => {
            if (isConnectMode || e.button !== 0 || e.target.closest('.delete-btn')) return;
            e.preventDefault();
            handle.setPointerCapture(e.pointerId);

            const startX = e.clientX;
            const startY = e.clientY;
            const originX = nodeData.x;
            const originY = nodeData.y;
            const maxX = canvas.offsetWidth - element.offsetWidth;
            const maxY = canvas.offsetHeight - element.offsetHeight;
            let moved = false;

            element.style.zIndex = ++zIndexCounter;
            element.classList.add('dragging');

            const onMove = (ev) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
                moved = true;
                nodeData.x = Math.min(Math.max(0, originX + dx), maxX);
                nodeData.y = Math.min(Math.max(0, originY + dy), maxY);
                element.style.left = `${nodeData.x}px`;
                element.style.top = `${nodeData.y}px`;
                updateLines();
            };

            const onUp = () => {
                handle.removeEventListener('pointermove', onMove);
                handle.removeEventListener('pointerup', onUp);
                handle.removeEventListener('pointercancel', onUp);
                element.classList.remove('dragging');
                if (moved) markDirty();
            };

            handle.addEventListener('pointermove', onMove);
            handle.addEventListener('pointerup', onUp);
            handle.addEventListener('pointercancel', onUp);
        });
    }

    // --- Проведение стрелки от кружка ---
    function makePortDraggable(port, node, fromEl) {
        port.addEventListener('pointerdown', (e) => {
            if (isConnectMode || e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            port.setPointerCapture(e.pointerId);
            deselectConnection();

            const temp = document.createElementNS(SVG_NS, 'path');
            temp.setAttribute('class', 'connection-temp');
            temp.setAttribute('marker-end', 'url(#arrow-selected)');
            tempLayer.appendChild(temp);
            fromEl.classList.add('connecting-source');
            let target = null;

            const onMove = (ev) => {
                const hovered = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.canvas-node');
                const next = hovered && hovered !== fromEl ? hovered : null;
                if (next !== target) {
                    target?.classList.remove('drop-target');
                    next?.classList.add('drop-target');
                    target = next;
                }
                const rect = canvas.getBoundingClientRect();
                const point = { x: ev.clientX - rect.left, y: ev.clientY - rect.top, w: 0, h: 0 };
                temp.setAttribute('d', bezier(nodeBox(fromEl), target ? nodeBox(target) : point).d);
            };

            const onUp = () => {
                port.removeEventListener('pointermove', onMove);
                port.removeEventListener('pointerup', onUp);
                port.removeEventListener('pointercancel', onUp);
                temp.remove();
                fromEl.classList.remove('connecting-source');
                if (target) {
                    target.classList.remove('drop-target');
                    tryConnect(node.id, target.id);
                }
            };

            port.addEventListener('pointermove', onMove);
            port.addEventListener('pointerup', onUp);
            port.addEventListener('pointercancel', onUp);
        });
    }

    // --- Линии связей ---
    function nodeBox(el) {
        return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
    }

    function bezier(a, b) {
        const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
        const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        const dx = bc.x - ac.x;
        const dy = bc.y - ac.y;
        let p1, p2, c1, c2;

        if (Math.abs(dx) > (a.w + b.w) / 2 + 20) {
            const dir = Math.sign(dx) || 1;
            p1 = { x: ac.x + dir * a.w / 2, y: ac.y };
            p2 = { x: bc.x - dir * b.w / 2, y: bc.y };
            const k = Math.max(40, Math.abs(p2.x - p1.x) / 2);
            c1 = { x: p1.x + dir * k, y: p1.y };
            c2 = { x: p2.x - dir * k, y: p2.y };
        } else {
            const dir = Math.sign(dy) || 1;
            p1 = { x: ac.x, y: ac.y + dir * a.h / 2 };
            p2 = { x: bc.x, y: bc.y - dir * b.h / 2 };
            const k = Math.max(40, Math.abs(p2.y - p1.y) / 2);
            c1 = { x: p1.x, y: p1.y + dir * k };
            c2 = { x: p2.x, y: p2.y - dir * k };
        }
        return {
            d: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`,
            mid: {
                x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8,
                y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8
            }
        };
    }

    function updateLines() {
        connectionsLayer.innerHTML = '';
        let menuPosition = null;

        connections.forEach(conn => {
            const fromEl = $(conn.fromId);
            const toEl = $(conn.toId);
            if (!fromEl || !toEl) return;

            const { d, mid } = bezier(nodeBox(fromEl), nodeBox(toEl));
            const isSelected = conn.id === selectedConnectionId;
            const isCritical = schedule.criticalEdges.has(conn.id);

            const group = document.createElementNS(SVG_NS, 'g');
            group.setAttribute('class', `connection-group${isCritical ? ' critical' : ''}${isSelected ? ' selected' : ''}`);

            const title = document.createElementNS(SVG_NS, 'title');
            title.textContent = 'Нажмите, чтобы развернуть или удалить стрелку';

            const hit = document.createElementNS(SVG_NS, 'path');
            hit.setAttribute('d', d);
            hit.setAttribute('class', 'connection-hit');

            const line = document.createElementNS(SVG_NS, 'path');
            line.setAttribute('d', d);
            line.setAttribute('class', 'connection-line');
            line.setAttribute('marker-end', `url(#${isSelected ? 'arrow-selected' : isCritical ? 'arrow-critical' : 'arrow'})`);

            group.append(title, hit, line);
            group.addEventListener('click', (e) => {
                e.stopPropagation();
                selectConnection(conn.id);
            });

            connectionsLayer.appendChild(group);
            if (isSelected) menuPosition = mid;
        });

        connectionMenu.hidden = !menuPosition;
        if (menuPosition) {
            connectionMenu.style.left = `${menuPosition.x}px`;
            connectionMenu.style.top = `${menuPosition.y}px`;
        }
    }

    // --- Редактирование стрелок ---
    function selectConnection(id) {
        if (isConnectMode) resetConnectMode();
        selectedConnectionId = id;
        updateLines();
    }

    function deselectConnection() {
        if (!selectedConnectionId) return;
        selectedConnectionId = null;
        updateLines();
    }

    function deleteConnection(id) {
        connections = connections.filter(c => c.id !== id);
        selectedConnectionId = null;
        markDirty();
        refreshCanvasState();
        toast('Стрелка удалена');
    }

    function reverseConnection(id) {
        const conn = connections.find(c => c.id === id);
        if (!conn) return;
        const others = connections.filter(c => c.id !== id);
        if (hasPath(conn.fromId, conn.toId, others)) {
            toast('Нельзя развернуть: стрелки замкнутся в круг', 'error');
            return;
        }
        [conn.fromId, conn.toId] = [conn.toId, conn.fromId];
        markDirty();
        refreshCanvasState();
    }

    connectionMenu.addEventListener('pointerdown', (e) => e.stopPropagation());
    connectionMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = e.target.closest('[data-conn-action]')?.dataset.connAction;
        if (action === 'reverse') reverseConnection(selectedConnectionId);
        if (action === 'delete') deleteConnection(selectedConnectionId);
    });

    canvas.addEventListener('click', () => deselectConnection());

    // --- Сохранение сюжета ---
    function openSavePlotModal() {
        if (nodes.length === 0) {
            toast('Полотно пустое — добавьте хотя бы один блок', 'error');
            return;
        }
        $('plot-title').value = currentPlot?.title || '';
        $('plot-desc').value = currentPlot?.description || '';
        $('save-plot-heading').textContent = currentPlot ? 'Сохранение изменений' : 'Сохранение сюжета';
        $('save-plot-submit').textContent = currentPlot ? 'Сохранить изменения' : 'Сохранить';
        $('save-plot-as-new').hidden = !currentPlot;
        openModal(savePlotModal);
    }

    $('save-plot-btn').addEventListener('click', openSavePlotModal);

    async function savePlot(asNew) {
        const title = $('plot-title').value.trim();
        if (!title) {
            toast('Введите название сюжета', 'error');
            $('plot-title').focus();
            return;
        }

        const payload = {
            title,
            description: $('plot-desc').value.trim(),
            canvasData: JSON.stringify({ nodes, connections }),
            activityIds: [...new Set(nodes.filter(n => n.type === 'activity').map(n => n.activityData._id))]
        };

        const isUpdate = currentPlot && !asNew;
        try {
            const saved = await api(isUpdate ? `/api/plots/${currentPlot._id}` : '/api/plots', {
                method: isUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            setCurrentPlot(saved);
            markClean();
            closeModal(savePlotModal);
            toast(isUpdate ? 'Изменения сохранены' : 'Сюжет сохранён', 'success');
            loadPlots();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    savePlotForm.addEventListener('submit', (e) => {
        e.preventDefault();
        withBusy($('save-plot-submit'), () => savePlot(false))();
    });
    $('save-plot-as-new').addEventListener('click', withBusy($('save-plot-as-new'), () => savePlot(true)));

    window.addEventListener('beforeunload', (e) => {
        if (isDirty && nodes.length) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // ==========================================================
    // 3. Активности
    // ==========================================================
    const actModal = $('act-modal');
    const actForm = $('act-form');
    const activitiesList = $('activities-list');
    const actItemsSelect = $('act-items-select');
    const actItemDropdown = $('act-item-dropdown');
    const actItemsChips = $('act-items-chips');
    let editingActivityId = null;
    let activitiesLoaded = false;
    let actAttrFilter = 'all';
    let currentActSelectedItems = new Set();

    async function loadActivities() {
        if (!activitiesLoaded) renderSkeleton(activitiesList);
        try {
            state.activities = await api('/api/activities');
            activitiesLoaded = true;
        } catch (err) {
            if (!activitiesLoaded) renderEmpty(activitiesList, { title: 'Не удалось загрузить', text: err.message });
            return;
        }
        updateCounts();
        updateActAttrFilterDropdown();
        renderActivities();
    }

    function updateActAttrFilterDropdown() {
        const select = $('act-attr-filter');
        if (!select) return;
        const currentVal = select.value || 'all';
        select.innerHTML = `
            <option value="all">Все активности</option>
            <option value="only-attrs">Только с атрибутами</option>
            <option value="only-mats">Только с материалами</option>
            <option value="no-items">Без реквизита</option>
        `;
        if (state.items.length) {
            const grp = document.createElement('optgroup');
            grp.label = 'Фильтр по конкретному предмету';
            state.items.forEach(i => {
                const opt = document.createElement('option');
                opt.value = `item:${i._id}`;
                opt.textContent = `${i.name} (${i.type === 'material' ? 'материал' : 'атрибут'})`;
                grp.appendChild(opt);
            });
            select.appendChild(grp);
        }
        if (Array.from(select.options).some(o => o.value === currentVal)) {
            select.value = currentVal;
        }
    }

    $('act-attr-filter')?.addEventListener('change', (e) => {
        actAttrFilter = e.target.value;
        renderActivities();
    });

    function renderActivities() {
        const query = $('act-search').value;

        if (state.activities.length === 0) {
            renderEmpty(activitiesList, {
                text: 'Здесь пока нет ни одной активности. Создайте первую — её можно будет добавить на полотно сюжета.',
                actionLabel: 'Добавить активность',
                onAction: () => openActivityModal()
            });
            return;
        }

        let filtered = state.activities.filter(a =>
            matches(query, a.title, a.description, ...(a.items || []).map(i => i.name)));

        if (actAttrFilter === 'only-attrs') {
            filtered = filtered.filter(a => (a.items || []).length > 0 && (a.items || []).every(i => (i.type || 'attribute') === 'attribute'));
        } else if (actAttrFilter === 'only-mats') {
            filtered = filtered.filter(a => (a.items || []).some(i => i.type === 'material'));
        } else if (actAttrFilter === 'no-items') {
            filtered = filtered.filter(a => !a.items || a.items.length === 0);
        } else if (actAttrFilter.startsWith('item:')) {
            const targetId = Number(actAttrFilter.slice(5));
            filtered = filtered.filter(a => (a.items || []).some(i => i._id === targetId));
        }

        if (filtered.length === 0) {
            renderEmpty(activitiesList, { title: 'Ничего не найдено', text: 'Попробуйте изменить запрос или фильтр.' });
            return;
        }

        activitiesList.innerHTML = filtered.map(act => {
            const items = act.items || [];
            return `
                <article class="card">
                    <div class="card-body">
                        <h4 class="card-title">${escapeHtml(act.title)}</h4>
                        <div class="plot-duration">
                            <span class="card-label">Время на выполнение</span>
                            <strong>${formatDuration(act.durationMinutes)}</strong>
                        </div>
                        ${act.description ? `<p class="card-text">${escapeHtml(act.description)}</p>` : ''}
                        <span class="card-label">Реквизит</span>
                        ${items.length
                            ? `<div class="items-tags">${items.map(i => `<span class="item-tag ${i.type === 'material' ? 'item-tag-material' : 'item-tag-attribute'}">${escapeHtml(i.name)}</span>`).join('')}</div>`
                            : '<span class="card-muted">Не требуется</span>'}
                    </div>
                    <div class="card-footer">
                        <button type="button" class="btn btn-light btn-sm" data-action="edit" data-id="${act._id}">Изменить</button>
                        <span class="spacer"></span>
                        <button type="button" class="btn btn-outline-danger btn-sm" data-action="delete" data-id="${act._id}">Удалить</button>
                    </div>
                </article>`;
        }).join('');
    }

    activitiesList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const act = state.activities.find(a => a._id === Number(btn.dataset.id));
        if (!act) return;
        if (btn.dataset.action === 'edit') openActivityModal(act);
        if (btn.dataset.action === 'delete') deleteActivity(act);
    });

    $('act-search').addEventListener('input', renderActivities);
    $('add-act-btn').addEventListener('click', () => openActivityModal());

    const actDurationInput = $('act-duration');

    function syncDurationPresets() {
        const value = Number(actDurationInput.value);
        document.querySelectorAll('#act-duration-presets [data-min]').forEach(btn => {
            btn.classList.toggle('active', Number(btn.dataset.min) === value);
        });
        $('act-duration-hint').textContent = value > 0
            ? `Активность займёт ${formatDuration(value)}. Это время учитывается при расчёте длительности квеста.`
            : 'Укажите, сколько минут займёт активность';
    }

    $('act-duration-presets').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-min]');
        if (!btn) return;
        actDurationInput.value = btn.dataset.min;
        syncDurationPresets();
    });
    actDurationInput.addEventListener('input', syncDurationPresets);

    function populateActItemDropdown() {
        if (!actItemDropdown) return;
        actItemDropdown.innerHTML = '<option value="">-- Выберите предмет для добавления --</option>';
        const attrs = state.items.filter(i => (i.type || 'attribute') === 'attribute');
        const mats = state.items.filter(i => i.type === 'material');

        if (attrs.length) {
            const grp = document.createElement('optgroup');
            grp.label = 'Атрибуты (многоразовый реквизит)';
            attrs.forEach(i => {
                const opt = document.createElement('option');
                opt.value = i._id;
                const isAdded = currentActSelectedItems.has(i._id);
                opt.textContent = `${i.name} (${i.quantity} шт.)` + (isAdded ? ' — добавлен' : '');
                opt.disabled = isAdded;
                grp.appendChild(opt);
            });
            actItemDropdown.appendChild(grp);
        }
        if (mats.length) {
            const grp = document.createElement('optgroup');
            grp.label = 'Материалы (расходные)';
            mats.forEach(i => {
                const opt = document.createElement('option');
                opt.value = i._id;
                const isAdded = currentActSelectedItems.has(i._id);
                opt.textContent = `${i.name} (${i.quantity} шт.)` + (isAdded ? ' — добавлен' : '');
                opt.disabled = isAdded;
                grp.appendChild(opt);
            });
            actItemDropdown.appendChild(grp);
        }
        actItemDropdown.value = '';
    }

    function renderActChips() {
        if (!actItemsChips) return;
        actItemsChips.innerHTML = '';
        if (currentActSelectedItems.size === 0) {
            actItemsChips.innerHTML = '<span class="card-muted" style="font-size: 13px;">Реквизит не выбран (выберите из списка выше)</span>';
            return;
        }
        currentActSelectedItems.forEach(id => {
            const item = state.items.find(i => i._id === id);
            if (!item) return;
            const chip = document.createElement('span');
            const isMat = item.type === 'material';
            chip.className = `item-chip ${isMat ? 'chip-mat' : 'chip-attr'}`;
            chip.innerHTML = `
                <span>${escapeHtml(item.name)} <small style="opacity:0.75;">(${isMat ? 'материал' : 'атрибут'})</small></span>
                <button type="button" class="item-chip-remove" data-id="${item._id}" title="Удалить">&times;</button>
            `;
            actItemsChips.appendChild(chip);
        });
    }

    function renderItemsCheckboxList() {
        if (!actItemsSelect) return;
        if (state.items.length === 0) {
            actItemsSelect.innerHTML = '<div class="list-empty">Предметов пока нет — их можно создать в разделе «Атрибуты и материалы».</div>';
            return;
        }

        actItemsSelect.innerHTML = state.items.map(item => `
            <label class="checkbox-item">
                <input type="checkbox" value="${item._id}" ${currentActSelectedItems.has(item._id) ? 'checked' : ''}>
                ${item.photoUrl
                    ? `<img class="checkbox-thumb" src="${escapeHtml(assetUrl(item.photoUrl))}" alt="" data-letter="${escapeHtml(item.name.charAt(0).toUpperCase())}">`
                    : `<span class="checkbox-thumb">${escapeHtml(item.name.charAt(0).toUpperCase())}</span>`}
                <span class="checkbox-name">${escapeHtml(item.name)}</span>
                <span class="badge ${item.type === 'material' ? 'badge-material' : 'badge-attribute'}" style="font-size:10px; padding:2px 6px;">${item.type === 'material' ? 'Материал' : 'Атрибут'}</span>
                <span class="checkbox-qty">${item.quantity} шт.</span>
            </label>`).join('');

        actItemsSelect.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const id = Number(cb.value);
                if (cb.checked) currentActSelectedItems.add(id);
                else currentActSelectedItems.delete(id);
                populateActItemDropdown();
                renderActChips();
            });
        });

        actItemsSelect.querySelectorAll('img.checkbox-thumb').forEach(img => {
            img.addEventListener('error', () => {
                const letter = document.createElement('span');
                letter.className = 'checkbox-thumb';
                letter.textContent = img.dataset.letter;
                img.replaceWith(letter);
            }, { once: true });
        });
    }

    function updateItemsCheckboxes() {
        if (!actItemsSelect) return;
        const checkboxes = actItemsSelect.querySelectorAll('input[type="checkbox"]');
        if (checkboxes.length !== state.items.length) {
            renderItemsCheckboxList();
        } else {
            checkboxes.forEach(cb => {
                cb.checked = currentActSelectedItems.has(Number(cb.value));
            });
        }
    }

    function syncActItemPicker() {
        populateActItemDropdown();
        renderActChips();
        updateItemsCheckboxes();
    }

    function addSelectedItemFromDropdown() {
        const val = Number(actItemDropdown.value);
        if (!val) {
            toast('Выберите предмет из списка', 'info');
            return;
        }
        currentActSelectedItems.add(val);
        syncActItemPicker();
    }

    $('act-item-add-btn')?.addEventListener('click', addSelectedItemFromDropdown);

    actItemDropdown?.addEventListener('change', () => {
        const val = Number(actItemDropdown.value);
        if (val && !currentActSelectedItems.has(val)) {
            currentActSelectedItems.add(val);
            syncActItemPicker();
        }
    });

    actItemDropdown?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addSelectedItemFromDropdown();
        }
    });

    actItemsChips?.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.item-chip-remove');
        if (!removeBtn) return;
        const id = Number(removeBtn.dataset.id);
        currentActSelectedItems.delete(id);
        syncActItemPicker();
    });

    async function openActivityModal(act = null) {
        editingActivityId = act ? act._id : null;
        actForm.reset();
        $('act-modal-title').textContent = act ? 'Редактирование активности' : 'Новая активность';
        $('act-title').value = act?.title || '';
        actDurationInput.value = act?.durationMinutes || 15;
        syncDurationPresets();
        $('act-desc').value = act?.description || '';

        currentActSelectedItems = new Set((act?.items || []).map(i => i._id));
        renderItemsCheckboxList();
        syncActItemPicker();
        openModal(actModal);

        try {
            state.items = await api('/api/items');
            updateCounts();
            updateActAttrFilterDropdown();
            renderItemsCheckboxList();
            syncActItemPicker();
        } catch (err) { /* баннер о сервере уже показан */ }
    }

    actForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const submitBtn = actForm.querySelector('[type="submit"]');
        withBusy(submitBtn, async () => {
            const payload = {
                title: $('act-title').value.trim(),
                durationMinutes: Math.round(Number(actDurationInput.value)),
                description: $('act-desc').value.trim(),
                items: Array.from(currentActSelectedItems)
            };
            if (!payload.title) {
                toast('Введите название активности', 'error');
                return;
            }
            if (!(payload.durationMinutes >= 1 && payload.durationMinutes <= 1440)) {
                toast('Укажите время на выполнение — от 1 до 1440 минут', 'error');
                actDurationInput.focus();
                return;
            }

            const isEdit = editingActivityId !== null;
            try {
                await api(isEdit ? `/api/activities/${editingActivityId}` : '/api/activities', {
                    method: isEdit ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                closeModal(actModal);
                toast(isEdit ? 'Активность обновлена' : 'Активность добавлена', 'success');
                await loadActivities();
                loadItems();
            } catch (err) {
                toast(err.message, 'error');
            }
        })();
    });

    async function deleteActivity(act) {
        const usedInPlots = state.plots.filter(p => p.activities?.some(a => a._id === act._id)).length;
        const ok = await confirmDialog({
            title: 'Удалить активность?',
            text: `«${act.title}» будет удалена без возможности восстановления.` +
                (usedInPlots ? ` Она используется в ${usedInPlots} ${plural(usedInPlots, ['сюжете', 'сюжетах', 'сюжетах'])}.` : '')
        });
        if (!ok) return;
        try {
            await api(`/api/activities/${act._id}`, { method: 'DELETE' });
            toast('Активность удалена', 'success');
            await loadActivities();
            loadItems();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    // ==========================================================
    // 4. Атрибуты и материалы
    // ==========================================================
    const attrModal = $('attr-modal');
    const attrForm = $('attr-form');
    const attributesList = $('attributes-list');
    const photoInput = $('attr-photo');
    const photoDrop = $('photo-drop');
    const photoPreview = $('photo-preview');
    let editingItemId = null;
    let selectedPhoto = null;
    let removePhoto = false;
    let itemsLoaded = false;
    let itemTypeFilter = 'all';

    document.querySelectorAll('#item-type-filters .pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#item-type-filters .pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            itemTypeFilter = btn.dataset.typeFilter || 'all';
            renderItems();
        });
    });

    async function loadItems() {
        if (!itemsLoaded) renderSkeleton(attributesList);
        try {
            state.items = await api('/api/items');
            itemsLoaded = true;
        } catch (err) {
            if (!itemsLoaded) renderEmpty(attributesList, { title: 'Не удалось загрузить', text: err.message });
            return;
        }
        updateCounts();
        updateActAttrFilterDropdown();
        renderItems();
    }

    function renderItems() {
        const query = $('attr-search').value;

        const attrsCount = state.items.filter(i => (i.type || 'attribute') === 'attribute').length;
        const matsCount = state.items.filter(i => i.type === 'material').length;
        if ($('pill-count-all')) $('pill-count-all').textContent = state.items.length;
        if ($('pill-count-attr')) $('pill-count-attr').textContent = attrsCount;
        if ($('pill-count-mat')) $('pill-count-mat').textContent = matsCount;

        if (state.items.length === 0) {
            renderEmpty(attributesList, {
                text: 'Здесь пока нет ни одного предмета. Добавьте атрибуты (реквизит) или материалы (расходники), которые понадобятся для квеста.',
                actionLabel: 'Добавить предмет',
                onAction: () => openItemModal()
            });
            return;
        }

        let filtered = state.items.filter(i => matches(query, i.name, i.description, i.note));
        if (itemTypeFilter === 'attribute') {
            filtered = filtered.filter(i => (i.type || 'attribute') === 'attribute');
        } else if (itemTypeFilter === 'material') {
            filtered = filtered.filter(i => i.type === 'material');
        }

        if (filtered.length === 0) {
            renderEmpty(attributesList, { title: 'Ничего не найдено', text: 'Попробуйте изменить поисковый запрос или фильтр типа.' });
            return;
        }

        attributesList.innerHTML = filtered.map(item => {
            const letter = escapeHtml(item.name.charAt(0).toUpperCase());
            const isMat = item.type === 'material';
            return `
                <article class="card ${isMat ? 'card-material' : 'card-attribute'}">
                    <div class="card-media" data-letter="${letter}">
                        ${item.photoUrl
                            ? `<img src="${escapeHtml(assetUrl(item.photoUrl))}" alt="${escapeHtml(item.name)}" loading="lazy">`
                            : `<span class="card-media-letter">${letter}</span>`}
                    </div>
                    <div class="card-body">
                        <h4 class="card-title">${escapeHtml(item.name)}</h4>
                        <div class="badge-row">
                            <span class="badge ${isMat ? 'badge-material' : 'badge-attribute'}">${isMat ? 'Материал' : 'Атрибут'}</span>
                            <span class="badge badge-green">${item.quantity} шт.</span>
                            ${item.usedIn
                                ? `<span class="badge">в ${item.usedIn} ${plural(item.usedIn, ['активности', 'активностях', 'активностях'])}</span>`
                                : ''}
                        </div>
                        ${item.description ? `<p class="card-text">${escapeHtml(item.description)}</p>` : ''}
                        ${item.note ? `<p class="card-note">${escapeHtml(item.note)}</p>` : ''}
                    </div>
                    <div class="card-footer">
                        <button type="button" class="btn btn-light btn-sm" data-action="edit" data-id="${item._id}">Изменить</button>
                        <span class="spacer"></span>
                        <button type="button" class="btn btn-outline-danger btn-sm" data-action="delete" data-id="${item._id}">Удалить</button>
                    </div>
                </article>`;
        }).join('');

        attributesList.querySelectorAll('.card-media img').forEach(img => {
            img.addEventListener('error', () => {
                const media = img.parentElement;
                media.innerHTML = `<span class="card-media-letter">${media.dataset.letter}</span>`;
            }, { once: true });
        });
    }

    attributesList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const item = state.items.find(i => i._id === Number(btn.dataset.id));
        if (!item) return;
        if (btn.dataset.action === 'edit') openItemModal(item);
        if (btn.dataset.action === 'delete') deleteItem(item);
    });

    $('attr-search').addEventListener('input', renderItems);
    $('add-attr-btn').addEventListener('click', () => openItemModal());

    function setPhotoPreview(src) {
        if (photoPreview.dataset.objectUrl) {
            URL.revokeObjectURL(photoPreview.dataset.objectUrl);
            delete photoPreview.dataset.objectUrl;
        }
        photoPreview.hidden = !src;
        $('photo-placeholder').hidden = !!src;
        $('photo-remove').hidden = !src;
        if (src) photoPreview.src = src;
        else photoPreview.removeAttribute('src');
    }

    function selectPhotoFile(file) {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast('Можно загружать только изображения', 'error');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast('Файл слишком большой (максимум 10 МБ)', 'error');
            return;
        }
        selectedPhoto = file;
        removePhoto = false;
        const url = URL.createObjectURL(file);
        setPhotoPreview(url);
        photoPreview.dataset.objectUrl = url;
    }

    photoInput.addEventListener('change', () => selectPhotoFile(photoInput.files[0]));

    ['dragenter', 'dragover'].forEach(type => photoDrop.addEventListener(type, (e) => {
        e.preventDefault();
        photoDrop.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach(type => photoDrop.addEventListener(type, (e) => {
        e.preventDefault();
        photoDrop.classList.remove('dragover');
    }));
    photoDrop.addEventListener('drop', (e) => selectPhotoFile(e.dataTransfer.files[0]));

    $('photo-remove').addEventListener('click', () => {
        selectedPhoto = null;
        removePhoto = true;
        photoInput.value = '';
        setPhotoPreview(null);
    });

    function openItemModal(item = null) {
        editingItemId = item ? item._id : null;
        selectedPhoto = null;
        removePhoto = false;
        attrForm.reset();
        $('attr-modal-title').textContent = item ? 'Редактирование предмета' : 'Новый предмет';
        const type = item?.type || 'attribute';
        const radio = document.querySelector(`input[name="attr-type"][value="${type}"]`);
        if (radio) radio.checked = true;

        $('attr-name').value = item?.name || '';
        $('attr-quantity').value = item?.quantity || 1;
        $('attr-desc').value = item?.description || '';
        $('attr-note').value = item?.note || '';
        setPhotoPreview(item?.photoUrl ? assetUrl(item.photoUrl) : null);
        openModal(attrModal);
    }

    photoPreview.addEventListener('error', () => {
        if (photoPreview.getAttribute('src')) setPhotoPreview(null);
    });

    attrForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const submitBtn = attrForm.querySelector('[type="submit"]');
        withBusy(submitBtn, async () => {
            const name = $('attr-name').value.trim();
            if (!name) {
                toast('Введите название предмета', 'error');
                return;
            }

            const formData = new FormData();
            if (selectedPhoto) formData.append('photo', selectedPhoto);
            formData.append('name', name);
            formData.append('type', document.querySelector('input[name="attr-type"]:checked')?.value || 'attribute');
            formData.append('quantity', $('attr-quantity').value || 1);
            formData.append('description', $('attr-desc').value.trim());
            formData.append('note', $('attr-note').value.trim());
            if (removePhoto) formData.append('removePhoto', 'true');

            const isEdit = editingItemId !== null;
            try {
                await api(isEdit ? `/api/items/${editingItemId}` : '/api/items', {
                    method: isEdit ? 'PUT' : 'POST',
                    body: formData
                });
                closeModal(attrModal);
                toast(isEdit ? 'Предмет обновлён' : 'Предмет добавлен', 'success');
                await loadItems();
                loadActivities();
            } catch (err) {
                toast(err.message, 'error');
            }
        })();
    });

    async function deleteItem(item) {
        const ok = await confirmDialog({
            title: 'Удалить атрибут?',
            text: `«${item.name}» будет удалён без возможности восстановления.` +
                (item.usedIn ? ` Он также будет убран из ${item.usedIn} ${plural(item.usedIn, ['активности', 'активностей', 'активностей'])}.` : '')
        });
        if (!ok) return;
        try {
            await api(`/api/items/${item._id}`, { method: 'DELETE' });
            toast('Атрибут удалён', 'success');
            await loadItems();
            loadActivities();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    // ==========================================================
    // 5. Готовые сюжеты
    // ==========================================================
    const plotsList = $('plots-list');
    let plotsLoaded = false;

    async function loadPlots() {
        if (!plotsLoaded) renderSkeleton(plotsList);
        try {
            state.plots = await api('/api/plots');
            plotsLoaded = true;
        } catch (err) {
            if (!plotsLoaded) renderEmpty(plotsList, { title: 'Не удалось загрузить', text: err.message });
            return;
        }
        updateCounts();
        renderPlots();
    }

    function parseCanvasData(plot) {
        try {
            const parsed = JSON.parse(plot.canvasData || '{}');
            return { nodes: parsed.nodes || [], connections: parsed.connections || [] };
        } catch (e) {
            return { nodes: [], connections: [] };
        }
    }

    function withActualActivities(nodeList) {
        const actual = new Map(state.activities.map(a => [a._id, a]));
        return nodeList.map(n => (n.type === 'activity' && actual.has(n.activityData?._id))
            ? { ...n, activityData: actual.get(n.activityData._id) }
            : n);
    }

    function plotPreviewSvg(data, critical) {
        if (data.nodes.length === 0) return '';
        const boxes = new Map(data.nodes.map(n => [n.id, {
            x: n.x, y: n.y, w: NODE_WIDTH, h: n.type === 'activity' ? 130 : 120, type: n.type
        }]));
        const all = [...boxes.values()];
        const pad = 40;
        const minX = Math.min(...all.map(b => b.x)) - pad;
        const minY = Math.min(...all.map(b => b.y)) - pad;
        const maxX = Math.max(...all.map(b => b.x + b.w)) + pad;
        const maxY = Math.max(...all.map(b => b.y + b.h)) + pad;

        const lines = data.connections.map(c => {
            const a = boxes.get(c.fromId), b = boxes.get(c.toId);
            if (!a || !b) return '';
            const color = critical.has(c.id) ? '#ea580c' : '#94a3b8';
            return `<path d="${bezier(a, b).d}" fill="none" stroke="${color}" stroke-width="6"/>`;
        }).join('');

        const rects = all.map(b => b.type === 'activity'
            ? `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="16" fill="#eaf1ff" stroke="#2563eb" stroke-width="4"/>
               <rect x="${b.x}" y="${b.y}" width="${b.w}" height="34" rx="16" fill="#2563eb"/>`
            : `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="16" fill="#ffffff" stroke="#cbd2dc" stroke-width="4"/>`
        ).join('');

        return `<svg viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" preserveAspectRatio="xMidYMid meet">${lines}${rects}</svg>`;
    }

    function renderPlots() {
        const query = $('plot-search').value;

        if (state.plots.length === 0) {
            renderEmpty(plotsList, {
                text: 'Сохранённых сюжетов пока нет. Соберите сюжет на полотне и нажмите «Сохранить сюжет».',
                actionLabel: 'Перейти к полотну',
                onAction: () => showTab('section-1')
            });
            return;
        }

        const filtered = state.plots.filter(p =>
            matches(query, p.title, p.description, ...(p.activities || []).map(a => a.title)));
        if (filtered.length === 0) {
            renderEmpty(plotsList, { title: 'Ничего не найдено', text: 'Попробуйте изменить запрос.' });
            return;
        }

        plotsList.innerHTML = filtered.map(plot => {
            const data = parseCanvasData(plot);
            const plotSchedule = computeSchedule(withActualActivities(data.nodes), data.connections);
            const acts = plot.activities || [];
            const isOpen = currentPlot?._id === plot._id;

            return `
                <article class="card">
                    <div class="plot-preview">${plotPreviewSvg(data, plotSchedule.criticalEdges)}</div>
                    <div class="card-body">
                        <h4 class="card-title">${escapeHtml(plot.title)}</h4>
                        <div class="plot-duration">
                            <span class="card-label">Длительность</span>
                            <strong>${formatDuration(plotSchedule.total)}</strong>
                            ${plotSchedule.maxParallel > 1
                                ? `<span class="card-muted">до ${plotSchedule.maxParallel} веток параллельно</span>`
                                : ''}
                        </div>
                        <div class="badge-row">
                            <span class="badge">${data.nodes.length} ${plural(data.nodes.length, ['блок', 'блока', 'блоков'])}</span>
                            <span class="badge">${data.connections.length} ${plural(data.connections.length, ['стрелка', 'стрелки', 'стрелок'])}</span>
                            ${isOpen ? '<span class="badge badge-green">Открыт на полотне</span>' : ''}
                        </div>
                        ${plot.description ? `<p class="card-text">${escapeHtml(plot.description)}</p>` : ''}
                        <span class="card-label">Активности</span>
                        ${acts.length
                            ? `<div class="items-tags">${acts.map(a => `<span class="item-tag">${escapeHtml(a.title)}</span>`).join('')}</div>`
                            : '<span class="card-muted">Нет активностей</span>'}
                    </div>
                    <div class="card-footer">
                        <button type="button" class="btn btn-blue btn-sm" data-action="open" data-id="${plot._id}">Открыть на полотне</button>
                        <span class="spacer"></span>
                        <button type="button" class="btn btn-outline-danger btn-sm" data-action="delete" data-id="${plot._id}">Удалить</button>
                    </div>
                </article>`;
        }).join('');
    }

    plotsList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const plot = state.plots.find(p => p._id === Number(btn.dataset.id));
        if (!plot) return;
        if (btn.dataset.action === 'open') openPlotOnCanvas(plot);
        if (btn.dataset.action === 'delete') deletePlot(plot);
    });

    $('plot-search').addEventListener('input', renderPlots);

    async function openPlotOnCanvas(plot) {
        if (isDirty && nodes.length && currentPlot?._id !== plot._id) {
            const ok = await confirmDialog({
                title: 'Заменить содержимое полотна?',
                text: 'На полотне есть несохранённые изменения. Если продолжить, они будут потеряны.',
                okText: 'Открыть сюжет'
            });
            if (!ok) return;
        }

        const data = parseCanvasData(plot);
        nodes = withActualActivities(data.nodes);
        connections = data.connections;
        selectedConnectionId = null;
        resetConnectMode();

        setCurrentPlot(plot);
        markClean();
        showTab('section-1');
        renderCanvas();
        if (nodes.length) {
            viewport.scrollTo({
                left: Math.max(0, Math.min(...nodes.map(n => n.x)) - 60),
                top: Math.max(0, Math.min(...nodes.map(n => n.y)) - 40)
            });
        }
        toast(`Сюжет «${plot.title}» открыт`, 'success');
    }

    async function deletePlot(plot) {
        const ok = await confirmDialog({
            title: 'Удалить сюжет?',
            text: `«${plot.title}» будет удалён без возможности восстановления.`
        });
        if (!ok) return;
        try {
            await api(`/api/plots/${plot._id}`, { method: 'DELETE' });
            if (currentPlot?._id === plot._id) {
                setCurrentPlot(null);
                if (nodes.length) markDirty();
            }
            toast('Сюжет удалён', 'success');
            loadPlots();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    // ==========================================================
    // 5.1. Сценарии квестов
    // ==========================================================
    const scenariosList = $('scenarios-list');
    const scenarioModal = $('scenario-modal');
    const scenarioForm = $('scenario-form');
    const scenarioPrintModal = $('scenario-print-modal');
    const scenarioPlotSelect = $('scenario-plot-select');
    const scenarioStagesList = $('scenario-stages-list');
    const scenarioDurationInput = $('scenario-duration');

    let editingScenarioId = null;
    let scenariosLoaded = false;
    let scenarioFilter = 'all'; // 'all' | 'only-attrs' | 'only-mats'
    let scenarioBuilderMode = 'all'; // 'all' | 'only-attrs' | 'only-mats'
    let currentScenarioStages = []; // array of { plotId, note }

    // Фильтры сценариев на главной странице
    document.querySelectorAll('#scenario-filters .pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#scenario-filters .pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            scenarioFilter = btn.dataset.scenFilter || 'all';
            renderScenarios();
        });
    });

    // Режим комплектации в конструкторе сценария (Все вместе / Только атрибуты / Только материалы)
    document.querySelectorAll('#scenario-builder-mode-pills .pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#scenario-builder-mode-pills .pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            scenarioBuilderMode = btn.dataset.builderMode || 'all';
            const hintEl = $('scenario-builder-hint');
            if (hintEl) {
                if (scenarioBuilderMode === 'only-attrs') {
                    hintEl.textContent = 'Показываются сюжеты без расходных материалов. Квест можно провести только на многоразовом реквизите.';
                } else if (scenarioBuilderMode === 'only-mats') {
                    hintEl.textContent = 'Показываются сюжеты без атрибутов (только с расходными материалами или без инвентаря).';
                } else {
                    hintEl.textContent = 'Доступны все сюжеты. Можно сочетать многоразовый реквизит и расходные материалы.';
                }
            }
            populateScenarioPlotSelect();
            updateScenarioSummary();
        });
    });

    $('scenario-search')?.addEventListener('input', renderScenarios);
    $('add-scenario-btn')?.addEventListener('click', () => openScenarioModal());

    // Пресеты времени сценария
    document.querySelectorAll('#scenario-duration-presets [data-min]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (scenarioDurationInput) scenarioDurationInput.value = btn.dataset.min;
            updateScenarioSummary();
        });
    });
    scenarioDurationInput?.addEventListener('input', updateScenarioSummary);

    async function loadScenarios() {
        if (!scenariosLoaded) renderSkeleton(scenariosList);
        try {
            state.scenarios = await api('/api/scenarios');
            scenariosLoaded = true;
        } catch (err) {
            if (!scenariosLoaded) renderEmpty(scenariosList, { title: 'Не удалось загрузить', text: err.message });
            return;
        }
        updateCounts();
        renderScenarios();
    }

    // Вспомогательная функция для получения сюжета и его свойств
    function getPlotInfo(plotId) {
        const plot = state.plots.find(p => p._id === plotId);
        if (!plot) return null;
        const data = parseCanvasData(plot);
        const actualNodes = withActualActivities(data.nodes);
        const sched = computeSchedule(actualNodes, data.connections);

        // Актуализируем список активностей сюжета из БД и из нод на полотне
        const actMap = new Map();
        (plot.activities || []).forEach(a => {
            const actual = state.activities.find(sa => sa._id === a._id) || a;
            actMap.set(actual._id, actual);
        });
        actualNodes.forEach(n => {
            if (n.type === 'activity' && n.activityData) {
                const actual = state.activities.find(sa => sa._id === n.activityData._id) || n.activityData;
                actMap.set(actual._id, actual);
            }
        });
        const acts = Array.from(actMap.values());
        
        // Сбор реквизита сюжета с подсчётом требуемого количества в рамках данного сюжета
        const itemMap = new Map();
        acts.forEach(a => {
            (a.items || []).forEach(it => {
                if (!itemMap.has(it._id)) {
                    const dbItem = state.items.find(i => i._id === it._id) || it;
                    itemMap.set(it._id, {
                        _id: it._id,
                        name: dbItem.name || it.name,
                        type: dbItem.type || it.type || 'attribute',
                        inStock: dbItem.quantity != null ? dbItem.quantity : (it.quantity || 1),
                        neededInPlot: 0,
                        actTitles: []
                    });
                }
                const record = itemMap.get(it._id);
                record.neededInPlot += 1;
                if (a.title && !record.actTitles.includes(a.title)) {
                    record.actTitles.push(a.title);
                }
            });
        });
        const items = Array.from(itemMap.values());
        const attrs = items.filter(i => (i.type || 'attribute') === 'attribute');
        const mats = items.filter(i => i.type === 'material');

        return {
            plot,
            data,
            duration: sched.total || 0,
            activities: acts,
            items,
            attrs,
            mats,
            hasOnlyAttrs: mats.length === 0,
            hasOnlyMats: attrs.length === 0
        };
    }

    // Расчет сводной аналитики по сценарию (с учётом повторяющихся предметов)
    function computeScenarioDetails(stages) {
        let totalDuration = 0;
        const resolvedPlots = [];
        const allActs = [];
        const itemMap = new Map();

        stages.forEach((st, stageIdx) => {
            const info = getPlotInfo(st.plotId);
            if (!info) return;
            resolvedPlots.push({ stage: st, info, stageIndex: stageIdx });
            totalDuration += info.duration;

            info.activities.forEach(a => {
                if (!allActs.some(existing => existing._id === a._id)) {
                    allActs.push(a);
                }
            });

            info.items.forEach(it => {
                if (!itemMap.has(it._id)) {
                    const dbItem = state.items.find(i => i._id === it._id) || it;
                    itemMap.set(it._id, {
                        _id: it._id,
                        name: it.name,
                        type: it.type || 'attribute',
                        inStock: dbItem.quantity != null ? dbItem.quantity : (it.inStock != null ? it.inStock : 1),
                        needed: 0,
                        usedInPlots: [],
                        stagesUsed: []
                    });
                }
                const record = itemMap.get(it._id);
                record.needed += (it.neededInPlot || 1);
                if (!record.usedInPlots.includes(info.plot.title)) {
                    record.usedInPlots.push(info.plot.title);
                }
                record.stagesUsed.push(`Этап ${stageIdx + 1}`);
            });
        });

        const allItems = Array.from(itemMap.values());
        const allAttrs = allItems.filter(i => (i.type || 'attribute') === 'attribute');
        const allMats = allItems.filter(i => i.type === 'material');

        const totalAttrsNeeded = allAttrs.reduce((sum, it) => sum + it.needed, 0);
        const totalMatsNeeded = allMats.reduce((sum, it) => sum + it.needed, 0);

        const hasOnlyAttributes = allMats.length === 0;
        const hasOnlyMaterials = allAttrs.length === 0;
        const isMixed = allAttrs.length > 0 && allMats.length > 0;

        return {
            resolvedPlots,
            totalDuration,
            stagesCount: stages.length,
            activities: allActs,
            allItems,
            allAttrs,
            allMats,
            totalAttrsNeeded,
            totalMatsNeeded,
            hasOnlyAttributes,
            hasOnlyMaterials,
            isMixed
        };
    }

    function renderScenarios() {
        const query = $('scenario-search')?.value || '';

        if (state.scenarios.length === 0) {
            renderEmpty(scenariosList, {
                title: 'Сценариев пока нет',
                text: 'Сформируйте первый сценарий квеста, объединив готовые сюжеты в увлекательную цепочку.',
                actionLabel: '+ Создать сценарий',
                onAction: () => openScenarioModal()
            });
            return;
        }

        let filtered = state.scenarios.filter(sc => matches(query, sc.title, sc.description));

        if (scenarioFilter === 'only-attrs') {
            filtered = filtered.filter(sc => {
                let st = [];
                try { st = JSON.parse(sc.plotsData || '[]'); } catch (e) {}
                const d = computeScenarioDetails(st);
                return d.hasOnlyAttributes && d.allAttrs.length > 0;
            });
        } else if (scenarioFilter === 'only-mats') {
            filtered = filtered.filter(sc => {
                let st = [];
                try { st = JSON.parse(sc.plotsData || '[]'); } catch (e) {}
                const d = computeScenarioDetails(st);
                return d.hasOnlyMaterials && d.allMats.length > 0;
            });
        }

        if (filtered.length === 0) {
            renderEmpty(scenariosList, { title: 'Ничего не найдено', text: 'Попробуйте изменить поисковый запрос или фильтр.' });
            return;
        }

        scenariosList.innerHTML = filtered.map(sc => {
            let stages = [];
            try { stages = JSON.parse(sc.plotsData || '[]'); } catch (e) {}
            const details = computeScenarioDetails(stages);

            return `
                <article class="card">
                    <div class="card-body">
                        <div class="badge-row" style="margin-bottom: 8px;">
                            ${details.hasOnlyAttributes && details.allAttrs.length > 0
                                ? `<span class="badge badge-attribute">Только из атрибутов</span>`
                                : details.hasOnlyMaterials && details.allMats.length > 0
                                    ? `<span class="badge badge-material">Только из материалов</span>`
                                    : details.isMixed
                                        ? `<span class="badge badge-blue">Все вместе (смешанный)</span>`
                                        : `<span class="badge">Без реквизита</span>`}
                            <span class="badge badge-blue">Цель: ${formatDuration(sc.targetDuration)}</span>
                            <span class="badge badge-green">Расчет: ${formatDuration(details.totalDuration)}</span>
                        </div>
                        <h4 class="card-title">${escapeHtml(sc.title)}</h4>
                        ${sc.description ? `<p class="card-text">${escapeHtml(sc.description)}</p>` : ''}
                        
                        <div class="plot-duration">
                            <span class="card-label">Цепочка сюжетов (${stages.length} этапов)</span>
                        </div>
                        <div class="scenario-stages-timeline">
                            ${details.resolvedPlots.length
                                ? details.resolvedPlots.map((rp, idx) => `
                                    <span class="scenario-stage-pill">${idx + 1}. ${escapeHtml(rp.info.plot.title)} (${formatDuration(rp.info.duration)})</span>
                                    ${idx < details.resolvedPlots.length - 1 ? '<span class="scenario-stage-arrow">→</span>' : ''}
                                `).join('')
                                : '<span class="card-muted">Этапы не добавлены</span>'}
                        </div>

                        <div class="badge-row" style="margin-top: 10px;">
                            <span class="badge">${details.activities.length} ${plural(details.activities.length, ['активность', 'активности', 'активностей'])}</span>
                            <span class="badge badge-attribute">${details.totalAttrsNeeded > details.allAttrs.length ? `${details.allAttrs.length} атриб. (${details.totalAttrsNeeded} шт.)` : `${details.allAttrs.length} атрибутов`}</span>
                            <span class="badge badge-material">${details.totalMatsNeeded > details.allMats.length ? `${details.allMats.length} матер. (${details.totalMatsNeeded} шт.)` : `${details.allMats.length} материалов`}</span>
                        </div>
                    </div>
                    <div class="card-footer" style="flex-wrap: wrap; gap: 6px;">
                        <button type="button" class="btn btn-blue btn-sm" data-action="print" data-id="${sc._id}">Сохранить в PDF</button>
                        <button type="button" class="btn btn-light btn-sm" data-action="edit" data-id="${sc._id}">Изменить</button>
                        <span class="spacer"></span>
                        <button type="button" class="btn btn-outline-danger btn-sm" data-action="delete" data-id="${sc._id}">Удалить</button>
                    </div>
                </article>`;
        }).join('');
    }

    scenariosList?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const id = Number(btn.dataset.id);
        const sc = state.scenarios.find(s => s._id === id);
        if (!sc) return;

        if (btn.dataset.action === 'edit') openScenarioModal(sc);
        if (btn.dataset.action === 'print') openScenarioPrint(sc);
        if (btn.dataset.action === 'delete') deleteScenario(sc);
    });

    function populateScenarioPlotSelect() {
        if (!scenarioPlotSelect) return;
        scenarioPlotSelect.innerHTML = '<option value="">-- Выберите сюжет для добавления в сценарий --</option>';

        state.plots.forEach(plot => {
            const info = getPlotInfo(plot._id);
            if (!info) return;

            if (scenarioBuilderMode === 'only-attrs' && !info.hasOnlyAttrs) {
                return; // Сюжет требует расходные материалы, скрываем в режиме «Только из атрибутов»
            }
            if (scenarioBuilderMode === 'only-mats' && !info.hasOnlyMats) {
                return; // Сюжет требует многоразовые атрибуты, скрываем в режиме «Только из материалов»
            }

            const opt = document.createElement('option');
            opt.value = plot._id;

            let tag = '';
            if (info.hasOnlyAttrs && info.attrs.length > 0) tag = ' [только атрибуты]';
            else if (info.hasOnlyMats && info.mats.length > 0) tag = ' [только материалы]';
            else if (info.attrs.length > 0 && info.mats.length > 0) tag = ' [атрибуты + материалы]';
            else tag = ' [без реквизита]';

            opt.textContent = `${plot.title} (${formatDuration(info.duration)}, ${info.activities.length} акт.)${tag}`;
            scenarioPlotSelect.appendChild(opt);
        });
    }

    function renderScenarioStagesList() {
        if (!scenarioStagesList) return;
        if (currentScenarioStages.length === 0) {
            scenarioStagesList.innerHTML = '<div class="list-empty">В сценарии пока нет этапов. Выберите сюжет из списка выше и нажмите «+ Добавить сюжет».</div>';
            return;
        }

        scenarioStagesList.innerHTML = currentScenarioStages.map((st, idx) => {
            const info = getPlotInfo(st.plotId);
            const title = info ? info.plot.title : 'Неизвестный сюжет';
            const duration = info ? formatDuration(info.duration) : '? мин';
            
            let stagePropsBadge = '';
            if (info) {
                if (info.hasOnlyAttrs && info.attrs.length > 0) {
                    stagePropsBadge = `<span class="badge badge-attribute" title="Используются только атрибуты">только атрибуты (${info.attrs.length})</span>`;
                } else if (info.hasOnlyMats && info.mats.length > 0) {
                    stagePropsBadge = `<span class="badge badge-material" title="Используются только расходные материалы">только материалы (${info.mats.length})</span>`;
                } else if (info.attrs.length > 0 && info.mats.length > 0) {
                    stagePropsBadge = `<span class="badge badge-blue" title="Используются и атрибуты, и материалы">атрибуты + материалы</span>`;
                } else {
                    stagePropsBadge = `<span class="badge" title="Реквизит не требуется">без реквизита</span>`;
                }
            }

            return `
                <div class="stage-item-card" data-idx="${idx}">
                    <div class="stage-item-top">
                        <span class="stage-number-badge">Этап ${idx + 1}</span>
                        <strong class="stage-title">${escapeHtml(title)}</strong>
                        <span class="stage-duration">${duration}</span>
                        ${stagePropsBadge}
                        <div class="stage-item-actions">
                            <button type="button" class="stage-btn-icon" data-stage-action="up" title="Переместить выше" ${idx === 0 ? 'disabled' : ''}>↑</button>
                            <button type="button" class="stage-btn-icon" data-stage-action="down" title="Переместить ниже" ${idx === currentScenarioStages.length - 1 ? 'disabled' : ''}>↓</button>
                            <button type="button" class="stage-btn-icon" data-stage-action="delete" title="Удалить этап" style="color: #ef4444;">&times;</button>
                        </div>
                    </div>
                    <input type="text" class="stage-note-input" data-idx="${idx}" placeholder="Режиссерская заметка ведущему к этому этапу (реквизит, вводная фраза, подсказка)..." value="${escapeHtml(st.note || '')}">
                </div>`;
        }).join('');

        scenarioStagesList.querySelectorAll('.stage-note-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = Number(e.target.dataset.idx);
                if (currentScenarioStages[idx]) {
                    currentScenarioStages[idx].note = e.target.value;
                }
            });
        });
    }

    scenarioStagesList?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-stage-action]');
        if (!btn) return;
        const card = btn.closest('.stage-item-card');
        const idx = Number(card.dataset.idx);

        if (btn.dataset.stageAction === 'up' && idx > 0) {
            const tmp = currentScenarioStages[idx];
            currentScenarioStages[idx] = currentScenarioStages[idx - 1];
            currentScenarioStages[idx - 1] = tmp;
            renderScenarioStagesList();
            updateScenarioSummary();
        } else if (btn.dataset.stageAction === 'down' && idx < currentScenarioStages.length - 1) {
            const tmp = currentScenarioStages[idx];
            currentScenarioStages[idx] = currentScenarioStages[idx + 1];
            currentScenarioStages[idx + 1] = tmp;
            renderScenarioStagesList();
            updateScenarioSummary();
        } else if (btn.dataset.stageAction === 'delete') {
            currentScenarioStages.splice(idx, 1);
            renderScenarioStagesList();
            updateScenarioSummary();
        }
    });

    $('scenario-add-plot-btn')?.addEventListener('click', () => {
        const plotId = Number(scenarioPlotSelect.value);
        if (!plotId) {
            toast('Выберите сюжет для добавления', 'error');
            return;
        }
        currentScenarioStages.push({ plotId, note: '' });
        scenarioPlotSelect.value = '';
        renderScenarioStagesList();
        updateScenarioSummary();
    });

    function updateScenarioSummary() {
        const details = computeScenarioDetails(currentScenarioStages);
        const targetMin = Number(scenarioDurationInput.value) || 60;
        const totalMin = details.totalDuration;

        if ($('scenario-total-time')) $('scenario-total-time').textContent = formatDuration(totalMin);
        if ($('scenario-total-stages')) $('scenario-total-stages').textContent = details.stagesCount;
        if ($('scenario-total-acts')) $('scenario-total-acts').textContent = `${details.activities.length} ${plural(details.activities.length, ['активность', 'активности', 'активностей'])}`;

        // Счетчики атрибутов и материалов с учетом повторяющихся предметов
        const attrCountEl = $('scenario-attr-count');
        if (attrCountEl) {
            if (details.allAttrs.length === 0) {
                attrCountEl.textContent = '0 атрибутов';
            } else if (details.totalAttrsNeeded > details.allAttrs.length) {
                attrCountEl.textContent = `${details.allAttrs.length} ${plural(details.allAttrs.length, ['атрибут', 'атрибута', 'атрибутов'])} (${details.totalAttrsNeeded} шт.)`;
            } else {
                attrCountEl.textContent = `${details.totalAttrsNeeded} ${plural(details.totalAttrsNeeded, ['атрибут', 'атрибута', 'атрибутов'])}`;
            }
        }

        const matCountEl = $('scenario-mat-count');
        if (matCountEl) {
            if (details.allMats.length === 0) {
                matCountEl.textContent = '0 материалов';
            } else if (details.totalMatsNeeded > details.allMats.length) {
                matCountEl.textContent = `${details.allMats.length} ${plural(details.allMats.length, ['материал', 'материала', 'материалов'])} (${details.totalMatsNeeded} шт.)`;
            } else {
                matCountEl.textContent = `${details.totalMatsNeeded} ${plural(details.totalMatsNeeded, ['материал', 'материала', 'материалов'])}`;
            }
        }

        const diffEl = $('scenario-time-diff');
        if (diffEl) {
            const diff = totalMin - targetMin;
            if (diff > 0) {
                diffEl.textContent = `+${diff} мин (превышение цели)`;
                diffEl.className = 'summary-sub time-warn';
            } else if (diff < 0) {
                diffEl.textContent = `${diff} мин (меньше целевого)`;
                diffEl.className = 'summary-sub';
            } else {
                diffEl.textContent = 'Идеально совпадает с целью';
                diffEl.className = 'summary-sub time-good';
            }
        }

        // Чек-лист предметов и предупреждения
        const checklist = $('scenario-items-checklist');
        if (checklist) {
            let conflictBanner = '';
            if (scenarioBuilderMode === 'only-attrs' && details.allMats.length > 0) {
                conflictBanner = `<div class="server-banner" style="margin-bottom: 8px;"><strong>Несоответствие режиму:</strong> в сценарии используются расходные материалы (${details.allMats.map(m => m.name).join(', ')}). Удалите эти этапы, чтобы квест был строго только из атрибутов.</div>`;
            } else if (scenarioBuilderMode === 'only-mats' && details.allAttrs.length > 0) {
                conflictBanner = `<div class="server-banner" style="margin-bottom: 8px;"><strong>Несоответствие режиму:</strong> в сценарии используются многоразовые атрибуты (${details.allAttrs.map(a => a.name).join(', ')}). Удалите эти этапы, чтобы квест был строго только из материалов.</div>`;
            }

            if (details.allItems.length === 0) {
                checklist.innerHTML = conflictBanner + '<div class="card-muted" style="font-size: 13px;">Для выбранных сюжетов реквизит не требуется.</div>';
            } else {
                checklist.innerHTML = `
                    ${conflictBanner}
                    <div class="checklist-title">Сводная ведомость реквизита сценария (с учётом повторений):</div>
                    ${details.allAttrs.length ? `
                        <div class="checklist-section-title">Многоразовые атрибуты (${details.allAttrs.length} наим., суммарно ${details.totalAttrsNeeded} шт.)</div>
                        ${details.allAttrs.map(it => `
                            <div class="checklist-row ${it.needed > it.inStock ? 'checklist-row-shortage' : ''}">
                                <div class="checklist-item-info">
                                    <span><strong>${escapeHtml(it.name)}</strong></span>
                                    <div class="checklist-item-meta">
                                        ${it.usedInPlots.length > 1
                                            ? `<span class="badge badge-warning">Повторяется в ${it.usedInPlots.length} сюжетах</span>`
                                            : ''}
                                        <small class="card-muted">В сюжетах: ${escapeHtml(it.usedInPlots.join(', '))}</small>
                                    </div>
                                </div>
                                <div class="checklist-item-stock">
                                    <span class="badge badge-attribute">Требуется: ${it.needed} шт. / В наличии: ${it.inStock} шт.</span>
                                    ${it.needed > it.inStock ? `<span class="stock-shortage-label">Не хватает: ${it.needed - it.inStock} шт.</span>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    ` : ''}
                    ${details.allMats.length ? `
                        <div class="checklist-section-title" style="margin-top: 10px;">Расходные материалы (${details.allMats.length} наим., суммарно ${details.totalMatsNeeded} шт.)</div>
                        ${details.allMats.map(it => `
                            <div class="checklist-row ${it.needed > it.inStock ? 'checklist-row-shortage' : ''}">
                                <div class="checklist-item-info">
                                    <span><strong>${escapeHtml(it.name)}</strong></span>
                                    <div class="checklist-item-meta">
                                        ${it.usedInPlots.length > 1
                                            ? `<span class="badge badge-warning">Повторяется в ${it.usedInPlots.length} сюжетах</span>`
                                            : ''}
                                        <small class="card-muted">В сюжетах: ${escapeHtml(it.usedInPlots.join(', '))}</small>
                                    </div>
                                </div>
                                <div class="checklist-item-stock">
                                    <span class="badge badge-material">Требуется: ${it.needed} шт. / В наличии: ${it.inStock} шт.</span>
                                    ${it.needed > it.inStock ? `<span class="stock-shortage-label">Не хватает: ${it.needed - it.inStock} шт.</span>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    ` : ''}
                `;
            }
        }
    }

    async function openScenarioModal(sc = null) {
        editingScenarioId = sc ? sc._id : null;
        scenarioForm.reset();
        $('scenario-modal-title').textContent = sc ? 'Редактирование сценария квеста' : 'Новый сценарий квеста';
        $('scenario-title').value = sc?.title || '';
        $('scenario-desc').value = sc?.description || '';
        scenarioDurationInput.value = sc?.targetDuration || 60;

        currentScenarioStages = [];
        if (sc && sc.plotsData) {
            try { currentScenarioStages = JSON.parse(sc.plotsData); } catch (e) {}
        }

        // Авто-определение режима комплектации
        scenarioBuilderMode = 'all';
        if (sc && currentScenarioStages.length > 0) {
            const d = computeScenarioDetails(currentScenarioStages);
            if (d.hasOnlyAttributes && d.allAttrs.length > 0) scenarioBuilderMode = 'only-attrs';
            else if (d.hasOnlyMaterials && d.allMats.length > 0) scenarioBuilderMode = 'only-mats';
        }
        document.querySelectorAll('#scenario-builder-mode-pills .pill-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.builderMode === scenarioBuilderMode);
        });
        const hintEl = $('scenario-builder-hint');
        if (hintEl) {
            if (scenarioBuilderMode === 'only-attrs') {
                hintEl.textContent = 'Показываются сюжеты без расходных материалов. Квест можно провести только на многоразовом реквизите.';
            } else if (scenarioBuilderMode === 'only-mats') {
                hintEl.textContent = 'Показываются сюжеты без атрибутов (только с расходными материалами или без инвентаря).';
            } else {
                hintEl.textContent = 'Доступны все сюжеты. Можно сочетать многоразовый реквизит и расходные материалы.';
            }
        }

        populateScenarioPlotSelect();
        renderScenarioStagesList();
        updateScenarioSummary();
        openModal(scenarioModal);

        try {
            await Promise.all([loadPlots(), loadItems(), loadActivities()]);
            populateScenarioPlotSelect();
            renderScenarioStagesList();
            updateScenarioSummary();
        } catch (e) {}
    }

    scenarioForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const submitBtn = scenarioForm.querySelector('[type="submit"]');
        withBusy(submitBtn, async () => {
            const title = $('scenario-title').value.trim();
            if (!title) {
                toast('Введите название сценария', 'error');
                return;
            }
            if (currentScenarioStages.length === 0) {
                toast('Добавьте хотя бы один сюжет в сценарий', 'error');
                return;
            }

            const payload = {
                title,
                description: $('scenario-desc').value.trim(),
                targetDuration: Math.round(Number(scenarioDurationInput.value) || 60),
                plotsData: JSON.stringify(currentScenarioStages)
            };

            const isEdit = editingScenarioId !== null;
            try {
                await api(isEdit ? `/api/scenarios/${editingScenarioId}` : '/api/scenarios', {
                    method: isEdit ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                closeModal(scenarioModal);
                toast(isEdit ? 'Сценарий обновлён' : 'Сценарий сохранён', 'success');
                await loadScenarios();
            } catch (err) {
                toast(err.message, 'error');
            }
        })();
    });

    async function deleteScenario(sc) {
        const ok = await confirmDialog({
            title: 'Удалить сценарий?',
            text: `Сценарий «${sc.title}» будет удалён. (Сюжеты и активности сохранятся в базе).`
        });
        if (!ok) return;
        try {
            await api(`/api/scenarios/${sc._id}`, { method: 'DELETE' });
            toast('Сценарий удалён', 'success');
            loadScenarios();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    // ==========================================================
    // 5.2. Сохранение сценария в PDF / Печать плана
    // ==========================================================
    function openScenarioPrint(sc) {
        let stages = [];
        try { stages = JSON.parse(sc.plotsData || '[]'); } catch (e) {}
        const details = computeScenarioDetails(stages);
        const printContent = $('scenario-print-content');

        printContent.innerHTML = `
            <div class="print-header-brand">
                <img src="img/mospolytech-logo.jpg" alt="Московский политех" class="print-logo">
                <div class="print-title-area">
                    <h2>МОСКОВСКИЙ ПОЛИТЕХНИЧЕСКИЙ УНИВЕРСИТЕТ</h2>
                    <div class="print-subtitle">Конструктор квестов — Паспорт и регламент проведения мероприятия</div>
                </div>
            </div>

            <div class="print-info-card">
                <div class="print-info-title">Сценарий: «${escapeHtml(sc.title)}»</div>
                ${sc.description ? `<div class="print-info-desc"><strong>Легенда и описание:</strong> ${escapeHtml(sc.description)}</div>` : ''}
                <div class="print-meta-grid">
                    <div class="print-meta-item">
                        <span class="print-meta-label">Целевое время</span>
                        <span class="print-meta-val">${formatDuration(sc.targetDuration)}</span>
                    </div>
                    <div class="print-meta-item">
                        <span class="print-meta-label">Расчетное время</span>
                        <span class="print-meta-val">${formatDuration(details.totalDuration)}</span>
                    </div>
                    <div class="print-meta-item">
                        <span class="print-meta-label">Этапов / Активностей</span>
                        <span class="print-meta-val">${stages.length} эт. / ${details.activities.length} акт.</span>
                    </div>
                    <div class="print-meta-item">
                        <span class="print-meta-label">Инвентарь</span>
                        <span class="print-meta-val">${details.hasOnlyAttributes && details.allAttrs.length > 0 ? 'Только атрибуты' : details.hasOnlyMaterials && details.allMats.length > 0 ? 'Только материалы' : details.isMixed ? 'Атрибуты и материалы' : 'Без реквизита'}</span>
                    </div>
                </div>
            </div>

            <div class="print-section-heading">1. Ведомость необходимого реквизита и материалов</div>
            <div class="print-section-desc">Чек-лист для коменданта и ответственных за инвентарь перед началом мероприятия</div>
            <table class="print-table">
                <thead>
                    <tr>
                        <th style="width: 36px;">№</th>
                        <th>Наименование реквизита</th>
                        <th style="width: 140px;">Категория</th>
                        <th style="width: 90px;">Требуется</th>
                        <th style="width: 90px;">В наличии</th>
                        <th>Используется в сюжетах</th>
                        <th style="width: 80px; text-align: center;">Отметка</th>
                    </tr>
                </thead>
                <tbody>
                    ${details.allItems.length ? details.allItems.map((it, idx) => `
                        <tr>
                            <td>${idx + 1}</td>
                            <td><strong>${escapeHtml(it.name)}</strong></td>
                            <td>${(it.type === 'material') ? 'Расходный материал' : 'Многоразовый атрибут'}</td>
                            <td><strong>${it.needed} шт.</strong>${it.usedInPlots.length > 1 ? ' <small style="color:#64748b;">(повтор)</small>' : ''}</td>
                            <td>${it.inStock} шт.</td>
                            <td>${escapeHtml(it.usedInPlots.join(', '))}</td>
                            <td style="text-align: center;">[ &nbsp; ]</td>
                        </tr>
                    `).join('') : '<tr><td colspan="7" style="text-align:center; color: #64748b;">Реквизит не требуется</td></tr>'}
                </tbody>
            </table>

            <div class="print-section-heading">2. Поэтапный регламент прохождения квеста</div>
            <div class="print-section-desc">Порядок этапов и инструкции для ведущих, игротехников и модераторов станций</div>
            <table class="print-table">
                <thead>
                    <tr>
                        <th style="width: 44px;">Этап</th>
                        <th style="width: 170px;">Сюжет / Станция</th>
                        <th style="width: 85px;">Время</th>
                        <th>Задания и активности</th>
                        <th>Инструкции и реплики ведущего</th>
                        <th style="width: 150px;">Реквизит на этапе</th>
                    </tr>
                </thead>
                <tbody>
                    ${details.resolvedPlots.map((rp, idx) => `
                        <tr>
                            <td><strong>№ ${idx + 1}</strong></td>
                            <td><strong>${escapeHtml(rp.info.plot.title)}</strong></td>
                            <td>${formatDuration(rp.info.duration)}</td>
                            <td>
                                ${(rp.info.activities || []).map(a => `• <strong>${escapeHtml(a.title)}</strong> (${a.durationMinutes} мин)`).join('<br>') || 'Сюжетный текст'}
                            </td>
                            <td>${escapeHtml(rp.stage.note || '—')}</td>
                            <td>
                                ${(rp.info.items || []).map(i => escapeHtml(i.name)).join('<br>') || '—'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="print-sign-row">
                <div>Ответственный организатор: _____________________ / _____________________ /</div>
                <div>Дата проведения: «____» ____________ 202__ г.</div>
            </div>
        `;

        openModal(scenarioPrintModal);
    }

    $('scenario-print-btn')?.addEventListener('click', () => {
        window.print();
    });

    // ==========================================================
    // 6. Горячие клавиши и запуск
    // ==========================================================
    document.addEventListener('keydown', (e) => {
        const isTyping = e.target.closest?.('input, textarea, select, [contenteditable]');
        const openModals = document.querySelectorAll('.modal-overlay.open');

        if (e.key === 'Escape') {
            if (openModals.length) requestClose(openModals[openModals.length - 1]);
            else if (isConnectMode) resetConnectMode();
            else deselectConnection();
        }

        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedConnectionId && !isTyping && !openModals.length) {
            e.preventDefault();
            deleteConnection(selectedConnectionId);
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && $('section-1').classList.contains('active')) {
            e.preventDefault();
            if (!document.querySelector('.modal-overlay.open')) openSavePlotModal();
        }
    });

    $('server-retry').addEventListener('click', loadAll);

    function loadAll() {
        return Promise.all([loadItems(), loadActivities(), loadPlots(), loadScenarios()]);
    }

    renderCanvas();
    loadAll();
});
