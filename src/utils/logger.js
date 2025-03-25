const winston = require('winston');
const path = require('path');
const { app } = require('electron');

// Create logger
const dbLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ 
            filename: path.join(app.getPath('userData'), 'logs', 'error.log'), 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: path.join(app.getPath('userData'), 'logs', 'database.log')
        })
    ]
});

// Add console logging if not in production
if (process.env.NODE_ENV !== 'production') {
    dbLogger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Wrapper for database operations with logging
function withLogging(operation) {
    return async (...args) => {
        try {
            dbLogger.info('Starting database operation', { operation: operation.name });
            const result = await operation(...args);
            dbLogger.info('Database operation successful', { 
                operation: operation.name,
                success: true 
            });
            return result;
        } catch (error) {
            dbLogger.error('Database operation failed', { 
                operation: operation.name,
                error: error.message,
                stack: error.stack 
            });
            throw error;
        }
    };
}

module.exports = { dbLogger, withLogging }; 