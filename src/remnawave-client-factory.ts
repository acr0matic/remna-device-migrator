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
