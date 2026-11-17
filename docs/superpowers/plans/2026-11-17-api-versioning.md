# Remnawave API Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить поддержку двух версий Remnawave API (v280 и v3411) с переключением через переменную окружения `REMNAWAVE_API_VERSION`.

**Architecture:** Factory Pattern с интерфейсом `RemnawaveClient` и двумя реализациями (`RemnawaveClientV2` для v280, `RemnawaveClientV3` для v3411). `DeviceManager` будет использовать клиент вместо прямых вызовов API.

**Tech Stack:** TypeScript, Express, Axios, Node.js

**Spec:** `docs/design-api-versioning.md`

## Global Constraints

- Переменная окружения `REMNAWAVE_API_VERSION` принимает значения: `v2`, `280`, `v3`, `3411`
- По умолчанию используется `v2` (обратная совместимость)
- Тип идентификатора пользователя различается: v2 использует `uuid` (string), v3 использует `id` (number)
- Структура `HwidDevice` остаётся одинаковой в обеих версиях
- Все существующие тесты должны продолжать работать
- Комментарии и документация на русском языке

## Review Focus

1. **Неверное значение REMNAWAVE_API_VERSION** - должно выбрасывать ошибку при запуске
2. **Отсутствие REMNAWAVE_API_VERSION** - должно использовать значение по умолчанию (v2)
3. **Тип идентификатора пользователя** - v2 ожидает string (uuid), v3 ожидает number (id)
4. **Endpoint пути** - v2 использует `{userUuid}` в пути, v3 использует `{userId}`
5. **Body для delete** - v2 отправляет `{ userUuid, hwid }`, v3 отправляет `{ userId, hwid }`

---

### Task 1: Создание типов для API версий

**Files:**
- Modify: `src/types.ts`

**Interfaces:**
- Produces: `UserInfo` интерфейс для унифицированного представления пользователя

- [ ] **Step 1: Добавить интерфейс UserInfo в types.ts**

Добавить после существующих интерфейсов:

```typescript
// Унифицированная информация о пользователе для обеих версий API
export interface UserInfo {
  id: string | number;  // uuid для v2, number для v3
  username: string;
  shortUuid: string;
}

// Типы ответов для разных версий API
export interface GetUserByShortUuidResponseV2 {
  response: {
    uuid: string;
    username: string;
    shortUuid: string;
    status: string;
    hwidDeviceLimit: number | null;
  };
}

export interface GetUserByShortUuidResponseV3 {
  response: {
    id: number;
    shortUuid: string;
    username: string;
    status: string;
    hwidDeviceLimit: number | null;
    // ... другие поля из v3411
  };
}
```

- [ ] **Step 2: Проверить компиляцию TypeScript**

Run: `npm run build`
Expected: Успешная компиляция без ошибок

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add UserInfo and API version response types"
```

---

### Task 2: Создание интерфейса RemnawaveClient

**Files:**
- Create: `src/remnawave-client.ts`

**Interfaces:**
- Produces: `RemnawaveClient` интерфейс

- [ ] **Step 1: Создать файл remnawave-client.ts**

```typescript
import { UserInfo, HwidDevice } from './types';

/**
 * Интерфейс для работы с Remnawave API разных версий.
 * Реализуется классами RemnawaveClientV2 и RemnawaveClientV3.
 */
export interface RemnawaveClient {
  /**
   * Получить информацию о пользователе по short UUID.
   * @param shortUuid - короткий UUID из URL подписки
   * @returns UserInfo или null если пользователь не найден
   */
  getUserByShortUuid(shortUuid: string): Promise<UserInfo | null>;

  /**
   * Получить список HWID устройств пользователя.
   * @param userId - идентификатор пользователя (uuid для v2, number для v3)
   * @returns массив устройств
   */
  getUserDevices(userId: string | number): Promise<HwidDevice[]>;

  /**
   * Удалить HWID устройство пользователя.
   * @param userId - идентификатор пользователя (uuid для v2, number для v3)
   * @param hwid - HWID устройства для удаления
   * @returns true если удаление успешно
   */
  deleteDevice(userId: string | number, hwid: string): Promise<boolean>;
}
```

- [ ] **Step 2: Проверить компиляцию TypeScript**

Run: `npm run build`
Expected: Успешная компиляция без ошибок

- [ ] **Step 3: Commit**

```bash
git add src/remnawave-client.ts
git commit -m "feat: add RemnawaveClient interface"
```

---

### Task 3: Реализация RemnawaveClientV2 (API v280)

**Files:**
- Create: `src/remnawave-client-v2.ts`
- Test: `src/remnawave-client-v2.test.ts` (если есть тестовая инфраструктура)

**Interfaces:**
- Consumes: `RemnawaveClient` интерфейс, `UserInfo`, `HwidDevice`, `GetUserByShortUuidResponseV2`
- Produces: `RemnawaveClientV2` класс

- [ ] **Step 1: Создать файл remnawave-client-v2.ts**

```typescript
import axios, { AxiosInstance, AxiosError } from 'axios';
import { RemnawaveClient } from './remnawave-client';
import { UserInfo, HwidDevice, GetUserByShortUuidResponseV2, GetDevicesResponse } from './types';
import { getLogger } from './logger';

/**
 * Реализация RemnawaveClient для API версии v280.
 * Использует UUID для идентификации пользователей.
 */
export class RemnawaveClientV2 implements RemnawaveClient {
  private readonly api: AxiosInstance;
  private readonly dryRun: boolean;

  constructor(panelUrl: string, apiToken: string, timeoutMs = 5000, dryRun = false) {
    this.dryRun = dryRun;

    // Ensure the base URL ends with /api
    const baseURL = panelUrl.replace(/\/+$/, '') + '/api';

    this.api = axios.create({
      baseURL,
      timeout: timeoutMs,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async getUserByShortUuid(shortUuid: string): Promise<UserInfo | null> {
    const logger = getLogger();
    try {
      const res = await this.api.get<GetUserByShortUuidResponseV2>(
        `/users/by-short-uuid/${encodeURIComponent(shortUuid)}`,
      );
      const user = res.data.response;
      logger.debug('User found by short UUID (v2)', { shortUuid, userUuid: user.uuid, username: user.username });
      return {
        id: user.uuid,
        username: user.username,
        shortUuid: user.shortUuid,
      };
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 404) {
        logger.warn('User not found for short UUID (v2)', { shortUuid });
      } else {
        logger.error('Failed to look up user by short UUID (v2)', { shortUuid, error: formatError(err) });
      }
      return null;
    }
  }

  async getUserDevices(userId: string | number): Promise<HwidDevice[]> {
    const logger = getLogger();
    try {
      // Для v2 используем UUID в пути
      const res = await this.api.get<GetDevicesResponse>(`/hwid/devices/${userId}`);
      const devices = res.data.response.devices;
      logger.debug('Fetched user devices (v2)', { userId, total: devices.length });
      return devices;
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 404) {
        logger.debug('HWID endpoint not found, trying legacy format (v2)', { userId });
        try {
          const res = await this.api.get<GetDevicesResponse>(`/users/${userId}/hwid`);
          const devices = res.data.response.devices;
          logger.debug('Fetched user devices legacy (v2)', { userId, total: devices.length });
          return devices;
        } catch (legacyErr) {
          logger.error('Failed to fetch user devices legacy (v2)', { userId, error: formatError(legacyErr) });
          return [];
        }
      }
      logger.error('Failed to fetch user devices (v2)', { userId, error: formatError(err) });
      return [];
    }
  }

  async deleteDevice(userId: string | number, hwid: string): Promise<boolean> {
    const logger = getLogger();
    if (this.dryRun) {
      logger.info('[DRY RUN] Would delete device (v2)', { userId, hwid });
      return true;
    }
    try {
      // Для v2 отправляем userUuid в body
      await this.api.post('/hwid/devices/delete', { userUuid: userId, hwid });
      logger.info('Deleted device (v2)', { userId, hwid });
      return true;
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      // 404 означает, что устройство уже удалено
      if (status === 404) {
        logger.warn('Device already deleted (404) (v2)', { userId, hwid });
        return true;
      }
      // Пробуем legacy формат
      logger.debug('New HWID delete endpoint failed, trying legacy format (v2)', { userId, hwid });
      try {
        await this.api.delete(`/users/${userId}/hwid/${encodeURIComponent(hwid)}`);
        logger.info('Deleted device legacy (v2)', { userId, hwid });
        return true;
      } catch (legacyErr) {
        const legacyStatus = (legacyErr as AxiosError)?.response?.status;
        if (legacyStatus === 404) {
          logger.warn('Device already deleted (404) legacy (v2)', { userId, hwid });
          return true;
        }
        logger.error('Failed to delete device legacy (v2)', { userId, hwid, error: formatError(legacyErr) });
        return false;
      }
    }
  }
}

function formatError(err: unknown): string {
  if (err instanceof AxiosError) {
    const status = err.response?.status;
    const body = JSON.stringify(err.response?.data ?? {});
    return `${err.message} [status=${status}, body=${body}]`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
```

- [ ] **Step 2: Проверить компиляцию TypeScript**

Run: `npm run build`
Expected: Успешная компиляция без ошибок

- [ ] **Step 3: Commit**

```bash
git add src/remnawave-client-v2.ts
git commit -m "feat: add RemnawaveClientV2 implementation for API v280"
```

---

### Task 4: Реализация RemnawaveClientV3 (API v3411)

**Files:**
- Create: `src/remnawave-client-v3.ts`

**Interfaces:**
- Consumes: `RemnawaveClient` интерфейс, `UserInfo`, `HwidDevice`, `GetUserByShortUuidResponseV3`, `GetDevicesResponse`
- Produces: `RemnawaveClientV3` класс

- [ ] **Step 1: Создать файл remnawave-client-v3.ts**

```typescript
import axios, { AxiosInstance, AxiosError } from 'axios';
import { RemnawaveClient } from './remnawave-client';
import { UserInfo, HwidDevice, GetUserByShortUuidResponseV3, GetDevicesResponse } from './types';
import { getLogger } from './logger';

/**
 * Реализация RemnawaveClient для API версии v3411.
 * Использует числовой ID для идентификации пользователей.
 */
export class RemnawaveClientV3 implements RemnawaveClient {
  private readonly api: AxiosInstance;
  private readonly dryRun: boolean;

  constructor(panelUrl: string, apiToken: string, timeoutMs = 5000, dryRun = false) {
    this.dryRun = dryRun;

    // Ensure the base URL ends with /api
    const baseURL = panelUrl.replace(/\/+$/, '') + '/api';

    this.api = axios.create({
      baseURL,
      timeout: timeoutMs,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async getUserByShortUuid(shortUuid: string): Promise<UserInfo | null> {
    const logger = getLogger();
    try {
      const res = await this.api.get<GetUserByShortUuidResponseV3>(
        `/users/by-short-uuid/${encodeURIComponent(shortUuid)}`,
      );
      const user = res.data.response;
      logger.debug('User found by short UUID (v3)', { shortUuid, userId: user.id, username: user.username });
      return {
        id: user.id,
        username: user.username,
        shortUuid: user.shortUuid,
      };
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 404) {
        logger.warn('User not found for short UUID (v3)', { shortUuid });
      } else {
        logger.error('Failed to look up user by short UUID (v3)', { shortUuid, error: formatError(err) });
      }
      return null;
    }
  }

  async getUserDevices(userId: string | number): Promise<HwidDevice[]> {
    const logger = getLogger();
    try {
      // Для v3 используем числовой ID в пути
      const res = await this.api.get<GetDevicesResponse>(`/hwid/devices/${userId}`);
      const devices = res.data.response.devices;
      logger.debug('Fetched user devices (v3)', { userId, total: devices.length });
      return devices;
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 404) {
        logger.debug('HWID endpoint not found, trying legacy format (v3)', { userId });
        try {
          const res = await this.api.get<GetDevicesResponse>(`/users/${userId}/hwid`);
          const devices = res.data.response.devices;
          logger.debug('Fetched user devices legacy (v3)', { userId, total: devices.length });
          return devices;
        } catch (legacyErr) {
          logger.error('Failed to fetch user devices legacy (v3)', { userId, error: formatError(legacyErr) });
          return [];
        }
      }
      logger.error('Failed to fetch user devices (v3)', { userId, error: formatError(err) });
      return [];
    }
  }

  async deleteDevice(userId: string | number, hwid: string): Promise<boolean> {
    const logger = getLogger();
    if (this.dryRun) {
      logger.info('[DRY RUN] Would delete device (v3)', { userId, hwid });
      return true;
    }
    try {
      // Для v3 отправляем userId (number) в body
      await this.api.post('/hwid/devices/delete', { userId, hwid });
      logger.info('Deleted device (v3)', { userId, hwid });
      return true;
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      // 404 означает, что устройство уже удалено
      if (status === 404) {
        logger.warn('Device already deleted (404) (v3)', { userId, hwid });
        return true;
      }
      // Пробуем legacy формат
      logger.debug('New HWID delete endpoint failed, trying legacy format (v3)', { userId, hwid });
      try {
        await this.api.delete(`/users/${userId}/hwid/${encodeURIComponent(hwid)}`);
        logger.info('Deleted device legacy (v3)', { userId, hwid });
        return true;
      } catch (legacyErr) {
        const legacyStatus = (legacyErr as AxiosError)?.response?.status;
        if (legacyStatus === 404) {
          logger.warn('Device already deleted (404) legacy (v3)', { userId, hwid });
          return true;
        }
        logger.error('Failed to delete device legacy (v3)', { userId, hwid, error: formatError(legacyErr) });
        return false;
      }
    }
  }
}

function formatError(err: unknown): string {
  if (err instanceof AxiosError) {
    const status = err.response?.status;
    const body = JSON.stringify(err.response?.data ?? {});
    return `${err.message} [status=${status}, body=${body}]`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
```

- [ ] **Step 2: Проверить компиляцию TypeScript**

Run: `npm run build`
Expected: Успешная компиляция без ошибок

- [ ] **Step 3: Commit**

```bash
git add src/remnawave-client-v3.ts
git commit -m "feat: add RemnawaveClientV3 implementation for API v3411"
```

---

### Task 5: Создание фабрики для выбора клиента

**Files:**
- Create: `src/remnawave-client-factory.ts`

**Interfaces:**
- Consumes: `RemnawaveClient`, `RemnawaveClientV2`, `RemnawaveClientV3`, `AppConfig`
- Produces: `createRemnawaveClient` функция

- [ ] **Step 1: Создать файл remnawave-client-factory.ts**

```typescript
import { RemnawaveClient } from './remnawave-client';
import { RemnawaveClientV2 } from './remnawave-client-v2';
import { RemnawaveClientV3 } from './remnawave-client-v3';
import { AppConfig } from './types';
import { getLogger } from './logger';

/**
 * Создаёт экземпляр RemnawaveClient на основе версии API из конфигурации.
 *
 * @param config - конфигурация приложения
 * @returns экземпляр RemnawaveClient
 * @throws Error если версия API не поддерживается
 */
export function createRemnawaveClient(config: AppConfig): RemnawaveClient {
  const logger = getLogger();
  const version = config.REMNAWAVE_API_VERSION.toLowerCase();

  logger.info('Creating Remnawave client', { version });

  switch (version) {
    case 'v2':
    case '280':
      logger.info('Using RemnawaveClientV2 (API v280)');
      return new RemnawaveClientV2(
        config.REMNAWAVE_PANEL_URL,
        config.REMNAWAVE_API_TOKEN,
        config.API_TIMEOUT_MS,
        config.DRY_RUN,
      );

    case 'v3':
    case '3411':
      logger.info('Using RemnawaveClientV3 (API v3411)');
      return new RemnawaveClientV3(
        config.REMNAWAVE_PANEL_URL,
        config.REMNAWAVE_API_TOKEN,
        config.API_TIMEOUT_MS,
        config.DRY_RUN,
      );

    default:
      throw new Error(
        `Unsupported REMNAWAVE_API_VERSION: ${config.REMNAWAVE_API_VERSION}. ` +
        `Supported versions: v2, 280, v3, 3411`
      );
  }
}
```

- [ ] **Step 2: Проверить компиляцию TypeScript**

Run: `npm run build`
Expected: Успешная компиляция без ошибок

- [ ] **Step 3: Commit**

```bash
git add src/remnawave-client-factory.ts
git commit -m "feat: add RemnawaveClient factory for version selection"
```

---

### Task 6: Обновление типов конфигурации

**Files:**
- Modify: `src/types.ts`

**Interfaces:**
- Produces: обновлённый `AppConfig` с `REMNAWAVE_API_VERSION`

- [ ] **Step 1: Добавить REMNAWAVE_API_VERSION в AppConfig**

В `src/types.ts` найти интерфейс `AppConfig` и добавить поле:

```typescript
export interface AppConfig {
  PORT: number;
  REMNAWAVE_PANEL_URL: string;
  REMNAWAVE_API_TOKEN: string;
  REMNAWAVE_API_VERSION: string;  // NEW: версия API (v2/v3)
  SUB_PATH_REGEX: string;
  API_TIMEOUT_MS: number;
  DRY_RUN: boolean;
  LOG_LEVEL: string;
  MIGRATION_RULES: MigrationRule[];
}
```

- [ ] **Step 2: Проверить компиляцию TypeScript**

Run: `npm run build`
Expected: Успешная компиляция (будет ошибка в index.ts, исправим в следующей задаче)

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add REMNAWAVE_API_VERSION to AppConfig"
```

---

### Task 7: Обновление загрузки конфигурации

**Files:**
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: обновлённый `AppConfig`
- Produces: обновлённая функция `loadConfig`

- [ ] **Step 1: Добавить REMNAWAVE_API_VERSION в loadConfig**

В `src/index.ts` найти функцию `loadConfig` и добавить:

```typescript
const config: AppConfig = {
  PORT: parseInt(process.env['PORT'] ?? '3100', 10),
  REMNAWAVE_PANEL_URL: required('REMNAWAVE_PANEL_URL'),
  REMNAWAVE_API_TOKEN: required('REMNAWAVE_API_TOKEN'),
  REMNAWAVE_API_VERSION: process.env['REMNAWAVE_API_VERSION'] ?? 'v2',  // NEW
  SUB_PATH_REGEX: process.env['SUB_PATH_REGEX'] ?? '\\/([a-zA-Z0-9_-]{4,})(?:[\\/?]|$)',
  API_TIMEOUT_MS: parseInt(process.env['API_TIMEOUT_MS'] ?? '5000', 10),
  DRY_RUN: process.env['DRY_RUN'] === 'true',
  LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'info',
  MIGRATION_RULES: parseMigrationRules(process.env['MIGRATION_RULES']),
};
```

Также обновить логирование в `main()`:

```typescript
logger.info('Starting remna-device-migrator', {
  port: config.PORT,
  target: config.REMNAWAVE_PANEL_URL,
  apiVersion: config.REMNAWAVE_API_VERSION,  // NEW
  subPathRegex: config.SUB_PATH_REGEX,
  dryRun: config.DRY_RUN,
  logLevel: config.LOG_LEVEL,
  rules: config.MIGRATION_RULES.filter(r => r.enabled).map(r => `${r.sourceApp} -> ${r.targetApp} (platformMatching: ${r.platformMatching})`),
});
```

- [ ] **Step 2: Проверить компиляцию TypeScript**

Run: `npm run build`
Expected: Успешная компиляция без ошибок

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add REMNAWAVE_API_VERSION to config loading"
```

---

### Task 8: Модификация DeviceManager для использования RemnawaveClient

**Files:**
- Modify: `src/device-manager.ts`

**Interfaces:**
- Consumes: `RemnawaveClient`, `UserInfo`
- Produces: обновлённый `DeviceManager`

- [ ] **Step 1: Обновить импорты в device-manager.ts**

Заменить импорты в начале файла:

```typescript
import {
  GetDevicesResponse,
  GetUserByShortUuidResponse,
  HwidDevice,
  MigrationResult,
  Platform,
  MigrationRule,
  UserInfo,
} from './types';
import { RemnawaveClient } from './remnawave-client';
import { parseUserAgent, getDevicePlatform } from './user-agent-parser';
import { getLogger } from './logger';
```

Убрать импорт axios (больше не нужен напрямую):
```typescript
// УДАЛИТЬ: import axios, { AxiosInstance, AxiosError } from 'axios';
```

- [ ] **Step 2: Модифицировать класс DeviceManager**

Заменить приватные поля и конструктор:

```typescript
export class DeviceManager {
  private readonly client: RemnawaveClient;

  constructor(client: RemnawaveClient) {
    this.client = client;
  }

  /**
   * Look up a Remnawave user by their short UUID.
   * Returns null if the user is not found or the request fails.
   */
  async getUserByShortUuid(shortUuid: string): Promise<UserInfo | null> {
    return this.client.getUserByShortUuid(shortUuid);
  }

  /**
   * Fetch all HWID devices registered to the given user.
   */
  async getUserDevices(userId: string | number): Promise<HwidDevice[]> {
    return this.client.getUserDevices(userId);
  }

  /**
   * Delete a single HWID device by its hwid string.
   * Returns true if the deletion succeeded.
   */
  async deleteDevice(userId: string | number, hwid: string): Promise<boolean> {
    return this.client.deleteDevice(userId, hwid);
  }

  // ... migrateDevices остаётся без изменений, но нужно обновить вызовы
```

- [ ] **Step 3: Обновить метод migrateDevices**

В методе `migrateDevices` заменить вызовы:

```typescript
// Было:
const devices = await this.getUserDevices(userUuid);
// ...
const deleted = await this.deleteDevice(userUuid, device.hwid);

// Стало:
const devices = await this.getUserDevices(userId);
// ...
const deleted = await this.deleteDevice(userId, device.hwid);
```

Также нужно обновить параметр `userUuid` на `userId` в сигнатуре метода:

```typescript
async migrateDevices(userId: string | number, rule: MigrationRule, requestPlatform: Platform | null): Promise<MigrationResult> {
  const logger = getLogger();
  const result: MigrationResult = {
    userId: String(userId),  // Конвертируем в string для MigrationResult
    rule,
    targetPlatform: requestPlatform,
    deletedHwids: [],
    deletedCount: 0,
    skippedCount: 0,
    errors: [],
  };
  // ... остальная логика без изменений
}
```

- [ ] **Step 4: Обновить тип MigrationResult в types.ts**

В `src/types.ts` изменить `MigrationResult`:

```typescript
export interface MigrationResult {
  userId: string;  // Изменено с userUuid на userId
  rule: MigrationRule;
  targetPlatform: Platform | null;
  deletedHwids: string[];
  deletedCount: number;
  skippedCount: number;
  errors: string[];
}
```

- [ ] **Step 5: Проверить компиляцию TypeScript**

Run: `npm run build`
Expected: Могут быть ошибки в proxy.ts, исправим в следующей задаче

- [ ] **Step 6: Commit**

```bash
git add src/device-manager.ts src/types.ts
git commit -m "refactor: update DeviceManager to use RemnawaveClient"
```

---

### Task 9: Обновление proxy.ts для работы с новым DeviceManager

**Files:**
- Modify: `src/proxy.ts`

**Interfaces:**
- Consumes: обновлённый `DeviceManager`
- Produces: обновлённый middleware

- [ ] **Step 1: Обновить вызовы в createMigrationMiddleware**

В `src/proxy.ts` найти функцию `createMigrationMiddleware` и обновить:

```typescript
// Было:
const user = await deviceManager.getUserByShortUuid(shortUuid);
if (!user) {
  next();
  return;
}

await deviceManager.migrateDevices(user.uuid, activeRule, requestPlatform);

// Стало:
const user = await deviceManager.getUserByShortUuid(shortUuid);
if (!user) {
  next();
  return;
}

await deviceManager.migrateDevices(user.id, activeRule, requestPlatform);
```

- [ ] **Step 2: Проверить компиляцию TypeScript**

Run: `npm run build`
Expected: Успешная компиляция без ошибок

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "refactor: update proxy to use user.id instead of user.uuid"
```

---

### Task 10: Обновление index.ts для создания клиента через фабрику

**Files:**
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `createRemnawaveClient`, `DeviceManager`
- Produces: обновлённая точка входа

- [ ] **Step 1: Обновить импорты в index.ts**

Добавить импорт фабрики:

```typescript
import { createRemnawaveClient } from './remnawave-client-factory';
```

- [ ] **Step 2: Модифицировать создание DeviceManager**

Заменить в `main()`:

```typescript
// Было:
const deviceManager = new DeviceManager(
  config.REMNAWAVE_PANEL_URL,
  config.REMNAWAVE_API_TOKEN,
  config.API_TIMEOUT_MS,
  config.DRY_RUN,
);

// Стало:
const remnawaveClient = createRemnawaveClient(config);
const deviceManager = new DeviceManager(remnawaveClient);
```

- [ ] **Step 3: Проверить компиляцию TypeScript**

Run: `npm run build`
Expected: Успешная компиляция без ошибок

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: use RemnawaveClient factory in index.ts"
```

---

### Task 11: Обновление конфигурационных файлов

**Files:**
- Modify: `.env.example`
- Modify: `INSTALL.md`
- Modify: `README.md`

- [ ] **Step 1: Обновить .env.example**

Добавить переменную:

```env
# Remnawave API Version (v2 for v280, v3 for v3411)
REMNAWAVE_API_VERSION=v2
```

- [ ] **Step 2: Обновить INSTALL.md**

Добавить раздел о выборе версии API:

```markdown
## Выбор версии Remnawave API

Сервис поддерживает две версии Remnawave API:
- **v2** (по умолчанию) - для API версии 280
- **v3** - для API версии 3411

Укажите версию в `.env` файле:

```env
REMNAWAVE_API_VERSION=v2  # или v3
```

**Важно:** Убедитесь, что версия соответствует вашей версии Remnawave Panel.
```

- [ ] **Step 3: Обновить README.md**

Добавить в раздел конфигурации:

```markdown
- `REMNAWAVE_API_VERSION` — версия Remnawave API (`v2` для v280, `v3` для v3411, по умолчанию `v2`)
```

- [ ] **Step 4: Commit**

```bash
git add .env.example INSTALL.md README.md
git commit -m "docs: add REMNAWAVE_API_VERSION configuration documentation"
```

---

### Task 12: Тестирование и верификация

**Files:**
- Test: ручное тестирование

- [ ] **Step 1: Проверить компиляцию**

Run: `npm run build`
Expected: Успешная компиляция без ошибок

- [ ] **Step 2: Проверить запуск с версией v2**

```bash
REMNAWAVE_API_VERSION=v2 npm start
```

Expected: Успешный запуск, в логах "Using RemnawaveClientV2 (API v280)"

- [ ] **Step 3: Проверить запуск с версией v3**

```bash
REMNAWAVE_API_VERSION=v3 npm start
```

Expected: Успешный запуск, в логах "Using RemnawaveClientV3 (API v3411)"

- [ ] **Step 4: Проверить запуск без переменной (по умолчанию)**

```bash
npm start
```

Expected: Успешный запуск, в логах "Using RemnawaveClientV2 (API v280)"

- [ ] **Step 5: Проверить запуск с неверной версией**

```bash
REMNAWAVE_API_VERSION=invalid npm start
```

Expected: Ошибка "Unsupported REMNAWAVE_API_VERSION"

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: verify API versioning implementation"
```

---

## Self-Review Checklist

- [x] Spec coverage: все требования из design-api-versioning.md покрыты
- [x] Step scan: каждый шаг однозначен и выполним
- [x] Type consistency: типы согласованы между задачами
- [x] Review Focus: все 5 пунктов покрыты задачами
- [x] Proportion: план соответствует размеру задачи
