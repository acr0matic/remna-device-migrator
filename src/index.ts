import 'dotenv/config';
import express from 'express';
import { initLogger, getLogger } from './logger';
import { DeviceManager } from './device-manager';
import { createMigrationMiddleware, createReverseProxy } from './proxy';
import { AppConfig, MigrationRule, ClientApp } from './types';

function parseMigrationRules(envValue: string | undefined): MigrationRule[] {
  if (!envValue) {
    // Default backward-compatible behavior: migrate Happ to Incy with platform matching
    return [
      {
        sourceApp: 'happ',
        targetApp: 'incy',
        platformMatching: true,
        enabled: true,
      },
    ];
  }

  try {
    const parsed = JSON.parse(envValue);
    if (!Array.isArray(parsed)) {
      throw new Error('MIGRATION_RULES must be a JSON array');
    }

    return parsed.map((rule, index) => {
      if (!rule.sourceApp || !rule.targetApp) {
        throw new Error(`Rule at index ${index} is missing sourceApp or targetApp`);
      }
      return {
        sourceApp: rule.sourceApp.toLowerCase() as ClientApp,
        targetApp: rule.targetApp.toLowerCase() as ClientApp,
        platformMatching: rule.platformMatching !== false, // default true
        enabled: rule.enabled !== false, // default true
      };
    });
  } catch (err) {
    console.error(`[FATAL] Invalid MIGRATION_RULES format: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

function loadConfig(): AppConfig {
  const missing: string[] = [];

  function required(key: string): string {
    const val = process.env[key];
    if (!val) missing.push(key);
    return val ?? '';
  }

  const config: AppConfig = {
    PORT: parseInt(process.env['PORT'] ?? '3100', 10),
    REMNAWAVE_PANEL_URL: required('REMNAWAVE_PANEL_URL'),
    REMNAWAVE_API_TOKEN: required('REMNAWAVE_API_TOKEN'),
    // Default pattern captures the last path segment: /sub/AbCdEfGh → AbCdEfGh
    SUB_PATH_REGEX: process.env['SUB_PATH_REGEX'] ?? '\\/([a-zA-Z0-9_-]{4,})(?:[\\/?]|$)',
    API_TIMEOUT_MS: parseInt(process.env['API_TIMEOUT_MS'] ?? '5000', 10),
    DRY_RUN: process.env['DRY_RUN'] === 'true',
    LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'info',
    MIGRATION_RULES: parseMigrationRules(process.env['MIGRATION_RULES']),
  };

  if (missing.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  return config;
}

async function main(): Promise<void> {
  const config = loadConfig();
  initLogger(config.LOG_LEVEL);
  const logger = getLogger();

  logger.info('Starting remna-device-migrator', {
    port: config.PORT,
    target: config.REMNAWAVE_PANEL_URL,
    subPathRegex: config.SUB_PATH_REGEX,
    dryRun: config.DRY_RUN,
    logLevel: config.LOG_LEVEL,
    rules: config.MIGRATION_RULES.filter(r => r.enabled).map(r => `${r.sourceApp} -> ${r.targetApp} (platformMatching: ${r.platformMatching})`),
  });

  if (config.DRY_RUN) {
    logger.warn('DRY RUN mode is enabled — no devices will actually be deleted');
  }

  const deviceManager = new DeviceManager(
    config.REMNAWAVE_PANEL_URL,
    config.REMNAWAVE_API_TOKEN,
    config.API_TIMEOUT_MS,
    config.DRY_RUN,
  );

  const subPathRegex = new RegExp(config.SUB_PATH_REGEX);

  const app = express();

  // Disable Express default headers that leak implementation details
  app.disable('x-powered-by');

  // 1. Migration middleware — runs before the proxy
  app.use(createMigrationMiddleware(deviceManager, subPathRegex, config.MIGRATION_RULES));

  // 2. Reverse proxy — forwards every request to Remnawave Panel
  app.use(createReverseProxy(config.REMNAWAVE_PANEL_URL));

  const server = app.listen(config.PORT, () => {
    logger.info(`Proxy is listening on port ${config.PORT}`);
  });

  // Graceful shutdown
  function shutdown(signal: string): void {
    logger.info(`Received ${signal}, shutting down...`);
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
    // Force-exit after 10 seconds
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

main();
