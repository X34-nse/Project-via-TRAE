const fs = require('fs');
const path = require('path');

class DatabaseLogger {
    constructor() {
        this.logDir = 'logs';
        this.logFile = path.join(this.logDir, 'database.log');
        this.initializeLogDirectory();
    }

    initializeLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir);
        }
    }

    formatMessage(level, operation, details) {
        const timestamp = new Date().toISOString();
        const formattedDetails = typeof details === 'object' ? JSON.stringify(details) : details;
        return `[${timestamp}] [${level.toUpperCase()}] [${operation}] ${formattedDetails}\n`;
    }

    log(level, operation, details) {
        const logMessage = this.formatMessage(level, operation, details);
        fs.appendFileSync(this.logFile, logMessage);
        console.log(logMessage.trim());
    }

    info(operation, details) {
        this.log('info', operation, details);
    }

    error(operation, error) {
        const errorDetails = {
            message: error.message,
            stack: error.stack,
            code: error.code
        };
        this.log('error', operation, errorDetails);
    }

    warn(operation, details) {
        this.log('warn', operation, details);
    }

    query(sql, params) {
        this.info('QUERY', {
            sql,
            params: params || []
        });
    }

    queryError(sql, params, error) {
        this.error('QUERY_ERROR', {
            sql,
            params: params || [],
            error: error.message
        });
    }

    transaction(operation) {
        this.info('TRANSACTION', operation);
    }

    transactionError(operation, error) {
        this.error('TRANSACTION_ERROR', {
            operation,
            error: error.message
        });
    }
}

module.exports = new DatabaseLogger();