#!/usr/bin/env bash
# ==============================================================================
# VILENCHYK Praxis Студія — Автономний запуск для лікаря
# Лікар-психіатр, нарколог Віленчик Антон Павлович
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR" || exit 1

echo "================================================================="
echo "  🏥 Запуск VILENCHYK Praxis Студія (МОЗ України № 854)"
echo "  👨‍⚕️ Лікар-психіатр, нарколог Віленчик А.П."
echo "================================================================="
echo ""

# Find runtime (bun or node/npm)
if [ -f "/home/anton612/.bun/bin/bun" ]; then
  RUNNER="/home/anton612/.bun/bin/bun"
elif command -v bun &> /dev/null; then
  RUNNER="bun"
elif command -v npm &> /dev/null; then
  RUNNER="npm run"
else
  echo "❌ Помилка: середовище виконання (Bun/Node) не знайдено."
  exit 1
fi

# Check if already running on port 3000
if lsof -i :3000 &> /dev/null || ss -tulpn | grep -q ":3000 "; then
  echo "✅ Додаток уже запущено на порту 3000."
else
  echo "🚀 Запуск локального медичного сервера..."
  # Start server in background
  if [ "$RUNNER" = "/home/anton612/.bun/bin/bun" ] || [ "$RUNNER" = "bun" ]; then
    nohup "$RUNNER" run dev > ./praxis.log 2>&1 &
  else
    nohup npm run dev > ./praxis.log 2>&1 &
  fi
  sleep 2
fi

echo "🌐 Відкриваємо веб-додаток у браузері: http://localhost:3000"

# Open in default browser if xdg-open exists
if command -v xdg-open &> /dev/null; then
  xdg-open "http://localhost:3000" > /dev/null 2>&1 &
elif command -v google-chrome &> /dev/null; then
  google-chrome "http://localhost:3000" > /dev/null 2>&1 &
elif command -v firefox &> /dev/null; then
  firefox "http://localhost:3000" > /dev/null 2>&1 &
fi

echo ""
echo "🎉 Студія готова до роботи!"
echo "📍 Адреса: http://localhost:3000"
echo "Для зупинки натисніть Ctrl+C або закрийте це вікно."
echo "================================================================="
