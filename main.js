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

  // Assessments table
  db.run(`CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    assessment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    risk_score FLOAT,
    FOREIGN KEY (company_id) REFERENCES companies (id)
  )`);

  // Responses table
  db.run(`CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER,
    question_id INTEGER,
    response TEXT,
    FOREIGN KEY (assessment_id) REFERENCES assessments (id)
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