document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================
    // 1. Переключение отделов (вкладок)
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
                } else {
                    section.classList.remove('active');
                }
            });
        });
    });

    // ==========================================================
    // 2. Интерактивное полотно (Отдел 1)
    // ==========================================================
    const canvas = document.getElementById('canvas');
    const addBlockBtn = document.getElementById('add-block-btn');
    let zIndexCounter = 1;

    if (addBlockBtn) {
        addBlockBtn.addEventListener('click', createBlock);
    }

    function createBlock() {
        const block = document.createElement('div');
        block.className = 'text-block';
        
        const x = Math.random() * 200 + 50;
        const y = Math.random() * 200 + 80;
        block.style.left = `${x}px`;
        block.style.top = `${y}px`;
        block.style.zIndex = zIndexCounter++;

        const header = document.createElement('div');
        header.className = 'text-block-header';
        
        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.onclick = () => block.remove();

        header.appendChild(deleteBtn);
        
        const textarea = document.createElement('textarea');
        textarea.className = 'text-block-content';
        textarea.placeholder = 'Введите текст сюжета...';

        block.appendChild(header);
        block.appendChild(textarea);
        canvas.appendChild(block);

        makeDraggable(block, header);
    }

    function makeDraggable(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        handle.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();
            element.style.zIndex = zIndexCounter++;
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
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    // ==========================================================
    // 3. Отдел 3: Атрибуты и работы с API (FormData для файлов)
    // ==========================================================
    const addAttrBtn = document.getElementById('add-attr-btn');
    const modalOverlay = document.getElementById('attr-modal');
    const cancelBtn = document.getElementById('cancel-btn');
    const attrForm = document.getElementById('attr-form');
    const attributesList = document.getElementById('attributes-list');

    if (addAttrBtn) {
        addAttrBtn.addEventListener('click', () => {
            modalOverlay.style.display = 'flex';
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
    }

    // Сохранение формы с файлом в формате multipart/form-data
    if (attrForm) {
        attrForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData();
            const photoInput = document.getElementById('attr-photo');

            if (photoInput.files[0]) {
                formData.append('photo', photoInput.files[0]);
            }

            formData.append('name', document.getElementById('attr-name').value);
            formData.append('quantity', document.getElementById('attr-quantity').value || 1);
            formData.append('description', document.getElementById('attr-desc').value);
            formData.append('note', document.getElementById('attr-note').value);

            try {
                const response = await fetch('/api/items', {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    closeModal();
                    loadAttributes();
                } else {
                    const err = await response.json();
                    alert('Ошибка сохранения: ' + err.error);
                }
            } catch (error) {
                console.error('Ошибка запроса:', error);
                alert('Не удалось связаться с сервером');
            }
        });
    }

    function closeModal() {
        modalOverlay.style.display = 'none';
        attrForm.reset();
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
                    <button class="btn btn-danger btn-sm" onclick="deleteAttribute('${item._id}')">Удалить</button>
                `;
                attributesList.appendChild(card);
            });
        } catch (error) {
            console.error('Ошибка загрузки атрибутов:', error);
        }
    }

    window.deleteAttribute = async (id) => {
        if (!confirm('Вы уверены, что хотите удалить этот атрибут?')) return;

        try {
            const response = await fetch(`/api/items/${id}`, { method: 'DELETE' });
            if (response.ok) {
                loadAttributes();
            }
        } catch (error) {
            console.error('Ошибка при удалении:', error);
        }
    };

    loadAttributes();
});