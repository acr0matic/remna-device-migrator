import {
  HwidDevice,
  MigrationResult,
  Platform,
  MigrationRule,
  UserInfo,
} from './types';
import { RemnawaveClient } from './remnawave-client';
import { parseUserAgent, getDevicePlatform } from './user-agent-parser';
import { getLogger } from './logger';

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

  /**
   * Core migration logic.
   *
   * Finds all devices matching the rule's sourceApp and (optionally) platform,
   * and deletes them to free a device slot for the new targetApp device.
   *
   * @param userId   - Remnawave user ID (uuid for API v2, numeric id for API v3)
   * @param rule       - The active migration rule
   * @param requestPlatform - OS platform detected from the incoming request (if any)
   */
  async migrateDevices(userId: string | number, rule: MigrationRule, requestPlatform: Platform | null): Promise<MigrationResult> {
    const logger = getLogger();
    const result: MigrationResult = {
      userId: String(userId),
      rule,
      targetPlatform: requestPlatform,
      deletedHwids: [],
      deletedCount: 0,
      skippedCount: 0,
      errors: [],
    };

    const devices = await this.getUserDevices(userId);
    if (devices.length === 0) {
      logger.debug('No devices found for user, skipping migration', { userId });
      return result;
    }

    for (const device of devices) {
      // Parse the device's user agent to see which app it belongs to
      const deviceParsed = parseUserAgent(device.userAgent);

      // Only process devices that match the sourceApp from our rule
      if (deviceParsed.app !== rule.sourceApp) {
        result.skippedCount++;
        logger.debug('Skipping device (app mismatch)', {
          userId,
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
            userId,
            hwid: device.hwid,
            devicePlatform,
            requestPlatform,
          });
          continue;
        }
      }

      // App (and optionally Platform) matches — delete the device
      logger.info('Found matching device to migrate', {
        userId,
        hwid: device.hwid,
        deviceApp: deviceParsed.app,
        devicePlatform: getDevicePlatform(device.userAgent, device.deviceOs),
        rule,
      });

      const deleted = await this.deleteDevice(userId, device.hwid);
      if (deleted) {
        result.deletedHwids.push(device.hwid);
        result.deletedCount++;
      } else {
        result.errors.push(device.hwid);
      }
    }

    if (result.deletedCount > 0) {
      logger.info('Migration completed', {
        userId,
        rule,
        deletedCount: result.deletedCount,
        deletedHwids: result.deletedHwids,
      });
    } else {
      logger.debug('No matching devices found to migrate', { userId, rule });
    }

    return result;
  }
}
