document.addEventListener('DOMContentLoaded', () => {
    // === Логика переключения отделов (вкладок) ===
    const navButtons = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.section-content');

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');

            // Переключаем активную кнопку
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Переключаем видимость отделов
            sections.forEach(section => {
                if (section.id === targetTab) {
                    section.classList.add('active');
                } else {
                    section.classList.remove('active');
                }
            });
        });
    });

    // === Логика работы с полотном (Отдел 1) ===
    const canvas = document.getElementById('canvas');
    const addBtn = document.getElementById('add-block-btn');

    let zIndexCounter = 1;

    if (addBtn) {
        addBtn.addEventListener('click', createBlock);
    }

    function createBlock() {
        // Создаем основной контейнер блока
        const block = document.createElement('div');
        block.className = 'text-block';
        
        // Случайные начальные координаты появления
        const x = Math.random() * 200 + 50;
        const y = Math.random() * 200 + 80;
        block.style.left = `${x}px`;
        block.style.top = `${y}px`;
        block.style.zIndex = zIndexCounter++;

        // Шапка блока
        const header = document.createElement('div');
        header.className = 'text-block-header';
        
        // Кнопка удаления
        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.onclick = function() {
            block.remove();
        };

        header.appendChild(deleteBtn);
        
        // Текстовая область
        const textarea = document.createElement('textarea');
        textarea.className = 'text-block-content';
        textarea.placeholder = 'Введите текст...';

        // Собираем блок
        block.appendChild(header);
        block.appendChild(textarea);
        canvas.appendChild(block);

        // Включаем Drag-and-Drop
        makeDraggable(block, header);
    }

    function makeDraggable(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        handle.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();
            // Выводим перетаскиваемый элемент поверх остальных
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
});

document.addEventListener('DOMContentLoaded', () => {
    // Получаем элементы кнопок
    const addAttrBtn = document.getElementById('add-attr-btn');
    const deleteAttrBtn = document.getElementById('delete-attr-btn');
    
    // Получаем элементы модального окна
    const modalOverlay = document.getElementById('attr-modal');
    const saveBtn = document.getElementById('save-btn');
    const cancelBtn = document.getElementById('cancel-btn');

    // 1. Открыть окно при нажатии на "Добавить атрибут"
    addAttrBtn.addEventListener('click', () => {
        modalOverlay.style.display = 'flex';
    });

    // 2. Заглушка для кнопки "Удалить атрибут"
    deleteAttrBtn.addEventListener('click', () => {
        alert('Функция удаления атрибута пока находится в разработке (заглушка).');
    });

    // 3. Закрыть окно при нажатии на "Отменить"
    cancelBtn.addEventListener('click', () => {
        closeModal();
    });

    // 4. Заглушка для кнопки "Сохранить"
    saveBtn.addEventListener('click', () => {
        // В будущем здесь будет логика сбора данных (name, quantity, photo и т.д.) 
        // и их отправка в базу данных (например, MongoDB).
        
        alert('Данные успешно сохранены (заглушка)!');
        closeModal();
    });

    // Вспомогательная функция для скрытия окна и очистки полей
    function closeModal() {
        modalOverlay.style.display = 'none';
        
        // Очищаем форму, чтобы при следующем открытии она была пустой
        document.getElementById('attr-photo').value = '';
        document.getElementById('attr-name').value = '';
        document.getElementById('attr-quantity').value = '';
        document.getElementById('attr-desc').value = '';
        document.getElementById('attr-note').value = '';
    }
});