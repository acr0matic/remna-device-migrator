import { RemnawaveClient } from './remnawave-client';
import { RemnawaveClientV2 } from './remnawave-client-v2';
import { RemnawaveClientV3 } from './remnawave-client-v3';
import { AppConfig } from './types';
import { getLogger } from './logger';

/**
 * Поддерживаемые значения переменной REMNAWAVE_API_VERSION.
 * '2' — API v280 (RemnawaveClientV2), '3' — API v3411 (RemnawaveClientV3).
 */
export const SUPPORTED_API_VERSIONS: readonly string[] = ['2', '3'];

/**
 * Создаёт экземпляр RemnawaveClient на основе версии API из конфигурации.
 *
 * @param config - конфигурация приложения
 * @returns экземпляр RemnawaveClient
 * @throws Error если версия API не поддерживается
 */
export function createRemnawaveClient(config: AppConfig): RemnawaveClient {
  const logger = getLogger();
  const version = (config.REMNAWAVE_API_VERSION ?? '').trim().toLowerCase();

  logger.info('Creating Remnawave client', { version });

  switch (version) {
    case '2':
      logger.info('Using RemnawaveClientV2 (API v280)');
      return new RemnawaveClientV2(
        config.REMNAWAVE_PANEL_URL,
        config.REMNAWAVE_API_TOKEN,
        config.API_TIMEOUT_MS,
        config.DRY_RUN,
      );

    case '3':
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
        `Supported versions: ${SUPPORTED_API_VERSIONS.join(', ')}`
      );
  }
}
