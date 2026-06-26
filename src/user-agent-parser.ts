import { ClientApp, ParsedUserAgent, Platform } from './types';

/**
 * Normalize a raw OS string to one of the supported Platform values.
 *
 * Remnawave stores the OS as sent in the x-device-os header (e.g. "iOS", "Android", "Windows").
 * The Incy User-Agent encodes the platform as a lower-case segment (e.g. "ios", "android").
 * The Happ User-Agent encodes the platform with mixed case (e.g. "ios", "Android", "Windows").
 */
export function normalizePlatform(os: string | null | undefined): Platform | null {
  if (!os) return null;
  const lower = os.toLowerCase().trim();

  if (lower === 'ios' || lower === 'iphone' || lower === 'ipad') return 'ios';
  if (lower === 'android') return 'android';
  if (lower === 'windows') return 'windows';
  if (lower === 'linux') return 'linux';
  if (lower === 'macos' || lower === 'mac' || lower === 'darwin' || lower === 'osx') return 'macos';

  // Partial substring matches as fallback
  if (lower.includes('ios') || lower.includes('iphone') || lower.includes('ipad')) return 'ios';
  if (lower.includes('android')) return 'android';
  if (lower.includes('windows')) return 'windows';
  if (lower.includes('linux')) return 'linux';
  if (lower.includes('mac') || lower.includes('darwin')) return 'macos';

  return null;
}

/**
 * Parse a User-Agent string.
 *
 * Supported formats:
 *   Incy:  INCY/<version>/<platform> <rest>
 *          Examples:
 *            INCY/2.3.4/ios CFNetwork/1410.1 Darwin/22.6.0
 *            INCY/3.2.4/android Dalvik/2.1.0
 *
 *   Happ:  Happ/<version>/<Platform>/<build>
 *          Examples:
 *            Happ/2.14.0/Windows/2605071230500
 *            Happ/3.24.1/Android/17815953510421845578
 *            Happ/4.11.0/ios/2606031854551
 */
export function parseUserAgent(ua: string | undefined | null): ParsedUserAgent {
  const raw = ua ?? '';

  // --- Incy detection ---
  // Starts with INCY/ (case-insensitive)
  const incyMatch = raw.match(/^INCY\/([^\s/]+)\/(\w+)/i);
  if (incyMatch) {
    return {
      app: 'incy',
      version: incyMatch[1],
      platform: normalizePlatform(incyMatch[2]),
      raw,
    };
  }

  // --- Happ detection ---
  // Starts with Happ/ (case-insensitive)
  const happMatch = raw.match(/^Happ\/([^\s/]+)\/(\w+)/i);
  if (happMatch) {
    return {
      app: 'happ',
      version: happMatch[1],
      platform: normalizePlatform(happMatch[2]),
      raw,
    };
  }

  return { app: 'other', version: null, platform: null, raw };
}

/**
 * Determine the platform of a stored device.
 *
 * Priority:
 *  1. deviceOs field (stored from the x-device-os request header)
 *  2. Parsed from the device's userAgent string
 */
export function getDevicePlatform(
  userAgent: string | null,
  deviceOs: string | null,
): Platform | null {
  // Use the stored x-device-os field first — it is the most reliable
  if (deviceOs) {
    const p = normalizePlatform(deviceOs);
    if (p) return p;
  }
  // Fall back to parsing the User-Agent
  if (userAgent) {
    const parsed = parseUserAgent(userAgent);
    return parsed.platform;
  }
  return null;
}
