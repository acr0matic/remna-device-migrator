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
