const canvas = document.getElementById('canvas');
const addBtn = document.getElementById('add-block-btn');

// Счетчик для слоев, чтобы активный блок всегда был поверх остальных
let zIndexCounter = 1;

addBtn.addEventListener('click', createBlock);

function createBlock() {
    // Создаем основной контейнер блока
    const block = document.createElement('div');
    block.className = 'text-block';
    
    // Задаем появление в случайном месте ближе к центру или левому верхнему углу
    const x = Math.random() * 200 + 50;
    const y = Math.random() * 200 + 80;
    block.style.left = `${x}px`;
    block.style.top = `${y}px`;
    block.style.zIndex = zIndexCounter++;

    // Создаем шапку блока (за которую будем таскать)
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
    
    // Создаем текстовую область
    const textarea = document.createElement('textarea');
    textarea.className = 'text-block-content';
    textarea.placeholder = 'Введите текст...';

    // Собираем элементы вместе
    block.appendChild(header);
    block.appendChild(textarea);
    canvas.appendChild(block);

    // Добавляем возможность перетаскивания
    makeDraggable(block, header);
}

function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    // Перетаскивание начинается при клике на шапку
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e.preventDefault();
        // При клике выводим блок на передний план
        element.style.zIndex = zIndexCounter++;
        
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e.preventDefault();
        
        // Вычисляем новую позицию курсора
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Устанавливаем новые координаты элементу
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        // Очищаем события при отпускании мыши
        document.onmouseup = null;
        document.onmousemove = null;
    }
}