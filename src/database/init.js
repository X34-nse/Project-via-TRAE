const { app } = require('electron');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db = null; // Initialize as null

function initializeDatabase() {
    if (db) {
        console.log('Database already initialized');
        return db;
    }

    db = new sqlite3.Database(path.join(app.getPath('userData'), 'security_checks.db'), (err) => {
        if (err) {
            console.error('Database initialization error:', err);
        } else {
            console.log('Connected to the security checks database');
            initializeTables();
        }
    });

    return db;
}

function initializeTables() {
    db.serialize(() => {
        try {
            // Only keep security-related tables
            db.run(`CREATE TABLE IF NOT EXISTS security_checks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                check_type TEXT NOT NULL,
                status TEXT NOT NULL,
                details TEXT,
                raw_data TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Create scan results table
            db.run(`CREATE TABLE IF NOT EXISTS scan_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                check_type TEXT NOT NULL,
                status TEXT NOT NULL,
                data TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            console.log('Security tables initialized successfully');
        } catch (error) {
            console.error('Error creating tables:', error);
        }
    });
}

function getDatabase() {
    if (!db) {
        return initializeDatabase();
    }
    return db;
}

module.exports = {
    getDatabase,
    initializeDatabase
}; 