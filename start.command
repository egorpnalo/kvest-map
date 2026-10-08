#!/bin/bash
# Скрипт запуска Конструктора квестов для macOS
cd "$(dirname "$0")" || exit 1

if [ -d "be" ]; then
  cd be || exit 1
elif [ -d "kvest-map-version-1.1/be" ]; then
  cd "kvest-map-version-1.1/be" || exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не установлен."
  echo "Установите Node.js (LTS) с сайта https://nodejs.org и повторите запуск."
  open "https://nodejs.org"
  read -n 1 -s -r -p "Нажмите любую клавишу для выхода..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Первый запуск: установка зависимостей..."
  npm install || { echo "Ошибка при установке."; read -n 1 -s -r -p "Нажмите клавишу..."; exit 1; }
fi

(sleep 1.5 && open "http://localhost:3000") &
echo "Сервер запущен! Открываем браузер: http://localhost:3000"
echo "Чтобы остановить сервер, закройте это окно терминала или нажмите Ctrl+C."
npm start
