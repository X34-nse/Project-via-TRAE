const { app } = require('electron');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Initialize database
const db = new sqlite3.Database(path.join(app.getPath('userData'), 'security_checks.db'), (err) => {
    if (err) {
        console.error('Database initialization error:', err);
    } else {
        console.log('Connected to the security checks database');
        initializeTables();
    }
});

function initializeTables() {
    db.serialize(() => {
        try {
            // Create companies table
            db.run(`CREATE TABLE IF NOT EXISTS companies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                industry TEXT,
                size TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Create questions table
            db.run(`CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                subcategory TEXT,
                question TEXT NOT NULL,
                action TEXT,
                how_to TEXT,
                why TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            // Create security checks table
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
                scan_id INTEGER,
                check_type TEXT NOT NULL,
                status TEXT NOT NULL,
                data TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(scan_id) REFERENCES security_checks(id)
            )`);

            console.log('All database tables initialized successfully');
        } catch (error) {
            console.error('Error creating tables:', error);
        }
    });
}

module.exports = { db, initializeTables };