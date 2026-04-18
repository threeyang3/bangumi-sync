/**
 * 日志工具
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_PREFIX = '[Bangumi Sync]';

class Logger {
	private enabled: boolean = true;
	private level: LogLevel = 'info';

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	setLevel(level: LogLevel): void {
		this.level = level;
	}

	debug(message: string, ...args: unknown[]): void {
		if (this.enabled && this.shouldLog('debug')) {
			console.debug(`${LOG_PREFIX} ${message}`, ...args);
		}
	}

	info(message: string, ...args: unknown[]): void {
		if (this.enabled && this.shouldLog('info')) {
			console.info(`${LOG_PREFIX} ${message}`, ...args);
		}
	}

	warn(message: string, ...args: unknown[]): void {
		if (this.enabled && this.shouldLog('warn')) {
			console.warn(`${LOG_PREFIX} ${message}`, ...args);
		}
	}

	error(message: string, ...args: unknown[]): void {
		if (this.enabled && this.shouldLog('error')) {
			console.error(`${LOG_PREFIX} ${message}`, ...args);
		}
	}

	private shouldLog(level: LogLevel): boolean {
		const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
		return levels.indexOf(level) >= levels.indexOf(this.level);
	}
}

export const logger = new Logger();
