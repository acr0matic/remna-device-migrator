import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `[${timestamp}] ${level.toUpperCase().padEnd(5)}: ${message}${metaStr}`;
  }),
);

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

export function createLogger(logLevel = 'info'): winston.Logger {
  const transports: winston.transport[] = [
    // Console — human-readable
    new winston.transports.Console({
      format: logFormat,
    }),

    // All logs rotated daily, kept for 14 days
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'migrator-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      maxSize: '20m',
      format: jsonFormat,
    }),

    // Errors in a separate file for quick access
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'migrator-error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '30d',
      maxSize: '10m',
      format: jsonFormat,
    }),
  ];

  return winston.createLogger({
    level: logLevel,
    transports,
    exitOnError: false,
  });
}

// Singleton logger — configured lazily via init()
let _logger: winston.Logger | null = null;

export function initLogger(logLevel = 'info'): void {
  _logger = createLogger(logLevel);
}

export function getLogger(): winston.Logger {
  if (!_logger) {
    _logger = createLogger('info');
  }
  return _logger;
}
