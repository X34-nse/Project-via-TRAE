const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { exec } = require('child_process');

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
  // Drop existing questions table if it exists
  db.run(`DROP TABLE IF EXISTS questions`);

  // Recreate questions table with correct schema
  db.run(`CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    subcategory TEXT NOT NULL,
    question TEXT NOT NULL,
    action TEXT,
    how_to TEXT,
    why TEXT
  )`);

  // Assessments table
  // Drop existing assessments table if it exists
  db.run(`DROP TABLE IF EXISTS assessments`);

  // Recreate assessments table with correct schema
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
  const insertQuestion = 'INSERT OR IGNORE INTO questions (category, subcategory, question, action, how_to, why) VALUES (?, ?, ?, ?, ?, ?)';
  securityQuestions.forEach(q => {
    db.run(insertQuestion, [q.category, q.subcategory, q.question, q.action, q.howTo, q.why], (err) => {
      if (err) {
        console.error('Error inserting question:', err);
      }
    });
  });
}

// Initialize questions after tables are created
db.serialize(() => {
  initializeTables();
  initializeQuestions();
});

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

// Save assessment
ipcMain.handle('save-assessment', async (event, assessmentData) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      try {
        // Insert assessment
        db.run(
          'INSERT INTO assessments (company_id, risk_score, system_scan_results) VALUES (?, ?, ?)',
          [assessmentData.companyId, assessmentData.riskScore, JSON.stringify(assessmentData.systemScanResults)],
          function(err) {
            if (err) {
              db.run('ROLLBACK');
              reject(err);
              return;
            }

            const assessmentId = this.lastID;

            // Save responses if provided
            if (assessmentData.responses && assessmentData.responses.length > 0) {
              const stmt = db.prepare('INSERT INTO responses (assessment_id, question_id, response, notes) VALUES (?, ?, ?, ?)');
              
              assessmentData.responses.forEach(response => {
                stmt.run([assessmentId, response.questionId, response.response, response.notes], (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    reject(err);
                    return;
                  }
                });
              });
              
              stmt.finalize();
            }

            db.run('COMMIT');
            resolve(assessmentId);
          }
        );
      } catch (error) {
        db.run('ROLLBACK');
        reject(error);
      }
    });
  });
});

// System scan handlers
ipcMain.handle('check-antivirus', async () => {
  console.log('Starting antivirus check...');
  return new Promise((resolve) => {
    const timeout = 10000; // 10 seconden timeout
    let timedOut = false;
    
    const timeoutId = setTimeout(() => {
      timedOut = true;
      resolve({
        status: 'error',
        error: 'Antivirus check timed out',
        timestamp: new Date().toISOString()
      });
    }, timeout);

    const command = 'Get-MpComputerStatus | Select-Object -Property AMServiceEnabled,AntispywareEnabled,AntivirusEnabled,RealTimeProtectionEnabled | ConvertTo-Json';
    exec('powershell.exe -Command "' + command + '"', { timeout: timeout }, (error, stdout, stderr) => {
      if (timedOut) return;
      clearTimeout(timeoutId);

      if (error) {
        console.error('Antivirus check failed:', error);
        resolve({
          status: 'error',
          error: 'Could not check antivirus status',
          details: error.message,
          timestamp: new Date().toISOString()
        });
        return;
      }

      try {
        const status = JSON.parse(stdout);
        resolve({
          status: 'success',
          data: status,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        resolve({
          status: 'error',
          error: 'Invalid antivirus status data',
          details: e.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  });
});

ipcMain.handle('check-updates', async () => {
  console.log('Starting Windows Update check...');
  return new Promise((resolve) => {
    const timeout = 10000; // 10 seconden timeout
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      resolve({
        status: 'error',
        error: 'Windows Update check timed out',
        timestamp: new Date().toISOString()
      });
    }, timeout);

    const command = 'Get-WULastScanSuccessDate | ConvertTo-Json';
    exec('powershell.exe -Command "' + command + '"', { timeout: timeout }, (error, stdout, stderr) => {
      if (timedOut) return;
      clearTimeout(timeoutId);

      if (error) {
        console.error('Windows Update check failed:', error);
        resolve({
          status: 'error',
          error: 'Could not check Windows Update status',
          details: error.message,
          timestamp: new Date().toISOString()
        });
        return;
      }

      try {
        const status = JSON.parse(stdout);
        resolve({
          status: 'success',
          data: status,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        resolve({
          status: 'error',
          error: 'Invalid Windows Update status data',
          details: e.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  });
});

ipcMain.handle('check-firewall', async () => {
  console.log('Starting firewall check...');
  return new Promise((resolve) => {
    const timeout = 10000; // 10 seconden timeout
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      resolve({
        status: 'error',
        error: 'Firewall check timed out',
        timestamp: new Date().toISOString()
      });
    }, timeout);

    const command = 'Get-NetFirewallProfile | Select-Object -Property Name,Enabled | ConvertTo-Json';
    exec('powershell.exe -Command "' + command + '"', { timeout: timeout }, (error, stdout, stderr) => {
      if (timedOut) return;
      clearTimeout(timeoutId);

      if (error) {
        console.error('Firewall check failed:', error);
        resolve({
          status: 'error',
          error: 'Could not check firewall status',
          details: error.message,
          timestamp: new Date().toISOString()
        });
        return;
      }

      try {
        const status = JSON.parse(stdout);
        resolve({
          status: 'success',
          data: status,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        resolve({
          status: 'error',
          error: 'Invalid firewall status data',
          details: e.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  });
});

ipcMain.handle('check-backup-status', async () => {
  console.log('Starting backup check...');
  return new Promise((resolve) => {
    const timeout = 10000; // 10 seconden timeout
    let timedOut = false;
    let completedChecks = 0;
    const results = {};

    const commands = [
      'Get-WBSummary | ConvertTo-Json',
      'Get-ComputerRestorePoint | Select-Object -Property CreationTime,Description | ConvertTo-Json',
      'Get-WmiObject -Class Win32_ShadowCopy | Select-Object -Property InstallDate,Description | ConvertTo-Json'
    ];

    const timeoutId = setTimeout(() => {
      timedOut = true;
      resolve({
        status: 'completed',
        warning: 'Sommige back-up controles konden niet worden uitgevoerd',
        data: results,
        timestamp: new Date().toISOString()
      });
    }, timeout);

    commands.forEach((command, index) => {
      exec('powershell.exe -Command "' + command + '"', { timeout: timeout }, (error, stdout, stderr) => {
        if (timedOut) {
          console.log('Check timed out, skipping...');
          return;
        }
        completedChecks++;
        console.log(`Completed check ${completedChecks} of ${commands.length}`);

        if (!error && stdout && stdout.trim()) {
          try {
            const data = JSON.parse(stdout);
            switch(index) {
              case 0:
                results.volumes = data;
                console.log('Volume check completed successfully');
                break;
              case 1:
                results.systemRestore = data;
                console.log('System restore check completed successfully');
                break;
              case 2:
                results.fileHistory = data;
                console.log('File history check completed successfully');
                break;
            }
          } catch (e) {
            results[`warning_${index}`] = { type: 'parse_error', message: 'Kon gegevens niet verwerken' };
          }
        } else {
          results[`warning_${index}`] = { 
            type: 'feature_unavailable', 
            message: 'Deze Windows-functie is niet beschikbaar of vereist extra rechten'
          };
        }

        if (completedChecks === commands.length) {
          clearTimeout(timeoutId);
          resolve({
            status: Object.keys(results).some(k => k.startsWith('warning_')) ? 'partial' : 'completed',
            data: results,
            timestamp: new Date().toISOString()
          });
        }
      });
    });
  });
});

ipcMain.handle('check-encryption-status', async () => {
  console.log('Starting encryption check...');
  return new Promise((resolve) => {
    const timeout = 10000; // 10 seconden timeout
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      resolve({
        status: 'error',
        error: 'Encryption check timed out',
        timestamp: new Date().toISOString()
      });
    }, timeout);

    const command = 'Get-BitLockerVolume | Select-Object -Property MountPoint,ProtectionStatus | ConvertTo-Json';
    exec('powershell.exe -Command "' + command + '"', { timeout: timeout }, (error, stdout, stderr) => {
      if (timedOut) return;
      clearTimeout(timeoutId);

      if (error) {
        console.error('Encryption check failed:', error);
        resolve({
          status: 'error',
          error: 'Could not check encryption status',
          details: error.message,
          timestamp: new Date().toISOString()
        });
        return;
      }

      try {
        const status = JSON.parse(stdout);
        resolve({
          status: 'success',
          data: status,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        resolve({
          status: 'error',
          error: 'Invalid encryption status data',
          details: e.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  });
});

ipcMain.handle('check-network-security', async () => {
  console.log('Starting network security check...');
  return new Promise((resolve) => {
    const timeout = 10000; // Reduced timeout to 10 seconds
    let timedOut = false;
    console.log('Initializing network security check with timeout:', timeout, 'ms');

    const timeoutId = setTimeout(() => {
      timedOut = true;
      resolve({
        status: 'completed',
        warning: 'Netwerk beveiliging kon niet worden gecontroleerd',
        data: {
          available: false,
          reason: 'timeout'
        },
        timestamp: new Date().toISOString()
      });
    }, timeout);

    // Simplified network security check
    const command = 'Get-NetConnectionProfile -ErrorAction SilentlyContinue | Select-Object -Property NetworkCategory,IPv4Connectivity,IPv6Connectivity | ConvertTo-Json';
    exec('powershell.exe -Command "' + command + '"', { timeout: timeout }, (error, stdout, stderr) => {
      if (timedOut) return;
      clearTimeout(timeoutId);

      if (error || !stdout.trim()) {
        resolve({
          status: 'completed',
          warning: 'Netwerk beveiliging kon niet worden gecontroleerd',
          data: {
            available: false,
            reason: error ? 'error' : 'no_data'
          },
          timestamp: new Date().toISOString()
        });
        return;
      }

      try {
        const networkStatus = JSON.parse(stdout);
        resolve({
          status: 'completed',
          data: {
            available: true,
            profile: networkStatus
          },
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        resolve({
          status: 'completed',
          warning: 'Netwerk beveiliging status kon niet worden verwerkt',
          data: {
            available: false,
            reason: 'parse_error'
          },
          timestamp: new Date().toISOString()
        });
      }
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