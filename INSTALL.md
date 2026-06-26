# Инструкция по установке remna-device-migrator

## Что делает этот сервис

Прокси-сервер, который встаёт **между subscription-page и Remnawave Panel**.  
При каждом запросе подписки он:

1. Определяет тип клиента и платформу (iOS / Android / Windows) из заголовка `User-Agent`.
2. Проверяет правила миграции из конфигурации.
3. Получает список HWID-устройств пользователя через Remnawave API.
4. Находит устройства, соответствующие правилам (например, Happ → Incy).
5. Удаляет их — освобождая слот.
6. Пропускает оригинальный запрос к Remnawave — тот регистрирует новое устройство.

---

## Схема работы

```
Клиент (Incy iOS)
      │
      ▼
subscription-page :3010
      │
      ▼
remna-device-migrator :3100
      │
      ├─── /api  →  Remnawave API (удаление Happ-устройства iOS)
      │
      └─── запрос перенаправляется ──▶ Remnawave Panel
```

---

## Требования

- Linux-сервер с Docker и docker-compose.
- Существующая сеть Remnawave (или возможность создать новую).
- API-токен Remnawave

---

## Установка через Docker

### 1. Клонировать репозиторий

```bash
git clone https://github.com/acr0matic/remna-device-migrator /opt/remna-device-migrator
cd /opt/remna-device-migrator
```

### 2. Создать сеть Remnawave (если ещё нет)

```bash
docker network create remnawave-network
```

### 3. Создать файлы `.env` и `.env.subscription-page`

```bash
cp .env.example .env
cp .env.subscription-page.example .env.subscription-page
nano .env
nano .env.subscription-page
```

Заполните `.env`:

```env
PORT=3100

# URL реальной Remnawave Panel
REMNAWAVE_PANEL_URL=https://panel.example.com

# API-токен из Remnawave → Настройки → API Tokens
REMNAWAVE_API_TOKEN=ваш_токен

SUB_PATH_REGEX=\/api\/sub\/([a-zA-Z0-9_-]+)
API_TIMEOUT_MS=5000
DRY_RUN=false
LOG_LEVEL=info
```

Заполните `.env.subscription-page`:

```env
APP_PORT=3010
REMNAWAVE_PANEL_URL=http://remna-device-migrator:3100
REMNAWAVE_API_TOKEN=ваш_токен
```

### 4. Запустить через docker

```bash
docker compose up -d --build
```

### Управление

```bash
docker compose logs -f remna-device-migrator      # логи мигратора
docker compose logs -f remnawave-subscription-page  # логи subscription-page
docker compose restart remna-device-migrator    # перезапуск мигратора
docker compose down                            # остановка всех сервисов
```

---

## Получение API-токена в Remnawave

1. Открыть Remnawave Panel → **Settings → API Tokens**.
2. Нажать **Create token**.
3. Выдать права: `users:read`, `users:write` (включает управление HWID).
4. Скопировать токен в `.env` → `REMNAWAVE_API_TOKEN`.

---

## Переменные окружения

| Переменная           | Обязательна | По умолчанию                                      | Описание                                                                 |
|----------------------|:-----------:|---------------------------------------------------|--------------------------------------------------------------------------|
| `PORT`               | нет         | `3100`                                            | Порт прокси-сервера                                                      |
| `REMNAWAVE_PANEL_URL`| **да**      | —                                                 | URL Remnawave Panel (без `/` в конце)                                    |
| `REMNAWAVE_API_TOKEN`| **да**      | —                                                 | Bearer-токен Remnawave API                                               |
| `SUB_PATH_REGEX`     | нет         | `\/api\/sub\/([a-zA-Z0-9_-]+)`                   | Regex с 1 группой для извлечения shortUUID из URL подписки               |
| `MIGRATION_RULES`    | нет         | (см. ниже)                                        | Правила миграции в формате JSON-строки                                   |
| `API_TIMEOUT_MS`     | нет         | `5000`                                            | Таймаут (мс) для запросов к Remnawave API                                |
| `DRY_RUN`            | нет         | `false`                                           | `true` — только логировать, не удалять устройства                        |
| `LOG_LEVEL`          | нет         | `info`                                            | Уровень логирования: `error` / `warn` / `info` / `debug`                 |

---

## Настройка правил миграции (MIGRATION_RULES)

По умолчанию мигратор работает только в одну сторону: удаляет `Happ` при подключении `Incy`.

Вы можете настроить **любые направления миграции**, передав JSON-массив в `MIGRATION_RULES`.

**Миграция Happ → Incy (по умолчанию):**

```json
[{"sourceApp": "happ", "targetApp": "incy", "platformMatching": true, "enabled": true}]
```

**Миграция в обе стороны (Happ ↔ Incy):**
В `.env`:

```env
MIGRATION_RULES='[{"sourceApp":"happ","targetApp":"incy","platformMatching":true,"enabled":true},{"sourceApp":"incy","targetApp":"happ","platformMatching":true,"enabled":true}]'
```

**Миграция без учёта платформы** (подключение с iOS Incy удалит все Happ устройства, даже Android и Windows):

```json
[{"sourceApp": "happ", "targetApp": "incy", "platformMatching": false, "enabled": true}]
```

---

## Логи

Логи пишутся в директорию `logs/`:

- `migrator-YYYY-MM-DD.log` — все события (ротация по дням, хранится 14 дней)
- `migrator-error-YYYY-MM-DD.log` — только ошибки (хранится 30 дней)

Пример записи об успешной миграции:

```json
{
  "timestamp": "2026-06-26T10:15:30.000Z",
  "level": "info",
  "message": "Migration completed",
  "userUuid": "550e8400-...",
  "incyPlatform": "ios",
  "deletedCount": 1,
  "deletedHwids": ["vfjdhk66csdjhk"],
  "dryRun": false
}
```

---

## Тестирование (dry-run)

Перед боевым запуском рекомендуется проверить работу в режиме `DRY_RUN=true`:

В `.env`:

```env
DRY_RUN=true
LOG_LEVEL=debug
```

Перезапустить:
```bash
docker compose restart remna-device-migrator
```

В этом режиме сервис находит устройства и логирует, какие бы удалил, но **не выполняет удаление**.

---

## Обновление

```bash
cd /opt/remna-device-migrator
git pull
docker compose up -d --build
```
