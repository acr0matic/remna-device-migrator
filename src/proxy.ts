import { Request, Response, NextFunction, RequestHandler } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { DeviceManager } from './device-manager';
import { parseUserAgent } from './user-agent-parser';
import { getLogger } from './logger';
import { Platform, MigrationRule } from './types';

/**
 * Build a regex from the SUB_PATH_REGEX env string.
 * The regex must have exactly one capture group that returns the user's short UUID.
 *
 * Default pattern captures the last non-empty path segment:
 *   /([a-zA-Z0-9_-]{4,})(?:[/?]|$)/
 */
function buildSubPathRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch {
    getLogger().warn('Invalid SUB_PATH_REGEX, using default', { pattern });
    return /\/([a-zA-Z0-9_-]{4,})(?:[/?]|$)/;
  }
}

/**
 * Extract the user short UUID from a subscription request URL.
 * Returns null if the pattern does not match.
 */
function extractShortUuid(url: string, regex: RegExp): string | null {
  const match = url.match(regex);
  return match?.[1] ?? null;
}

/**
 * In-memory per-user migration lock to prevent duplicate migrations
 * when the same user sends concurrent subscription requests.
 */
const migrationInProgress = new Set<string>();

/**
 * Migration middleware.
 *
 * Intercepts every request and checks against MIGRATION_RULES:
 *  1. Extracts the short UUID from the request URL.
 *  2. Resolves the Remnawave user by that UUID.
 *  3. Detects the OS platform from User-Agent / x-device-os header.
 *  4. Deletes devices according to the matched rule.
 *  5. Calls next() so the proxy middleware can forward the request.
 *
 * Migration is best-effort: failures are logged but never block the request.
 */
export function createMigrationMiddleware(
  deviceManager: DeviceManager,
  subPathRegex: RegExp,
  rules: MigrationRule[],
): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const logger = getLogger();
    const ua = req.headers['user-agent'] ?? '';
    const parsed = parseUserAgent(ua);

    // Find the first active rule that matches the current request's targetApp
    const activeRule = rules.find(r => r.enabled && r.targetApp === parsed.app);

    if (!activeRule) {
      // No active migration rule matches this client app — pass through
      next();
      return;
    }

    logger.debug(`Matched migration rule: ${activeRule.sourceApp} -> ${activeRule.targetApp}`, {
      method: req.method,
      url: req.url,
      userAgent: ua,
      platform: parsed.platform,
    });

    // Determine the OS platform from the UA, with x-device-os as a higher-priority source
    const deviceOsHeader = req.headers['x-device-os'] as string | undefined;
    const requestPlatform: Platform | null = (() => {
      if (deviceOsHeader) {
        const { normalizePlatform } = require('./user-agent-parser') as typeof import('./user-agent-parser');
        const p = normalizePlatform(deviceOsHeader);
        if (p) return p;
      }
      return parsed.platform;
    })();

    if (activeRule.platformMatching && !requestPlatform) {
      logger.warn('Could not determine platform, skipping migration because rule requires platformMatching', { userAgent: ua, deviceOsHeader });
      next();
      return;
    }

    // Extract the short UUID that identifies the user
    const shortUuid = extractShortUuid(req.url, subPathRegex);
    if (!shortUuid) {
      logger.warn('Could not extract short UUID from URL, skipping migration', { url: req.url });
      next();
      return;
    }

    // Prevent concurrent migrations for the same user
    if (migrationInProgress.has(shortUuid)) {
      logger.debug('Migration already in progress for user, skipping', { shortUuid });
      next();
      return;
    }

    migrationInProgress.add(shortUuid);
    try {
      const user = await deviceManager.getUserByShortUuid(shortUuid);
      if (!user) {
        // User lookup failed — still forward the request
        next();
        return;
      }

      await deviceManager.migrateDevices(user.uuid, activeRule, requestPlatform);
    } catch (err) {
      logger.error('Unexpected error during migration', {
        shortUuid,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      migrationInProgress.delete(shortUuid);
    }

    next();
  };
}

/**
 * Reverse-proxy middleware that forwards every request to the Remnawave Panel.
 */
export function createReverseProxy(targetUrl: string): RequestHandler {
  const logger = getLogger();

  return createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    logger: {
      info: (msg: string) => logger.debug(`[HPM] ${msg}`),
      warn: (msg: string) => logger.warn(`[HPM] ${msg}`),
      error: (msg: string) => logger.error(`[HPM] ${msg}`),
    },
    on: {
      error: (err, req, res) => {
        // Detailed error logging
        const errorCode = (err as any).code || 'UNKNOWN_CODE';
        logger.error('Proxy error', {
          url: (req as Request).url,
          method: (req as Request).method,
          target: targetUrl,
          errorCode,
          errorMessage: err.message,
          errorStack: err.stack,
        });
        // res can be ServerResponse or Socket; only ServerResponse has headersSent
        if ('headersSent' in res && !res.headersSent) {
          (res as Response).status(502).json({ error: 'Bad Gateway', code: errorCode || 'PROXY_ERROR' });
        }
      },
    },
  }) as unknown as RequestHandler;
}
