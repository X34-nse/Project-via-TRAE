const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { exec } = require('child_process');
const dbLogger = require('./database_logger');

let mainWindow;
let tray;

// Add these constants at the top of the file, after the require statements
const SYSTEM_CHECK_TIMEOUT = 15000; // 15 seconds timeout for system checks
const DB_OPERATION_TIMEOUT = 10000; // 10 seconds timeout for database operations
const STATUS = {
    SUCCESS: 'succes',
    ERROR: 'fout',
    WARNING: 'waarschuwing',
    PARTIAL: 'gedeeltelijk',
    COMPLETED: 'voltooid'
};

// Standard error responses
const ERROR_RESPONSES = {
    TIMEOUT: (service) => ({
        status: STATUS.ERROR,
        error: `${service}-controle time-out`,
        details: `Controle afgebroken na ${SYSTEM_CHECK_TIMEOUT} milliseconden`,
        timestamp: new Date().toISOString()
    }),
    SERVICE_ERROR: (service, error) => ({
        status: STATUS.ERROR,
        error: `Kon de ${service} status niet controleren`,
        details: error.message,
        errorCode: error.code || 'ONBEKEND',
        timestamp: new Date().toISOString()
    })
};

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'tray-icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => mainWindow.show() },
    { label: 'Start Scan', click: () => startAutomatedScan() },
    { type: 'separator' },
    { label: 'Exit', click: () => app.quit() }
  ]);
  tray.setToolTip('Beveiligingsbeoordelingssysteem');
  tray.setContextMenu(contextMenu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());

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
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      try {
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
          subcategory TEXT NOT NULL,
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
          FOREIGN KEY (company_id) REFERENCES companies (id)
        )`);

        // Security Status table
        db.run(`CREATE TABLE IF NOT EXISTS security_status (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          antivirus_status TEXT,
          antivirus_message TEXT,
          updates_status TEXT,
          updates_message TEXT,
          firewall_status TEXT,
          firewall_message TEXT,
          backup_status TEXT,
          backup_message TEXT,
          encryption_status TEXT,
          encryption_message TEXT,
          network_status TEXT,
          network_message TEXT
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

        // Scan Results table for storing detailed scan data
        db.run(`CREATE TABLE IF NOT EXISTS scan_results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          assessment_id INTEGER,
          scan_type TEXT NOT NULL,
          scan_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT NOT NULL,
          details TEXT,
          raw_data TEXT,
          error_message TEXT,
          retry_count INTEGER DEFAULT 0,
          last_success_date DATETIME,
          FOREIGN KEY (assessment_id) REFERENCES assessments (id)
        )`);  

        // Scan History table for trend analysis
        db.run(`CREATE TABLE IF NOT EXISTS scan_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scan_result_id INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          previous_status TEXT,
          current_status TEXT,
          change_details TEXT,
          FOREIGN KEY (scan_result_id) REFERENCES scan_results (id)
        )`);

        // System scans table
        db.run(`
            CREATE TABLE IF NOT EXISTS system_scans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                antivirus_status TEXT,
                windows_update_status TEXT,
                firewall_status TEXT,
                backup_status TEXT,
                encryption_status TEXT,
                network_status TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        dbLogger.info('DATABASE_INIT', 'Tables initialized successfully');
        resolve();
      } catch (error) {
        dbLogger.error('DATABASE_INIT_ERROR', error);
        reject(error);
      }
    });
  });
}

// IPC handlers for database operations

// Handler for saving scan results
ipcMain.handle('save-scan-results', async (event, { assessmentId, scanResults }) => {
  if (!assessmentId || !scanResults) {
    throw new Error('Ongeldige parameters voor scan resultaten');
  }

  dbLogger.transaction('save-scan-results');
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Database operatie time-out'));
    }, DB_OPERATION_TIMEOUT);

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      dbLogger.info('BEGIN_TRANSACTION', { assessmentId });

      try {
        const stmt = db.prepare(`
          INSERT INTO scan_results (
            assessment_id, scan_type, status, details, 
            raw_data, error_message, retry_count, last_success_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        scanResults.forEach(result => {
          const lastSuccessDate = result.status === STATUS.SUCCESS ? new Date().toISOString() : null;
          const retryCount = result.retryCount || 0;

          stmt.run(
            assessmentId,
            result.name,
            result.status,
            result.details || null,
            JSON.stringify(result.result || {}),
            result.error || null,
            retryCount,
            lastSuccessDate,
            (err) => {
              if (err) {
                dbLogger.queryError('INSERT scan_results', { assessmentId, result }, err);
                throw err;
              }
              dbLogger.query('INSERT scan_results', { assessmentId, result });
            }
          );
        });

        stmt.finalize();
        
        db.run('COMMIT', (err) => {
          clearTimeout(timeout);
          if (err) {
            dbLogger.error('COMMIT_ERROR', err);
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          resolve();
        });
      } catch (error) {
        clearTimeout(timeout);
        console.error('Error in save-scan-results:', error);
        db.run('ROLLBACK');
        reject(error);
      }
    });
  });
});

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

ipcMain.handle('get-recent-assessments', async () => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT a.*, c.name as company_name 
      FROM assessments a
      JOIN companies c ON a.company_id = c.id
      ORDER BY a.assessment_date DESC
      LIMIT 5
    `;
    db.all(sql, [], (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
});

ipcMain.handle('get-security-status', async () => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM system_scans 
      ORDER BY timestamp DESC 
      LIMIT 1
    `;
    
    db.get(sql, [], (err, row) => {
      if (err) {
        dbLogger.queryError('SELECT system_scans', {}, err);
        reject(err);
        return;
      }

      if (!row) {
        resolve({
          antivirus: { status: STATUS.WARNING, message: 'Geen data beschikbaar' },
          updates: { status: STATUS.WARNING, message: 'Geen data beschikbaar' },
          firewall: { status: STATUS.WARNING, message: 'Geen data beschikbaar' },
          backup: { status: STATUS.WARNING, message: 'Geen data beschikbaar' },
          encryption: { status: STATUS.WARNING, message: 'Geen data beschikbaar' },
          network: { status: STATUS.WARNING, message: 'Geen data beschikbaar' }
        });
        return;
      }

      // Parse stored JSON data
      const antivirusData = JSON.parse(row.antivirus_status || '{}');
      const updatesData = JSON.parse(row.windows_update_status || '{}');
      const firewallData = JSON.parse(row.firewall_status || '{}');
      const backupData = JSON.parse(row.backup_status || '{}');
      const encryptionData = JSON.parse(row.encryption_status || '{}');
      const networkData = JSON.parse(row.network_status || '{}');

      resolve({
        antivirus: formatStatusData('Antivirus', antivirusData),
        updates: formatStatusData('Windows Updates', updatesData),
        firewall: formatStatusData('Firewall', firewallData),
        backup: formatStatusData('Backup', backupData),
        encryption: formatStatusData('Encryptie', encryptionData),
        network: formatStatusData('Netwerk', networkData)
      });
    });
  });
});

// Helper function to format status data
function formatStatusData(type, data) {
  if (!data || Object.keys(data).length === 0) {
    return {
      status: STATUS.WARNING,
      message: 'Geen data beschikbaar',
      details: null
    };
  }

  // Format specific messages based on scan type
  switch (type) {
    case 'Antivirus':
      return formatAntivirusStatus(data);
    case 'Windows Updates':
      return formatUpdatesStatus(data);
    case 'Firewall':
      return formatFirewallStatus(data);
    case 'Backup':
      return formatBackupStatus(data);
    case 'Encryptie':
      return formatEncryptionStatus(data);
    case 'Netwerk':
      return formatNetworkStatus(data);
    default:
      return {
        status: data.status || STATUS.WARNING,
        message: data.message || 'Status onbekend',
        details: data
      };
  }
}

// Specific formatters for each type
function formatAntivirusStatus(data) {
  if (data.data && data.data.AntivirusEnabled) {
    return {
      status: STATUS.SUCCESS,
      message: 'Antivirus is actief en up-to-date',
      details: data.data
    };
  }
  return {
    status: STATUS.ERROR,
    message: 'Antivirus is niet actief of verouderd',
    details: data.data
  };
}

function formatUpdatesStatus(data) {
  if (data.data && data.data.count === 0) {
    return {
      status: STATUS.SUCCESS,
      message: 'Systeem is up-to-date',
      details: data.data
    };
  }
  return {
    status: STATUS.WARNING,
    message: `${data.data?.count || 'Onbekend aantal'} updates beschikbaar`,
    details: data.data
  };
}

function formatFirewallStatus(data) {
  if (data.data && data.data.some(profile => profile.Enabled)) {
    return {
      status: STATUS.SUCCESS,
      message: 'Firewall is actief',
      details: data.data
    };
  }
  return {
    status: STATUS.ERROR,
    message: 'Firewall is niet actief',
    details: data.data
  };
}

// ... Add similar formatters for backup, encryption, and network ...

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
      dbLogger.info('BEGIN_TRANSACTION', { assessmentId });

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
  console.log('Antiviruscontrole starten...');
  return new Promise((resolve) => {
    let timedOut = false;
    
    const timeoutId = setTimeout(() => {
      timedOut = true;
      console.error('Antiviruscontrole time-out na', SYSTEM_CHECK_TIMEOUT, 'ms');
      resolve(ERROR_RESPONSES.TIMEOUT('Antivirus'));
    }, SYSTEM_CHECK_TIMEOUT);

    const command = 'Get-MpComputerStatus | Select-Object -Property AMServiceEnabled,AntispywareEnabled,AntivirusEnabled,RealTimeProtectionEnabled | ConvertTo-Json';
    exec('powershell.exe -Command "' + command + '"', { timeout: SYSTEM_CHECK_TIMEOUT }, (error, stdout, stderr) => {
      if (timedOut) return;
      clearTimeout(timeoutId);

      if (error) {
        console.error('Antiviruscontrole mislukt:', error);
        resolve(ERROR_RESPONSES.SERVICE_ERROR('antivirus', error));
        return;
      }

      try {
        const status = JSON.parse(stdout.trim());
        resolve({
          status: STATUS.SUCCESS,
          data: status,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        resolve({
          status: STATUS.ERROR,
          error: 'Ongeldige antivirusstatusgegevens',
          details: e.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  });
});

ipcMain.handle('check-updates', async () => {
  console.log('Windows Update-controle starten...');
  return new Promise((resolve) => {
    let timedOut = false;
    let checkStartTime = Date.now();

    const timeoutId = setTimeout(() => {
      timedOut = true;
      console.error('Windows Update-controle time-out na', SYSTEM_CHECK_TIMEOUT, 'ms');
      resolve({
        status: STATUS.ERROR,
        error: 'Windows Update-controle duurde te lang',
        details: `Controle afgebroken na ${SYSTEM_CHECK_TIMEOUT} milliseconden`,
        suggesties: ['Controleer de Windows Update-servicestatus'],
        timestamp: new Date().toISOString()
      });
    }, SYSTEM_CHECK_TIMEOUT);

    const script = `
      try {
        $updateSession = New-Object -ComObject Microsoft.Update.Session
        $updateSearcher = $updateSession.CreateUpdateSearcher()
        $searchResult = $updateSearcher.Search("IsInstalled=0")
        
        $pendingUpdates = @{
          count = $searchResult.Updates.Count
          lastSearchTime = $updateSearcher.GetTotalHistoryCount()
          lastInstallTime = (Get-Item (Join-Path $env:SystemRoot 'WindowsUpdate.log') -ErrorAction SilentlyContinue).LastWriteTime
        }

        ConvertTo-Json -InputObject @{
          status = 'success'
          data = $pendingUpdates
          source = 'com_object'
          timestamp = [DateTime]::UtcNow.ToString('o')
        } -Depth 10 -Compress
      } catch {
        ConvertTo-Json -InputObject @{
          status = 'error'
          error = 'Could not check Windows Update status'
          details = $_.Exception.Message
          timestamp = [DateTime]::UtcNow.ToString('o')
        } -Compress
      }
    `;

    exec('powershell.exe -Command "' + script + '"', { timeout: SYSTEM_CHECK_TIMEOUT }, (error, stdout, stderr) => {
      if (timedOut) return;
      clearTimeout(timeoutId);

      if (error) {
        console.error('Windows Update check failed:', error);
        resolve({
          status: STATUS.ERROR,
          error: 'Kon de Windows Update status niet controleren',
          details: error.message,
          errorCode: error.code || 'UNKNOWN',
          suggesties: [
            'Controleer of de Windows Update service actief is',
            'Herstart de Windows Update service',
            'Voer de applicatie uit als administrator'
          ],
          executionTime: Date.now() - checkStartTime,
          timestamp: new Date().toISOString()
        });
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        resolve({
          status: STATUS.ERROR,
          error: 'Invalid Windows Update status data',
          details: e.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  });
});

ipcMain.handle('check-firewall', async () => {
  console.log('Firewallcontrole starten...');
  return new Promise((resolve) => {
    let timedOut = false;
    let checkStartTime = Date.now();

    const timeoutId = setTimeout(() => {
      timedOut = true;
      console.error('Firewallcontrole time-out na', SYSTEM_CHECK_TIMEOUT, 'ms');
      resolve({
        status: STATUS.ERROR,
        error: 'Firewallcontrole duurde te lang',
        details: `Controle afgebroken na ${SYSTEM_CHECK_TIMEOUT} milliseconden`,
        suggesties: ['Controleer de Windows Firewall-servicestatus'],
        timestamp: new Date().toISOString()
      });
    }, SYSTEM_CHECK_TIMEOUT);

    const script = `
      try {
        $status = Get-NetFirewallProfile | Select-Object -Property Name,Enabled
        Write-Output (ConvertTo-Json -InputObject @{
          status = 'success'
          data = $status
          timestamp = [DateTime]::UtcNow.ToString('o')
        } -Depth 10 -Compress)
      } catch {
        Write-Output (ConvertTo-Json -InputObject @{
          status = 'error'
          error = 'Could not check firewall status'
          details = $_.Exception.Message
          timestamp = [DateTime]::UtcNow.ToString('o')
        } -Compress)
      }
    `;

    exec('powershell.exe -Command "' + script + '"', { timeout: SYSTEM_CHECK_TIMEOUT }, (error, stdout, stderr) => {
      if (timedOut) return;
      clearTimeout(timeoutId);

      if (error) {
        console.error('Firewall check failed:', error);
        resolve({
          status: STATUS.ERROR,
          error: 'Kon de firewall status niet controleren',
          details: error.message,
          errorCode: error.code || 'UNKNOWN',
          suggesties: [
            'Controleer of de Windows Firewall service actief is',
            'Herstart de Windows Firewall service',
            'Voer de applicatie uit als administrator'
          ],
          executionTime: Date.now() - checkStartTime,
          timestamp: new Date().toISOString()
        });
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        resolve({
          status: STATUS.ERROR,
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
    const timeout = 15000; // Verhoogd naar 15 seconden
    let timedOut = false;
    let completedChecks = 0;
    let checkStartTime = Date.now();
    const results = {};

    const commands = [
      'Get-WBSummary | ConvertTo-Json',
      'Get-ComputerRestorePoint | Select-Object -Property CreationTime,Description | ConvertTo-Json',
      'Get-WmiObject -Class Win32_ShadowCopy | Select-Object -Property InstallDate,Description | ConvertTo-Json'
    ];

    const timeoutId = setTimeout(() => {
      timedOut = true;
      console.error('Backup check timed out after', timeout, 'ms');
      resolve({
        status: STATUS.WARNING,
        error: 'Back-up controle duurde te lang',
        details: 'De controle werd afgebroken na ' + timeout + ' milliseconden',
        suggesties: [
          'Controleer of de Windows Backup service actief is',
          'Controleer of er voldoende schijfruimte is',
          'Voer de applicatie uit als administrator'
        ],
        data: results,
        executionTime: Date.now() - checkStartTime,
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
            status: Object.keys(results).some(k => k.startsWith('warning_')) ? STATUS.PARTIAL : STATUS.COMPLETED,
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
    const timeout = 15000; // Verhoogd naar 15 seconden
    let timedOut = false;
    let checkStartTime = Date.now();

    const timeoutId = setTimeout(() => {
      timedOut = true;
      console.error('Encryption check timed out after', timeout, 'ms');
      resolve({
        status: STATUS.ERROR,
        error: 'Encryptie controle duurde te lang',
        details: 'De controle werd afgebroken na ' + timeout + ' milliseconden',
        suggesties: [
          'Controleer of BitLocker is geïnstalleerd',
          'Controleer of TPM beschikbaar is',
          'Voer de applicatie uit als administrator'
        ],
        executionTime: Date.now() - checkStartTime,
        timestamp: new Date().toISOString()
      });
    }, timeout);

    const script = `
      try {
        $volumes = Get-CimInstance -ClassName Win32_Volume -ErrorAction Stop |
          Where-Object { $_.DriveLetter -ne $null } |
          Select-Object DriveLetter, Label

        $encryptionStatus = @{}
        foreach ($volume in $volumes) {
          try {
            $bitlockerStatus = Get-BitLockerVolume -MountPoint $volume.DriveLetter -ErrorAction Stop
            $encryptionStatus[$volume.DriveLetter] = @{
              label = $volume.Label
              protected = $bitlockerStatus.ProtectionStatus -eq 'On'
              method = 'BitLocker'
            }
          } catch {
            $fsutil = & fsutil behavior query EncryptPagingFile 2>&1
            $encryptionStatus[$volume.DriveLetter] = @{
              label = $volume.Label
              protected = $fsutil -match 'EncryptPagingFile = 1'
              method = 'System'
            }
          }
        }
        ConvertTo-Json -InputObject @{
          status = 'success'
          data = $encryptionStatus
          timestamp = [DateTime]::UtcNow.ToString('o')
        } -Depth 10 -Compress
      } catch {
        ConvertTo-Json -InputObject @{
          status = 'warning'
          error = 'Limited encryption status check available'
          details = "Run script as administrator for full encryption status"
          timestamp = [DateTime]::UtcNow.ToString('o')
        } -Compress
      }
    `