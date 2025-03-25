const { exec } = require('child_process');
const { STATUS, SYSTEM_CHECK_TIMEOUT } = require('../constants');
const { saveScanResult } = require('../database/scanResults');

const encryptionScript = `
    $ErrorActionPreference = 'Stop'
    try {
        $results = @{
            status = 'success'
            data = @{}
            timestamp = [DateTime]::UtcNow.ToString('o')
        }

        $drives = Get-WmiObject -Class Win32_LogicalDisk -Filter "DriveType = 3"
        
        foreach ($drive in $drives) {
            $driveStatus = @{
                label = if ($drive.VolumeName) { $drive.VolumeName } else { 'Unnamed' }
                deviceId = $drive.DeviceID
                protected = $false
                method = 'Unknown'
                details = ''
            }

            try {
                $fsutil = fsutil fsinfo encryptable $drive.DeviceID 2>&1
                if ($fsutil -match 'is encryptable: Yes') {
                    $driveStatus.method = 'EFS'
                    $driveStatus.protected = $true
                }
            } catch {
                $driveStatus.details = "Check failed: $($_.Exception.Message)"
            }

            $results.data[$drive.DeviceID] = $driveStatus
        }

        Write-Output (ConvertTo-Json -InputObject $results -Depth 10 -Compress)
    } catch {
        Write-Output (ConvertTo-Json -InputObject @{
            status = 'error'
            error = 'Encryption check failed'
            details = $_.Exception.Message
            timestamp = [DateTime]::UtcNow.ToString('o')
        } -Compress)
    }
`;

async function handleEncryptionCheck() {
    console.log('Starting encryption check...');
    return new Promise((resolve) => {
        const timeout = SYSTEM_CHECK_TIMEOUT;
        let timedOut = false;

        const timeoutId = setTimeout(() => {
            timedOut = true;
            console.error('Encryption check timed out after', timeout, 'ms');
            resolve({
                status: STATUS.ERROR,
                error: 'Encryptie controle duurde te lang',
                details: `Controle afgebroken na ${timeout} milliseconden`,
                timestamp: new Date().toISOString()
            });
        }, timeout);

        exec('powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "' + encryptionScript + '"', 
            { timeout: timeout, encoding: 'utf8' }, 
            async (error, stdout, stderr) => {
                if (timedOut) return;
                clearTimeout(timeoutId);

                console.log('Raw stdout:', stdout);

                if (error) {
                    const result = {
                        status: STATUS.ERROR,
                        error: 'Kon de encryptie status niet controleren',
                        details: error.message,
                        timestamp: new Date().toISOString()
                    };
                    await saveScanResult('encryption', result);
                    resolve(result);
                    return;
                }

                try {
                    const cleanOutput = stdout.trim();
                    if (!cleanOutput) {
                        throw new Error('Empty response from PowerShell');
                    }

                    const result = JSON.parse(cleanOutput);
                    await saveScanResult('encryption', result);
                    resolve(result);
                } catch (e) {
                    const result = {
                        status: STATUS.ERROR,
                        error: 'Ongeldige encryptie status data',
                        details: e.message,
                        timestamp: new Date().toISOString()
                    };
                    await saveScanResult('encryption', result);
                    resolve(result);
                }
            }
        );
    });
}

module.exports = { handleEncryptionCheck }; 