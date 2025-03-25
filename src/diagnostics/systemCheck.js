const { exec } = require('child_process');
const { db } = require('../database/init');
const { STATUS } = require('../constants');

class SystemDiagnostics {
    constructor() {
        this.results = {
            database: { status: 'pending' },
            powershell: { status: 'pending' },
            networkAccess: { status: 'pending' },
            adminRights: { status: 'pending' },
            diskAccess: { status: 'pending' }
        };
    }

    async runAllTests() {
        console.log('Starting system diagnostics...');
        
        await this.checkDatabase();
        await this.checkPowerShell();
        await this.checkNetworkAccess();
        await this.checkAdminRights();
        await this.checkDiskAccess();

        return this.results;
    }

    async checkDatabase() {
        console.log('Testing database connection...');
        try {
            // Test database connection and tables
            await new Promise((resolve, reject) => {
                db.get("SELECT name FROM sqlite_master WHERE type='table'", [], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            });

            // Test write operation
            await new Promise((resolve, reject) => {
                db.run("INSERT INTO scan_results (check_type, status, data) VALUES (?, ?, ?)",
                    ['diagnostic_test', STATUS.SUCCESS, JSON.stringify({ test: true })],
                    function(err) {
                        if (err) reject(err);
                        resolve(this.lastID);
                    }
                );
            });

            this.results.database = {
                status: 'success',
                message: 'Database is working correctly'
            };
        } catch (error) {
            this.results.database = {
                status: 'error',
                message: `Database error: ${error.message}`,
                details: error.stack
            };
        }
    }

    async checkPowerShell() {
        console.log('Testing PowerShell access...');
        try {
            const testScript = `
                Write-Output (ConvertTo-Json @{
                    test = 'success'
                    version = $PSVersionTable.PSVersion.ToString()
                })
            `;

            const output = await new Promise((resolve, reject) => {
                exec('powershell.exe -NoProfile -NonInteractive -Command "' + testScript + '"',
                    { encoding: 'utf8' },
                    (error, stdout, stderr) => {
                        if (error) reject(error);
                        resolve(stdout.trim());
                    }
                );
            });

            const result = JSON.parse(output);
            this.results.powershell = {
                status: 'success',
                message: 'PowerShell is accessible',
                version: result.version
            };
        } catch (error) {
            this.results.powershell = {
                status: 'error',
                message: `PowerShell error: ${error.message}`,
                details: error.stack
            };
        }
    }

    async checkNetworkAccess() {
        console.log('Testing network access...');
        try {
            const testScript = `
                $result = @{
                    internetAccess = $false
                    dnsResolution = $false
                    firewallStatus = 'unknown'
                }

                try {
                    Test-Connection -ComputerName 8.8.8.8 -Count 1 -ErrorAction Stop
                    $result.internetAccess = $true
                } catch {}

                try {
                    Resolve-DnsName -Name "google.com" -ErrorAction Stop
                    $result.dnsResolution = $true
                } catch {}

                try {
                    $firewall = Get-NetFirewallProfile -ErrorAction Stop
                    $result.firewallStatus = ($firewall | ConvertTo-Json)
                } catch {}

                ConvertTo-Json $result
            `;

            const output = await new Promise((resolve, reject) => {
                exec('powershell.exe -NoProfile -NonInteractive -Command "' + testScript + '"',
                    { encoding: 'utf8' },
                    (error, stdout, stderr) => {
                        if (error) reject(error);
                        resolve(stdout.trim());
                    }
                );
            });

            const result = JSON.parse(output);
            this.results.networkAccess = {
                status: 'success',
                details: result
            };
        } catch (error) {
            this.results.networkAccess = {
                status: 'error',
                message: `Network test error: ${error.message}`,
                details: error.stack
            };
        }
    }

    async checkAdminRights() {
        console.log('Testing administrative privileges...');
        try {
            const testScript = `
                $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
                $principal = New-Object Security.Principal.WindowsPrincipal $identity
                $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
                
                ConvertTo-Json @{
                    isAdmin = $isAdmin
                    userName = $env:USERNAME
                    userDomain = $env:USERDOMAIN
                }
            `;

            const output = await new Promise((resolve, reject) => {
                exec('powershell.exe -NoProfile -NonInteractive -Command "' + testScript + '"',
                    { encoding: 'utf8' },
                    (error, stdout, stderr) => {
                        if (error) reject(error);
                        resolve(stdout.trim());
                    }
                );
            });

            const result = JSON.parse(output);
            this.results.adminRights = {
                status: 'success',
                details: result
            };
        } catch (error) {
            this.results.adminRights = {
                status: 'error',
                message: `Admin rights test error: ${error.message}`,
                details: error.stack
            };
        }
    }

    async checkDiskAccess() {
        console.log('Testing disk access...');
        try {
            const testScript = `
                $result = @{
                    drives = @()
                    permissions = @{}
                }

                Get-WmiObject Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 } | ForEach-Object {
                    $drive = @{
                        letter = $_.DeviceID
                        label = $_.VolumeName
                        freeSpace = $_.FreeSpace
                        totalSpace = $_.Size
                    }
                    
                    try {
                        $testPath = Join-Path $_.DeviceID "test.txt"
                        [io.file]::WriteAllText($testPath, "test")
                        Remove-Item $testPath
                        $drive.writeAccess = $true
                    } catch {
                        $drive.writeAccess = $false
                    }
                    
                    $result.drives += $drive
                }

                ConvertTo-Json $result -Depth 10
            `;

            const output = await new Promise((resolve, reject) => {
                exec('powershell.exe -NoProfile -NonInteractive -Command "' + testScript + '"',
                    { encoding: 'utf8' },
                    (error, stdout, stderr) => {
                        if (error) reject(error);
                        resolve(stdout.trim());
                    }
                );
            });

            const result = JSON.parse(output);
            this.results.diskAccess = {
                status: 'success',
                details: result
            };
        } catch (error) {
            this.results.diskAccess = {
                status: 'error',
                message: `Disk access test error: ${error.message}`,
                details: error.stack
            };
        }
    }
}

module.exports = { SystemDiagnostics }; 