const { exec } = require('child_process');
const { STATUS, SYSTEM_CHECK_TIMEOUT } = require('../constants');
const { saveScanResult } = require('../database/scanResults');

const networkScript = `
    $ErrorActionPreference = 'Stop'
    try {
        $results = @{
            status = 'success'
            data = @{
                networkAdapters = @()
                dnsServers = @()
                connections = @()
                firewall = @{}
            }
            timestamp = [DateTime]::UtcNow.ToString('o')
        }

        # Get network adapters
        Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
            $adapter = @{
                name = $_.Name
                description = $_.InterfaceDescription
                status = $_.Status
                speed = $_.LinkSpeed
                macAddress = $_.MacAddress
            }
            $results.data.networkAdapters += $adapter
        }

        # Get DNS servers
        Get-DnsClientServerAddress | Where-Object { $_.AddressFamily -eq 2 } | ForEach-Object {
            $dnsInfo = @{
                interfaceAlias = $_.InterfaceAlias
                serverAddresses = $_.ServerAddresses
            }
            $results.data.dnsServers += $dnsInfo
        }

        # Get active connections (limited to 10 to prevent overload)
        Get-NetTCPConnection -State Established | Select-Object -First 10 | ForEach-Object {
            $connection = @{
                localAddress = $_.LocalAddress
                localPort = $_.LocalPort
                remoteAddress = $_.RemoteAddress
                remotePort = $_.RemotePort
                state = $_.State
                owningProcess = $_.OwningProcess
            }
            $results.data.connections += $connection
        }

        # Get firewall status
        $firewall = Get-NetFirewallProfile
        $results.data.firewall = @{
            domain = @{
                enabled = ($firewall | Where-Object { $_.Name -eq 'Domain' }).Enabled
                defaultInboundAction = ($firewall | Where-Object { $_.Name -eq 'Domain' }).DefaultInboundAction
            }
            private = @{
                enabled = ($firewall | Where-Object { $_.Name -eq 'Private' }).Enabled
                defaultInboundAction = ($firewall | Where-Object { $_.Name -eq 'Private' }).DefaultInboundAction
            }
            public = @{
                enabled = ($firewall | Where-Object { $_.Name -eq 'Public' }).Enabled
                defaultInboundAction = ($firewall | Where-Object { $_.Name -eq 'Public' }).DefaultInboundAction
            }
        }

        Write-Output (ConvertTo-Json -InputObject $results -Depth 10 -Compress)
    } catch {
        Write-Output (ConvertTo-Json -InputObject @{
            status = 'error'
            error = 'Network security check failed'
            details = $_.Exception.Message
            timestamp = [DateTime]::UtcNow.ToString('o')
        } -Compress)
    }
`;

async function handleNetworkCheck() {
    console.log('Starting network security check...');
    return new Promise((resolve) => {
        const timeout = SYSTEM_CHECK_TIMEOUT;
        let timedOut = false;

        const timeoutId = setTimeout(() => {
            timedOut = true;
            console.error('Network check timed out after', timeout, 'ms');
            const result = {
                status: STATUS.ERROR,
                error: 'Netwerkbeveiliging controle duurde te lang',
                details: `Controle afgebroken na ${timeout} milliseconden`,
                timestamp: new Date().toISOString()
            };
            saveScanResult('network', result);
            resolve(result);
        }, timeout);

        exec('powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "' + networkScript + '"', 
            { timeout: timeout, encoding: 'utf8' }, 
            async (error, stdout, stderr) => {
                if (timedOut) return;
                clearTimeout(timeoutId);

                console.log('Network check raw output:', stdout);

                if (error) {
                    const result = {
                        status: STATUS.ERROR,
                        error: 'Kon de netwerkbeveiliging niet controleren',
                        details: error.message,
                        timestamp: new Date().toISOString()
                    };
                    await saveScanResult('network', result);
                    resolve(result);
                    return;
                }

                try {
                    const cleanOutput = stdout.trim();
                    if (!cleanOutput) {
                        throw new Error('Empty response from PowerShell');
                    }

                    const result = JSON.parse(cleanOutput);
                    await saveScanResult('network', result);
                    resolve(result);
                } catch (e) {
                    const result = {
                        status: STATUS.ERROR,
                        error: 'Ongeldige netwerkbeveiliging data',
                        details: e.message,
                        timestamp: new Date().toISOString()
                    };
                    await saveScanResult('network', result);
                    resolve(result);
                }
            }
        );
    });
}

module.exports = { handleNetworkCheck }; 