document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================
    // 1. Переключение отделов
    // ==========================================================
    const navButtons = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.section-content');

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            sections.forEach(section => {
                if (section.id === targetTab) {
                    section.classList.add('active');
                    if (targetTab === 'section-4') loadPlots();
                } else {
                    section.classList.remove('active');
                }
            });
        });
    });

    // ==========================================================
    // 2. ИНТЕРАКТИВНОЕ ПОЛОТНО (Отдел 1)
    // ==========================================================
    const canvas = document.getElementById('canvas');
    const svgOverlay = document.getElementById('canvas-svg');
    const addBlockBtn = document.getElementById('add-block-btn');
    const addActCanvasBtn = document.getElementById('add-act-canvas-btn');
    const connectModeBtn = document.getElementById('connect-mode-btn');
    const clearCanvasBtn = document.getElementById('clear-canvas-btn');
    const savePlotBtn = document.getElementById('save-plot-btn');

    const selectActModal = document.getElementById('select-act-modal');
    const selectActCancel = document.getElementById('select-act-cancel');
    const canvasActList = document.getElementById('canvas-act-list');

    const savePlotModal = document.getElementById('save-plot-modal');
    const savePlotCancel = document.getElementById('save-plot-cancel');
    const savePlotForm = document.getElementById('save-plot-form');

    let zIndexCounter = 10;
    let nodes = [];          // [{ id, type, x, y, content, activityData }]
    let connections = [];    // [{ id, fromId, toId }]
    
    let isConnectMode = false;
    let selectedSourceNodeId = null;

    // Кнопка переключения режима связывания
    connectModeBtn.addEventListener('click', () => {
        isConnectMode = !isConnectMode;
        if (isConnectMode) {
            connectModeBtn.classList.add('active');
            connectModeBtn.innerText = '🔗 Выберите 2 блока...';
        } else {
            resetConnectMode();
        }
    });

    function resetConnectMode() {
        isConnectMode = false;
        selectedSourceNodeId = null;
        connectModeBtn.classList.remove('active');
        connectModeBtn.innerText = '🔗 Связать блоки';
        document.querySelectorAll('.canvas-node').forEach(el => el.classList.remove('connecting-source'));
    }

    // Очистить полотно
    clearCanvasBtn.addEventListener('click', () => {
        if (confirm('Очистить весь холст?')) {
            nodes = [];
            connections = [];
            renderCanvas();
        }
    });

    // Добавить текстовый блок
    addBlockBtn.addEventListener('click', () => {
        const nodeId = 'node-' + Date.now();
        nodes.push({
            id: nodeId,
            type: 'text',
            x: Math.random() * 200 + 50,
            y: Math.random() * 200 + 80,
            content: ''
        });
        renderCanvas();
    });

    // Добавить активность на холст
    addActCanvasBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/activities');
            const activities = await res.json();
            canvasActList.innerHTML = '';

            if (activities.length === 0) {
                canvasActList.innerHTML = '<p>Сначала создайте активности во 2-м отделе.</p>';
            } else {
                activities.forEach(act => {
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-secondary act-select-card';
                    btn.innerHTML = `<strong>${act.title}</strong><br><small>⏱ ${act.durationMinutes} мин.</small>`;
                    btn.onclick = () => {
                        const nodeId = 'node-' + Date.now();
                        nodes.push({
                            id: nodeId,
                            type: 'activity',
                            x: Math.random() * 200 + 50,
                            y: Math.random() * 200 + 80,
                            activityData: act
                        });
                        selectActModal.style.display = 'none';
                        renderCanvas();
                    };
                    canvasActList.appendChild(btn);
                });
            }
            selectActModal.style.display = 'flex';
        } catch (err) {
            console.error(err);
        }
    });

    selectActCancel.onclick = () => selectActModal.style.display = 'none';

    // РЕНДЕР ПОЛОТНА
    function renderCanvas() {
        // Очистка старых DOM-элементов нод (кроме SVG)
        const oldNodes = canvas.querySelectorAll('.canvas-node');
        oldNodes.forEach(n => n.remove());

        nodes.forEach(node => {
            const el = document.createElement('div');
            el.className = `canvas-node ${node.type === 'activity' ? 'canvas-node-activity' : 'canvas-node-text'}`;
            el.id = node.id;
            el.style.left = `${node.x}px`;
            el.style.top = `${node.y}px`;
            el.style.zIndex = zIndexCounter++;

            const header = document.createElement('div');
            header.className = 'canvas-node-header';
            
            const titleSpan = document.createElement('span');
            titleSpan.className = 'node-title';
            titleSpan.innerText = node.type === 'activity' ? `⚡ ${node.activityData.title}` : '📝 Текст';

            const deleteBtn = document.createElement('span');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteNode(node.id);
            };

            header.appendChild(titleSpan);
            header.appendChild(deleteBtn);
            el.appendChild(header);

            if (node.type === 'text') {
                const textarea = document.createElement('textarea');
                textarea.className = 'text-block-content';
                textarea.placeholder = 'Введите текст сюжета...';
                textarea.value = node.content || '';
                textarea.oninput = (e) => { node.content = e.target.value; };
                el.appendChild(textarea);
            } else if (node.type === 'activity') {
                const body = document.createElement('div');
                body.className = 'canvas-node-body';
                const itemsStr = node.activityData.items?.map(i => i.name).join(', ') || 'нет';
                body.innerHTML = `
                    <p><small>⏱ ${node.activityData.durationMinutes} мин.</small></p>
                    <p><small>🎒 Предметы: ${itemsStr}</small></p>
                `;
                el.appendChild(body);
            }

            // Клик для связывания
            el.onclick = (e) => {
                if (!isConnectMode) return;
                e.stopPropagation();

                if (!selectedSourceNodeId) {
                    selectedSourceNodeId = node.id;
                    el.classList.add('connecting-source');
                } else if (selectedSourceNodeId !== node.id) {
                    // Создаем связь
                    connections.push({
                        id: 'conn-' + Date.now(),
                        fromId: selectedSourceNodeId,
                        toId: node.id
                    });
                    resetConnectMode();
                    updateLines();
                }
            };

            canvas.appendChild(el);
            makeDraggable(el, header, node);
        });

        updateLines();
    }

    function deleteNode(id) {
        nodes = nodes.filter(n => n.id !== id);
        connections = connections.filter(c => c.fromId !== id && c.toId !== id);
        renderCanvas();
    }

    // Перетаскивание блоков
    function makeDraggable(element, handle, nodeData) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        handle.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            if (isConnectMode) return;
            e.preventDefault();
            element.style.zIndex = ++zIndexCounter;
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            const newY = element.offsetTop - pos2;
            const newX = element.offsetLeft - pos1;

            element.style.top = `${newY}px`;
            element.style.left = `${newX}px`;

            nodeData.x = newX;
            nodeData.y = newY;

            updateLines();
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    // Отрисовка линий связей (SVG)
    function updateLines() {
        svgOverlay.innerHTML = '';

        connections.forEach(conn => {
            const fromEl = document.getElementById(conn.fromId);
            const toEl = document.getElementById(conn.toId);

            if (!fromEl || !toEl) return;

            const x1 = fromEl.offsetLeft + fromEl.offsetWidth / 2;
            const y1 = fromEl.offsetTop + fromEl.offsetHeight / 2;
            const x2 = toEl.offsetLeft + toEl.offsetWidth / 2;
            const y2 = toEl.offsetTop + toEl.offsetHeight / 2;

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.setAttribute('class', 'connection-line');

            // Удаление линии по двойному клику
            line.ondblclick = () => {
                connections = connections.filter(c => c.id !== conn.id);
                updateLines();
            };

            svgOverlay.appendChild(line);
        });
    }

    // СОХРАНЕНИЕ СЮЖЕТА
    savePlotBtn.addEventListener('click', () => {
        if (nodes.length === 0) {
            alert('Полотно пустое!');
            return;
        }
        savePlotModal.style.display = 'flex';
    });

    savePlotCancel.onclick = () => savePlotModal.style.display = 'none';

    savePlotForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('plot-title').value;
        const description = document.getElementById('plot-desc').value;

        // Извлекаем уникальные ID активностей на холсте
        const activityIds = [...new Set(
            nodes.filter(n => n.type === 'activity').map(n => n.activityData._id)
        )];

        const canvasDataStr = JSON.stringify({ nodes, connections });

        try {
            const res = await fetch('/api/plots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description, canvasData: canvasDataStr, activityIds })
            });

            if (res.ok) {
                alert('Сюжет успешно сохранен!');
                savePlotModal.style.display = 'none';
                savePlotForm.reset();
            } else {
                alert('Ошибка сохранения сюжета');
            }
        } catch (err) {
            console.error(err);
        }
    });

    // ==========================================================
    // 3. Отдел 2: Активности
    // ==========================================================
    const addActBtn = document.getElementById('add-act-btn');
    const actModal = document.getElementById('act-modal');
    const actCancelBtn = document.getElementById('act-cancel-btn');
    const actForm = document.getElementById('act-form');
    const activitiesList = document.getElementById('activities-list');
    const actItemsSelect = document.getElementById('act-items-select');

    if (addActBtn) {
        addActBtn.addEventListener('click', async () => {
            await populateItemsCheckboxList();
            actModal.style.display = 'flex';
        });
    }

    if (actCancelBtn) {
        actCancelBtn.addEventListener('click', () => {
            actModal.style.display = 'none';
            actForm.reset();
        });
    }

    async function populateItemsCheckboxList() {
        try {
            const response = await fetch('/api/items');
            const items = await response.json();
            actItemsSelect.innerHTML = '';

            if (items.length === 0) {
                actItemsSelect.innerHTML = '<small style="color: #888;">Нет созданных атрибутов</small>';
                return;
            }

            items.forEach(item => {
                const label = document.createElement('label');
                label.className = 'checkbox-item';
                label.innerHTML = `
                    <input type="checkbox" value="${item._id}">
                    <span>${item.name} (${item.quantity} шт.)</span>
                `;
                actItemsSelect.appendChild(label);
            });
        } catch (err) {
            console.error(err);
        }
    }

    if (actForm) {
        actForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const selectedItems = Array.from(
                actItemsSelect.querySelectorAll('input[type="checkbox"]:checked')
            ).map(cb => Number(cb.value));

            const payload = {
                title: document.getElementById('act-title').value,
                durationMinutes: Number(document.getElementById('act-duration').value) || 0,
                description: document.getElementById('act-desc').value,
                items: selectedItems
            };

            try {
                const response = await fetch('/api/activities', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    actModal.style.display = 'none';
                    actForm.reset();
                    loadActivities();
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    async function loadActivities() {
        try {
            const response = await fetch('/api/activities');
            const activities = await response.json();
            activitiesList.innerHTML = '';

            activities.forEach(act => {
                const card = document.createElement('div');
                card.className = 'attr-card';
                const itemsBadgeHtml = act.items && act.items.length > 0
                    ? `<div class="items-tags">${act.items.map(i => `<span class="item-tag">${i.name}</span>`).join('')}</div>`
                    : '<p><small>Предметы не требуются</small></p>';

                card.innerHTML = `
                    <h4>${act.title}</h4>
                    <p><strong>⏱ Время:</strong> ${act.durationMinutes} мин.</p>
                    ${act.description ? `<p>${act.description}</p>` : ''}
                    <div class="act-items-container">
                        <strong>Предметы:</strong>
                        ${itemsBadgeHtml}
                    </div>
                    <button class="btn btn-danger btn-sm" onclick="deleteActivity(${act._id})">Удалить</button>
                `;
                activitiesList.appendChild(card);
            });
        } catch (err) {
            console.error(err);
        }
    }

    window.deleteActivity = async (id) => {
        if (!confirm('Удалить эту активность?')) return;
        try {
            const res = await fetch(`/api/activities/${id}`, { method: 'DELETE' });
            if (res.ok) loadActivities();
        } catch (err) {
            console.error(err);
        }
    };

    // ==========================================================
    // 4. Отдел 3: Атрибуты и материалы
    // ==========================================================
    const addAttrBtn = document.getElementById('add-attr-btn');
    const modalOverlay = document.getElementById('attr-modal');
    const cancelBtn = document.getElementById('cancel-btn');
    const attrForm = document.getElementById('attr-form');
    const attributesList = document.getElementById('attributes-list');

    if (addAttrBtn) addAttrBtn.onclick = () => modalOverlay.style.display = 'flex';
    if (cancelBtn) cancelBtn.onclick = () => { modalOverlay.style.display = 'none'; attrForm.reset(); };

    if (attrForm) {
        attrForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData();
            const photoInput = document.getElementById('attr-photo');

            if (photoInput.files[0]) formData.append('photo', photoInput.files[0]);
            formData.append('name', document.getElementById('attr-name').value);
            formData.append('quantity', document.getElementById('attr-quantity').value || 1);
            formData.append('description', document.getElementById('attr-desc').value);
            formData.append('note', document.getElementById('attr-note').value);

            try {
                const response = await fetch('/api/items', { method: 'POST', body: formData });
                if (response.ok) {
                    modalOverlay.style.display = 'none';
                    attrForm.reset();
                    loadAttributes();
                }
            } catch (error) {
                console.error(error);
            }
        });
    }

    async function loadAttributes() {
        try {
            const response = await fetch('/api/items');
            const items = await response.json();
            attributesList.innerHTML = '';

            items.forEach(item => {
                const card = document.createElement('div');
                card.className = 'attr-card';
                card.innerHTML = `
                    ${item.photoUrl ? `<img src="${item.photoUrl}" alt="${item.name}" class="attr-img">` : ''}
                    <h4>${item.name}</h4>
                    <p><strong>Количество:</strong> ${item.quantity}</p>
                    ${item.description ? `<p>${item.description}</p>` : ''}
                    ${item.note ? `<small><em>Заметка: ${item.note}</em></small>` : ''}
                    <button class="btn btn-danger btn-sm" onclick="deleteAttribute(${item._id})">Удалить</button>
                `;
                attributesList.appendChild(card);
            });
        } catch (error) {
            console.error(error);
        }
    }

    window.deleteAttribute = async (id) => {
        if (!confirm('Удалить этот атрибут?')) return;
        try {
            const response = await fetch(`/api/items/${id}`, { method: 'DELETE' });
            if (response.ok) loadAttributes();
        } catch (error) {
            console.error(error);
        }
    };

    // ==========================================================
    // 5. Отдел 4: Готовые сюжеты
    // ==========================================================
    const plotsList = document.getElementById('plots-list');

    async function loadPlots() {
        try {
            const res = await fetch('/api/plots');
            const plots = await res.json();
            plotsList.innerHTML = '';

            if (plots.length === 0) {
                plotsList.innerHTML = '<p>Нет сохраненных сюжетов</p>';
                return;
            }

            plots.forEach(plot => {
                const card = document.createElement('div');
                card.className = 'attr-card';
                
                const actsHtml = plot.activities?.length > 0 
                    ? `<div class="items-tags">${plot.activities.map(a => `<span class="item-tag">${a.title}</span>`).join('')}</div>`
                    : '<p><small>Нет связанных активностей</small></p>';

                card.innerHTML = `
                    <h4>${plot.title}</h4>
                    ${plot.description ? `<p>${plot.description}</p>` : ''}
                    <div>
                        <strong>Включенные активности:</strong>
                        ${actsHtml}
                    </div>
                    <div style="margin-top: 10px; display: flex; gap: 8px;">
                        <button class="btn btn-primary btn-sm" onclick="loadPlotToCanvas('${encodeURIComponent(JSON.stringify(plot))}')">Загрузить на полотно</button>
                        <button class="btn btn-danger btn-sm" onclick="deletePlot(${plot._id})">Удалить</button>
                    </div>
                `;
                plotsList.appendChild(card);
            });
        } catch (err) {
            console.error(err);
        }
    }

    window.loadPlotToCanvas = (plotDataJson) => {
        const plot = JSON.parse(decodeURIComponent(plotDataJson));
        if (plot.canvasData) {
            try {
                const parsed = JSON.parse(plot.canvasData);
                nodes = parsed.nodes || [];
                connections = parsed.connections || [];
                
                // Переключаемся на первую вкладку
                document.querySelector('[data-tab="section-1"]').click();
                renderCanvas();
            } catch (err) {
                alert('Ошибка формата данных холста');
            }
        }
    };

    window.deletePlot = async (id) => {
        if (!confirm('Удалить данный сюжет?')) return;
        try {
            const res = await fetch(`/api/plots/${id}`, { method: 'DELETE' });
            if (res.ok) loadPlots();
        } catch (err) {
            console.error(err);
        }
    };

    // Старт
    loadAttributes();
    loadActivities();
});