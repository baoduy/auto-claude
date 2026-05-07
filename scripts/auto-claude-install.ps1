#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

function Test-ClaudeDesktopInstalled {
    $paths = @(
        (Join-Path $env:LOCALAPPDATA 'AnthropicClaude\Claude.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\claude\Claude.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Claude\Claude.exe'),
        (Join-Path $env:APPDATA      'Claude'),
        (Join-Path ${env:ProgramFiles} 'Claude\Claude.exe')
    )
    foreach ($p in $paths) {
        if ($p -and (Test-Path -LiteralPath $p)) { return $true }
    }

    try {
        if (Get-AppxPackage -Name '*Claude*' -ErrorAction SilentlyContinue) { return $true }
    } catch { }

    $uninstallKeys = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($key in $uninstallKeys) {
        try {
            $hit = Get-ItemProperty $key -ErrorAction SilentlyContinue |
                   Where-Object { $_.DisplayName -match 'Claude' }
            if ($hit) { return $true }
        } catch { }
    }

    return $false
}

if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Error "npx not found. Install Node.js 20+ first: https://nodejs.org/"
    exit 1
}

if (Test-ClaudeDesktopInstalled) {
    Write-Host "Claude Desktop detected on Windows. Running auto-claude default + update..."
    & npx @drunkcoding/auto-claude default
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & npx @drunkcoding/auto-claude update
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host "Done."
} else {
    Write-Host "Claude Desktop is not installed. Skipping auto-claude commands."
    exit 1
}
