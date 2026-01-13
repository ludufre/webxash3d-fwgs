// ============================================
// Log Levels
// ============================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

// ============================================
// Logger Class
// ============================================

class Logger {
  private level: LogLevel = LogLevel.INFO;
  private prefix: string = "[Admin]";
  private showTimestamp: boolean = true;

  /**
   * Sets the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Gets the current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Sets the log prefix
   */
  setPrefix(prefix: string): void {
    this.prefix = prefix;
  }

  /**
   * Enables/disables timestamps in logs
   */
  setShowTimestamp(show: boolean): void {
    this.showTimestamp = show;
  }

  /**
   * Formats the log message with prefix and optional timestamp
   */
  private format(level: string, ...args: unknown[]): unknown[] {
    const parts: unknown[] = [];

    if (this.showTimestamp) {
      const now = new Date();
      const time = now.toTimeString().slice(0, 8);
      parts.push(`[${time}]`);
    }

    parts.push(this.prefix);
    parts.push(`[${level}]`);
    parts.push(...args);

    return parts;
  }

  /**
   * Logs debug messages
   */
  debug(...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.debug(...this.format("DEBUG", ...args));
    }
  }

  /**
   * Logs info messages
   */
  info(...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.info(...this.format("INFO", ...args));
    }
  }

  /**
   * Logs warning messages
   */
  warn(...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(...this.format("WARN", ...args));
    }
  }

  /**
   * Logs error messages
   */
  error(...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(...this.format("ERROR", ...args));
    }
  }

  /**
   * Logs messages without level filtering (always shown unless NONE)
   */
  log(...args: unknown[]): void {
    if (this.level < LogLevel.NONE) {
      console.log(...this.format("LOG", ...args));
    }
  }

  /**
   * Creates a child logger with a different prefix
   */
  child(prefix: string): Logger {
    const child = new Logger();
    child.level = this.level;
    child.prefix = `${this.prefix}${prefix}`;
    child.showTimestamp = this.showTimestamp;
    return child;
  }

  /**
   * Groups console messages
   */
  group(label: string): void {
    if (this.level < LogLevel.NONE) {
      console.group(`${this.prefix} ${label}`);
    }
  }

  /**
   * Ends console group
   */
  groupEnd(): void {
    if (this.level < LogLevel.NONE) {
      console.groupEnd();
    }
  }

  /**
   * Logs a table
   */
  table(data: unknown): void {
    if (this.level < LogLevel.NONE) {
      console.table(data);
    }
  }

  /**
   * Measures time for an operation
   */
  time(label: string): void {
    if (this.level <= LogLevel.DEBUG) {
      console.time(`${this.prefix} ${label}`);
    }
  }

  /**
   * Ends time measurement
   */
  timeEnd(label: string): void {
    if (this.level <= LogLevel.DEBUG) {
      console.timeEnd(`${this.prefix} ${label}`);
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Export class for creating child loggers
export { Logger };
