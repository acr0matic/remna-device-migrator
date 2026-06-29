# remna-device-migrator

Прокси-сервер для автоматической миграции устройств между клиентскими приложениями в Remnawave Panel.

Подробная документация по установке и настройке в файле [INSTALL.md](INSTALL.md).

## Как это работает

При запросе подписки сервис:

1. Определяет тип клиента и платформу (iOS/Android/Windows) из заголовка `User-Agent`
2. Проверяет правила миграции из конфигурации
3. Находит устройства для удаления на основе правил (например, Happ → Incy)
4. Удаляет их через Remnawave API — освобождая слот
5. Пропускает запрос к Remnawave — тот регистрирует новое устройство+

## Быстрый старт (Docker)

```bash
# Клонировать репозиторий
git clone https://github.com/acr0matic/remna-device-migrator /opt/remna-device-migrator
cd /opt/remna-device-migrator

# Настроить .env файл для прокси
cp .env.example .env
nano .env

# Настроить .env файл для страницы подписки
cp .env.subscription-page.example .env.subscription-page
nano .env.subscription-page

# Создать сеть Remnawave (если ещё нет)
docker network create remnawave-network

# Запустить через docker-compose
docker compose up -d --build
```

## Структура проекта

```text
src/
├── types.ts             TypeScript интерфейсы
├── logger.ts            Winston + ротация логов
├── user-agent-parser.ts Парсинг User-Agent и определение платформы
├── device-manager.ts    Работа с Remnawave API (HWID)
├── proxy.ts             Migration middleware + reverse proxy
└── index.ts             Точка входа
```

## Конфигурация

Основные переменные окружения (`.env`):

- `PORT` — порт прокси (по умолчанию 3100)
- `REMNAWAVE_PANEL_URL` — URL Remnawave Panel
- `REMNAWAVE_API_TOKEN` — API токен с правами `users:read`, `users:write`
- `MIGRATION_RULES` — правила миграции в формате JSON (по умолчанию Happ → Incy)
- `DRY_RUN` — `true` для тестирования без удаления устройств
- `LOG_LEVEL` — уровень логирования (error/warn/info/debug)
