import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  GetDevicesResponse,
  GetUserByShortUuidResponse,
  HwidDevice,
  MigrationResult,
  Platform,
  MigrationRule,
} from './types';
import { getDevicePlatform, parseUserAgent } from './user-agent-parser';
import { getLogger } from './logger';

export class DeviceManager {
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

  /**
   * Look up a Remnawave user by their short UUID (the identifier embedded in subscription URLs).
   * Returns null if the user is not found or the request fails.
   */
  async getUserByShortUuid(shortUuid: string): Promise<{ uuid: string; username: string } | null> {
    const logger = getLogger();
    try {
      const res = await this.api.get<GetUserByShortUuidResponse>(
        `/users/by-short-uuid/${encodeURIComponent(shortUuid)}`,
      );
      const user = res.data.response;
      logger.debug('User found by short UUID', { shortUuid, userUuid: user.uuid, username: user.username });
      return { uuid: user.uuid, username: user.username };
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      if (status === 404) {
        logger.warn('User not found for short UUID', { shortUuid });
      } else {
        logger.error('Failed to look up user by short UUID', { shortUuid, error: formatError(err) });
      }
      return null;
    }
  }

  /**
   * Fetch all HWID devices registered to the given user.
   */
  async getUserDevices(userUuid: string): Promise<HwidDevice[]> {
    const logger = getLogger();
    try {
      // Try the newer endpoint format first
      const res = await this.api.get<GetDevicesResponse>(`/hwid/devices/${userUuid}`);
      const devices = res.data.response.devices;
      logger.debug('Fetched user devices', { userUuid, total: devices.length });
      return devices;
    } catch (err) {
      // Fallback to older format if 404
      const status = (err as AxiosError)?.response?.status;
      if (status === 404) {
        logger.debug('New HWID endpoint not found, trying legacy format', { userUuid });
        try {
          const res = await this.api.get<GetDevicesResponse>(`/users/${userUuid}/hwid`);
          const devices = res.data.response.devices;
          logger.debug('Fetched user devices (legacy)', { userUuid, total: devices.length });
          return devices;
        } catch (legacyErr) {
          logger.error('Failed to fetch user devices (legacy)', { userUuid, error: formatError(legacyErr) });
          return [];
        }
      }
      logger.error('Failed to fetch user devices', { userUuid, error: formatError(err) });
      return [];
    }
  }

  /**
   * Delete a single HWID device by its hwid string.
   * Returns true if the deletion succeeded.
   */
  async deleteDevice(userUuid: string, hwid: string): Promise<boolean> {
    const logger = getLogger();
    if (this.dryRun) {
      logger.info('[DRY RUN] Would delete device', { userUuid, hwid });
      return true;
    }
    try {
      // New format: POST /api/hwid/devices/delete with userUuid and hwid in body
      await this.api.post('/hwid/devices/delete', { userUuid, hwid });
      logger.info('Deleted Happ device', { userUuid, hwid });
      return true;
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      // 404 means the device was already gone — treat as success
      if (status === 404) {
        logger.warn('Device already deleted (404)', { userUuid, hwid });
        return true;
      }
      // Try legacy format as fallback
      logger.debug('New HWID delete endpoint failed, trying legacy format', { userUuid, hwid });
      try {
        await this.api.delete(`/users/${userUuid}/hwid/${encodeURIComponent(hwid)}`);
        logger.info('Deleted Happ device (legacy)', { userUuid, hwid });
        return true;
      } catch (legacyErr) {
        const legacyStatus = (legacyErr as AxiosError)?.response?.status;
        if (legacyStatus === 404) {
          logger.warn('Device already deleted (404) - legacy', { userUuid, hwid });
          return true;
        }
        logger.error('Failed to delete device (legacy)', { userUuid, hwid, error: formatError(legacyErr) });
        return false;
      }
    }
  }

  /**
   * Core migration logic.
   *
   * Finds all devices matching the rule's sourceApp and (optionally) platform,
   * and deletes them to free a device slot for the new targetApp device.
   *
   * @param userUuid   - Remnawave user UUID
   * @param rule       - The active migration rule
   * @param requestPlatform - OS platform detected from the incoming request (if any)
   */
  async migrateDevices(userUuid: string, rule: MigrationRule, requestPlatform: Platform | null): Promise<MigrationResult> {
    const logger = getLogger();
    const result: MigrationResult = {
      userUuid,
      rule,
      targetPlatform: requestPlatform,
      deletedHwids: [],
      deletedCount: 0,
      skippedCount: 0,
      errors: [],
    };

    const devices = await this.getUserDevices(userUuid);
    if (devices.length === 0) {
      logger.debug('No devices found for user, skipping migration', { userUuid });
      return result;
    }

    for (const device of devices) {
      // Parse the device's user agent to see which app it belongs to
      const deviceParsed = parseUserAgent(device.userAgent);

      // Only process devices that match the sourceApp from our rule
      if (deviceParsed.app !== rule.sourceApp) {
        result.skippedCount++;
        logger.debug('Skipping device (app mismatch)', {
          userUuid,
          hwid: device.hwid,
          deviceApp: deviceParsed.app,
          ruleSourceApp: rule.sourceApp,
        });
        continue;
      }

      // If the rule requires platform matching, check if the device's platform matches the incoming request's platform
      if (rule.platformMatching) {
        const devicePlatform = getDevicePlatform(device.userAgent, device.deviceOs);

        if (devicePlatform !== requestPlatform) {
          result.skippedCount++;
          logger.debug('Skipping device (platform mismatch)', {
            userUuid,
            hwid: device.hwid,
            devicePlatform,
            requestPlatform,
          });
          continue;
        }
      }

      // App (and optionally Platform) matches — delete the device
      logger.info('Found matching device to migrate', {
        userUuid,
        hwid: device.hwid,
        deviceApp: deviceParsed.app,
        devicePlatform: getDevicePlatform(device.userAgent, device.deviceOs),
        rule,
      });

      const deleted = await this.deleteDevice(userUuid, device.hwid);
      if (deleted) {
        result.deletedHwids.push(device.hwid);
        result.deletedCount++;
      } else {
        result.errors.push(device.hwid);
      }
    }

    if (result.deletedCount > 0) {
      logger.info('Migration completed', {
        userUuid,
        rule,
        deletedCount: result.deletedCount,
        deletedHwids: result.deletedHwids,
        dryRun: this.dryRun,
      });
    } else {
      logger.debug('No matching devices found to migrate', { userUuid, rule });
    }

    return result;
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
