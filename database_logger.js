const fs = require('fs');
const path = require('path');

const dbLogger = {
    info: (action, data) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [DB_INFO] [${action}]`, data);
    },
    error: (action, error) => {
        const timestamp = new Date().toISOString();
        const errorDetails = {
            message: error.message,
            code: error.code || 'UNKNOWN',
            stack: error.stack
        };
        console.error(`[${timestamp}] [DB_ERROR] [${action}]`, errorDetails);
        return errorDetails;
    },
    query: (action, data) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [DB_QUERY] [${action}]`, data);
    },
    queryError: (action, data, error) => {
        const timestamp = new Date().toISOString();
        const errorDetails = {
            message: error.message,
            code: error.code || 'UNKNOWN',
            stack: error.stack,
            query: data
        };
        console.error(`[${timestamp}] [DB_QUERY_ERROR] [${action}]`, errorDetails);
        return errorDetails;
    }
};

module.exports = dbLogger;