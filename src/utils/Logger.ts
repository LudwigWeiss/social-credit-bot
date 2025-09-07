export class Logger {
    private static formatTimestamp(): string {
        return new Date().toISOString();
    }

    static info(message: string, ...args: any[]): void {
        console.log(`[${this.formatTimestamp()}] [INFO] ${message}`, ...args);
    }

    static warn(message: string, ...args: any[]): void {
        console.warn(`[${this.formatTimestamp()}] [WARN] ${message}`, ...args);
    }

    static error(message: string, error?: any): void {
        console.error(`[${this.formatTimestamp()}] [ERROR] ${message}`, error);
    }

    static debug(message: string, ...args: any[]): void {
        if (process.env.NODE_ENV === 'development') {
            console.debug(`[${this.formatTimestamp()}] [DEBUG] ${message}`, ...args);
        }
    }

    static socialCredit(userId: string, change: number, reason: string): void {
        const emoji = change > 0 ? '📈' : '📉';
        this.info(`${emoji} Social Credit: User ${userId} ${change > 0 ? '+' : ''}${change} - ${reason}`);
    }
}