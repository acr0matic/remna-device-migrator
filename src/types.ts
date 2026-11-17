// Supported OS platforms for device matching
export type Platform = 'ios' | 'android' | 'windows' | 'linux' | 'macos';

// Client app type
export type ClientApp = 'incy' | 'happ' | 'other';

// Parsed User-Agent result
export interface ParsedUserAgent {
  app: ClientApp;
  platform: Platform | null;
  version: string | null;
  raw: string;
}

// HWID device as returned by Remnawave API
export interface HwidDevice {
  uuid: string;
  hwid: string;
  userAgent: string | null;
  deviceOs: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  createdAt: string;
  updatedAt?: string;
}

// Response from GET /api/users/{uuid}/hwid
export interface GetDevicesResponse {
  response: {
    total: number;
    devices: HwidDevice[];
  };
}

// Response from GET /api/users/by-short-uuid/{shortUuid}
export interface GetUserByShortUuidResponse {
  response: {
    uuid: string;
    username: string;
    shortUuid: string;
    status: string;
    hwidDeviceLimit: number | null;
  };
}

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

// Migration rule defined in configuration
export interface MigrationRule {
  sourceApp: ClientApp;        // From which app we are migrating (the one to delete)
  targetApp: ClientApp;        // To which app we are migrating (the one making the request)
  platformMatching: boolean;   // Whether to match platforms (e.g. only delete iOS if request is iOS)
  enabled: boolean;            // Is this rule active
}

// Result of a migration operation for one user
export interface MigrationResult {
  userUuid: string;
  rule: MigrationRule;
  targetPlatform: Platform | null;
  deletedHwids: string[];
  deletedCount: number;
  skippedCount: number;
  errors: string[];
}

// Application configuration (loaded from .env)
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
