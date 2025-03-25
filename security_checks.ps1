# Security Checks Script
# This script performs various security checks and returns results in JSON format

# Function to write log messages
function Write-SecurityLog {
    param(
        [string]$Component,
        [string]$Message,
        [string]$Status = "Info"
    )
    $timestamp = (Get-Date).ToString('o')
    Write-Host "[$timestamp] [$Status] [$Component] $Message"
}

# Function to convert results to JSON and handle errors
function ConvertTo-SafeJson {
    param($InputObject)
    try {
        Write-SecurityLog -Component "JSON" -Message "Converting results to JSON" -Status "Info"
        $json = $InputObject | ConvertTo-Json -Depth 10 -Compress
        Write-SecurityLog -Component "JSON" -Message "Successfully converted to JSON" -Status "Success"
        return $json
    } catch {
        Write-SecurityLog -Component "JSON" -Message "Failed to convert to JSON: $($_.Exception.Message)" -Status "Error"
        return '{"error": "Could not convert to JSON"}'
    }
}

# Check Antivirus Status
function Get-AntivirusStatus {
    Write-SecurityLog -Component "Antivirus" -Message "Checking antivirus status" -Status "Info"
    try {
        $status = Get-MpComputerStatus | Select-Object -Property AMServiceEnabled,AntispywareEnabled,AntivirusEnabled,RealTimeProtectionEnabled
        Write-SecurityLog -Component "Antivirus" -Message "Successfully retrieved antivirus status" -Status "Success"
        return @{
            status = 'success'
            data = $status
            timestamp = (Get-Date).ToString('o')
        }
    } catch {
        return @{
            status = 'error'
            error = 'Could not check antivirus status'
            details = $_.Exception.Message
            timestamp = (Get-Date).ToString('o')
        }
    }
}

# Check Windows Update Status
function Get-WindowsUpdateStatus {
    Write-SecurityLog -Component "WindowsUpdate" -Message "Checking Windows Update status" -Status "Info"
    try {
        $updateSession = New-Object -ComObject Microsoft.Update.Session
        $updateSearcher = $updateSession.CreateUpdateSearcher()
        $searchResult = $updateSearcher.Search("IsInstalled=0")
        
        $pendingUpdates = @{
            count = $searchResult.Updates.Count
            lastSearchTime = $updateSearcher.GetTotalHistoryCount()
            lastInstallTime = (Get-Item (Join-Path $env:SystemRoot 'WindowsUpdate.log') -ErrorAction SilentlyContinue).LastWriteTime
        }
        Write-SecurityLog -Component "WindowsUpdate" -Message "Found $($pendingUpdates.count) pending updates" -Status "Success"

        return @{
            status = 'success'
            data = $pendingUpdates
            source = 'com_object'
            timestamp = (Get-Date).ToString('o')
        }
    } catch {
        return @{
            status = 'error'
            error = 'Could not check Windows Update status'
            details = $_.Exception.Message
            timestamp = (Get-Date).ToString('o')
        }
    }
}

# Check Firewall Status
function Get-FirewallStatus {
    Write-SecurityLog -Component "Firewall" -Message "Checking firewall status" -Status "Info"
    try {
        $status = Get-NetFirewallProfile | Select-Object -Property Name,Enabled
        Write-SecurityLog -Component "Firewall" -Message "Successfully retrieved firewall status" -Status "Success"
        return @{
            status = 'success'
            data = $status
            timestamp = (Get-Date).ToString('o')
        }
    } catch {
        return @{
            status = 'error'
            error = 'Could not check firewall status'
            details = $_.Exception.Message
            timestamp = (Get-Date).ToString('o')
        }
    }
}

# Check Backup Status with Timeout Protection
function Get-BackupStatus {
    Write-SecurityLog -Component "Backup" -Message "Starting backup systems status check" -Status "Info"
    $results = @{}
    $timeout = 10 # Timeout in seconds
    
    # Check Volume Shadow Copy Service status with timeout
    $job = Start-Job -ScriptBlock {
        try {
            $vss = Get-Service -Name VSS -ErrorAction Stop
            @{
                status = $vss.Status
                startType = $vss.StartType
                error = $null
            }
        } catch {
            @{
                status = 'unknown'
                error = $_.Exception.Message
            }
        }
    }
    
    $completed = Wait-Job $job -Timeout $timeout
    if ($completed) {
        $results.vss_status = Receive-Job -Job $job
        Write-SecurityLog -Component "Backup" -Message "VSS Service Status: $($results.vss_status.status)" -Status "Info"
    } else {
        Stop-Job $job
        $results.vss_status = @{
            status = 'timeout'
            error = "Operation timed out after $timeout seconds"
        }
        Write-SecurityLog -Component "Backup" -Message "VSS check timed out" -Status "Warning"
    }
    Remove-Job $job -Force

    # Check System Restore status using registry
    try {
        $systemRestoreKey = Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore" -ErrorAction Stop
        $results.systemRestore = @{
            enabled = $systemRestoreKey.RPSessionInterval -gt 0
            lastRestorePoint = (Get-Date).AddDays(-$systemRestoreKey.RPLifeInterval).ToString('o')
        }
    } catch {
        $results.systemRestore = @{
            enabled = $false
            error = "Could not determine System Restore status"
        }
    }

    # Check File History using alternative method
    try {
        $fhPath = "$env:USERPROFILE\AppData\Local\Microsoft\Windows\FileHistory"
        $fhConfig = Test-Path $fhPath
        $results.fileHistory = @{
            configured = $fhConfig
            path = if ($fhConfig) { $fhPath } else { $null }
        }
    } catch {
        $results.fileHistory = @{
            configured = $false
            error = "Could not check File History status"
        }
    }

    return @{
        status = 'completed'
        data = $results
        timestamp = (Get-Date).ToString('o')
    }
}

# Check Encryption Status
function Get-EncryptionStatus {
    Write-SecurityLog -Component "Encryption" -Message "Checking encryption status" -Status "Info"
    try {
        # First try to get BitLocker status using Get-CimInstance which requires less privileges
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
                # If BitLocker check fails, try alternative encryption check
                $fsutil = & fsutil behavior query EncryptPagingFile 2>&1
                $encryptionStatus[$volume.DriveLetter] = @{
                    label = $volume.Label
                    protected = $fsutil -match 'EncryptPagingFile = 1'
                    method = 'System'
                }
            }
        }

        Write-SecurityLog -Component "Encryption" -Message "Successfully retrieved encryption status using available methods" -Status "Success"
        return @{
            status = 'success'
            data = $encryptionStatus
            timestamp = (Get-Date).ToString('o')
        }
    } catch {
        Write-SecurityLog -Component "Encryption" -Message "Failed to check encryption status: $($_.Exception.Message)" -Status "Error"
        return @{
            status = 'warning'
            error = 'Limited encryption status check available'
            details = "Run script as administrator for full encryption status"
            timestamp = (Get-Date).ToString('o')
        }
    }
}

# Check Network Security
function Get-NetworkSecurityStatus {
    Write-SecurityLog -Component "Network" -Message "Checking network security status" -Status "Info"
    try {
        $status = Get-NetConnectionProfile -ErrorAction SilentlyContinue | 
                 Select-Object -Property NetworkCategory,IPv4Connectivity,IPv6Connectivity
        if ($status) {
            return @{
                status = 'completed'
                data = @{
                    available = $true
                    profile = $status
                }
                timestamp = (Get-Date).ToString('o')
            }
        } else {
            return @{
                status = 'completed'
                warning = 'Network security could not be checked'
                data = @{
                    available = $false
                    reason = 'no_data'
                }
                timestamp = (Get-Date).ToString('o')
            }
        }
    } catch {
        return @{
            status = 'completed'
            warning = 'Network security could not be checked'
            data = @{
                available = $false
                reason = 'error'
            }
            timestamp = (Get-Date).ToString('o')
        }
    }
}

# Run all checks and return results
$results = @{
    antivirus = Get-AntivirusStatus
    windows_update = Get-WindowsUpdateStatus
    firewall = Get-FirewallStatus
    backup = Get-BackupStatus
    encryption = Get-EncryptionStatus
    network_security = Get-NetworkSecurityStatus
}

# Convert results to JSON
ConvertTo-SafeJson -InputObject $results