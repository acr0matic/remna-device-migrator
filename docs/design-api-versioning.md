# Дизайн: Вариативная поддержка Remnawave API v280 и v3411

## Цель
Добавить поддержку двух версий Remnawave API (v280 и v3411) с переключением через переменную окружения `REMNAWAVE_API_VERSION`.

## Ключевые различия между версиями

| Аспект | v280 (RemnawaveClientV2) | v3411 (RemnawaveClientV3) |
|--------|---------------------------|---------------------------|
| Идентификатор пользователя | `uuid` (string) | `id` (number) |
| Endpoint получения устройств | `GET /api/hwid/devices/{userUuid}` | `GET /api/hwid/devices/{userId}` |
| Endpoint удаления устройства | `POST /api/hwid/devices/delete` с `{ userUuid, hwid }` | `POST /api/hwid/devices/delete` с `{ userId, hwid }` |
| Ответ UserResponseDto | содержит `uuid` | содержит `id` (number) |

## Архитектура

### 1. Интерфейс RemnawaveClient
```typescript
interface RemnawaveClient {
  getUserByShortUuid(shortUuid: string): Promise<UserInfo | null>;
  getUserDevices(userId: string | number): Promise<HwidDevice[]>;
  deleteDevice(userId: string | number, hwid: string): Promise<boolean>;
}
```

### 2. Классы реализации
- **RemnawaveClientV2**: для API v280, использует UUID
- **RemnawaveClientV3**: для API v3411, использует числовой ID

### 3. Фабрика создания клиента
```typescript
function createRemnawaveClient(config: AppConfig): RemnawaveClient {
  const version = config.REMNAWAVE_API_VERSION;
  switch (version) {
    case 'v2':
    case '280':
      return new RemnawaveClientV2(...);
    case 'v3':
    case '3411':
      return new RemnawaveClientV3(...);
    default:
      throw new Error(`Unsupported API version: ${version}`);
  }
}
```

### 4. Модификация DeviceManager
- Заменить прямые вызовы API на вызовы через `RemnawaveClient`
- Сохранить логику миграции устройств
- Адаптировать типы для работы с обоими форматами идентификаторов

## Структура файлов

```
src/
├── types.ts                    # Общие типы + типы для API версий
├── remnawave-client.ts         # Интерфейс RemnawaveClient
├── remnawave-client-v2.ts      # Реализация для v280
├── remnawave-client-v3.ts      # Реализация для v3411
├── device-manager.ts           # Модифицированный для использования клиента
├── index.ts                    # Обновлённая конфигурация
└── proxy.ts                    # Без изменений
```

## Конфигурация

Добавить в `.env`:
```env
REMNAWAVE_API_VERSION=v2  # или v3
```

По умолчанию: `v2` (для обратной совместимости)

## Типы данных

### UserInfo (унифицированный)
```typescript
interface UserInfo {
  id: string | number;  // uuid для v2, number для v3
  username: string;
  shortUuid: string;
}
```

### HwidDevice (без изменений)
Текущая структура остаётся той же, так как формат устройств одинаков в обеих версиях.

## План реализации

1. Создать интерфейс `RemnawaveClient` в `remnawave-client.ts`
2. Реализовать `RemnawaveClientV2` в `remnawave-client-v2.ts`
3. Реализовать `RemnawaveClientV3` в `remnawave-client-v3.ts`
4. Обновить `types.ts` - добавить типы для API версий
5. Модифицировать `device-manager.ts` для использования `RemnawaveClient`
6. Обновить `index.ts` - добавить `REMNAWAVE_API_VERSION` в конфигурацию
7. Обновить документацию (README.md, INSTALL.md)
8. Протестировать обе версии

## Критерии приёмки

- [ ] Поддержка API v280 через `RemnawaveClientV2`
- [ ] Поддержка API v3411 через `RemnawaveClientV3`
- [ ] Переключение через `REMNAWAVE_API_VERSION` в .env
- [ ] Обратная совместимость (по умолчанию v2)
- [ ] Все существующие тесты проходят
- [ ] Документация обновлена
