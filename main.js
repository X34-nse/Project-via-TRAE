const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Database initialization
const db = new sqlite3.Database('security_assessment.db', (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to the SQLite database');
    initializeTables();
  }
});

function initializeTables() {
  // Companies table
  db.run(`CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    industry TEXT,
    size TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Questions table for security assessment
  db.run(`CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    question TEXT NOT NULL,
    action TEXT,
    how_to TEXT,
    why TEXT
  )`);

  // Assessments table
  db.run(`CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    assessment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    risk_score FLOAT,
    system_scan_results TEXT,
    FOREIGN KEY (company_id) REFERENCES companies (id)
  )`);

  // Responses table
  db.run(`CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER,
    question_id INTEGER,
    response TEXT,
    notes TEXT,
    FOREIGN KEY (assessment_id) REFERENCES assessments (id),
    FOREIGN KEY (question_id) REFERENCES questions (id)
  )`);

  // System Scans table
  db.run(`CREATE TABLE IF NOT EXISTS system_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    antivirus_status TEXT,
    windows_update_status TEXT,
    firewall_status TEXT,
    installed_software TEXT,
    system_info TEXT
  )`);
}

// IPC handlers for database operations
ipcMain.handle('create-company', async (event, companyData) => {
  return new Promise((resolve, reject) => {
    const sql = 'INSERT INTO companies (name, industry, size) VALUES (?, ?, ?)';
    db.run(sql, [companyData.name, companyData.industry, companyData.size], function(err) {
      if (err) reject(err);
      resolve(this.lastID);
    });
  });
});

ipcMain.handle('get-companies', async () => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM companies';
    db.all(sql, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
});

ipcMain.handle('create-assessment', async (event, assessmentData) => {
  return new Promise((resolve, reject) => {
    const sql = 'INSERT INTO assessments (company_id, risk_score) VALUES (?, ?)';
    db.run(sql, [assessmentData.company_id, assessmentData.risk_score], function(err) {
      if (err) reject(err);
      resolve(this.lastID);
    });
  });
});

// Load questions from questions.js
const securityQuestions = require('./questions.js');

// Initialize questions in database
function initializeQuestions() {
  const insertQuestion = 'INSERT OR IGNORE INTO questions (category, question, action, how_to, why) VALUES (?, ?, ?, ?, ?)';
  securityQuestions.forEach(q => {
    db.run(insertQuestion, [q.category, q.question, q.action, q.howTo, q.why]);
  });
}

// Call initializeQuestions after database connection
initializeTables();
initializeQuestions();

// Get all questions
ipcMain.handle('get-questions', async () => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM questions ORDER BY category, id';
    db.all(sql, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
});

// Save response
ipcMain.handle('save-response', async (event, responseData) => {
  return new Promise((resolve, reject) => {
    const sql = 'INSERT INTO responses (assessment_id, question_id, response, notes) VALUES (?, ?, ?, ?)';
    db.run(sql, [responseData.assessment_id, responseData.question_id, responseData.response, responseData.notes], function(err) {
      if (err) reject(err);
      resolve(this.lastID);
    });
  });
});

// Save system scan results
ipcMain.handle('save-system-scan', async (event, scanData) => {
  return new Promise((resolve, reject) => {
    const sql = 'INSERT INTO system_scans (antivirus_status, windows_update_status, firewall_status, installed_software, system_info) VALUES (?, ?, ?, ?, ?)';
    db.run(sql, [scanData.antivirus_status, scanData.windows_update_status, scanData.firewall_status, scanData.installed_software, scanData.system_info], function(err) {
      if (err) reject(err);
      resolve(this.lastID);
    });
  });
});

// Get assessment results
ipcMain.handle('get-assessment-results', async (event, assessmentId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT r.*, q.category, q.question, q.action, q.how_to, q.why
      FROM responses r
      JOIN questions q ON r.question_id = q.id
      WHERE r.assessment_id = ?
      ORDER BY q.category, q.id
    `;
    db.all(sql, [assessmentId], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
});