#!/bin/zsh
# Двойной клик по этому файлу запускает сервер и открывает приложение в браузере.
cd "$(dirname "$0")/be" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден. Установите его с https://nodejs.org и запустите файл снова."
  read -k1 "?Нажмите любую клавишу, чтобы закрыть..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Устанавливаю зависимости..."
  npm install || { read -k1 "?Ошибка установки. Нажмите любую клавишу..."; exit 1; }
fi

(sleep 1.5 && open "http://localhost:3000") &
echo "Чтобы остановить сервер, закройте это окно или нажмите Ctrl+C."
npm start
