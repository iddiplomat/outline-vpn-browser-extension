param(
    [Parameter(Mandatory=$true, HelpMessage="Outline access key (ss://...)")]
    [string]$SsKey,

    [int]$LocalPort = 1080
)

$ErrorActionPreference = "Stop"

function Parse-SsKey {
    param([string]$Key)

    $cleaned = $Key.Trim()
    if (-not $cleaned.StartsWith("ss://")) {
        throw "Invalid key: must start with ss://"
    }

    $withoutScheme = $cleaned.Substring(5)
    $atIdx = $withoutScheme.LastIndexOf('@')

    if ($atIdx -gt 0) {
        $b64Part = $withoutScheme.Substring(0, $atIdx)
        $serverPart = ($withoutScheme.Substring($atIdx + 1) -split '[/?#]')[0]

        $padded = $b64Part
        switch ($padded.Length % 4) {
            2 { $padded += "==" }
            3 { $padded += "=" }
        }
        $userInfo = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($padded))

        $colonIdx = $userInfo.IndexOf(':')
        $method = $userInfo.Substring(0, $colonIdx)
        $password = $userInfo.Substring($colonIdx + 1)

        $lastColon = $serverPart.LastIndexOf(':')
        $remoteHost = $serverPart.Substring(0, $lastColon)
        $port = [int]$serverPart.Substring($lastColon + 1)
    } else {
        $b64 = ($withoutScheme -split '[/?#]')[0]
        $padded = $b64
        switch ($padded.Length % 4) {
            2 { $padded += "==" }
            3 { $padded += "=" }
        }
        $decoded = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($padded))

        if ($decoded -match '^(.+?):(.+)@(.+):(\d+)$') {
            $method = $Matches[1]
            $password = $Matches[2]
            $remoteHost = $Matches[3]
            $port = [int]$Matches[4]
        } else {
            throw "Cannot parse ss:// key"
        }
    }

    return @{
        Method = $method
        Password = $password
        RemoteHost = $remoteHost
        Port = $port
    }
}

function Get-SsLocal {
    $sslocal = Join-Path $PSScriptRoot "sslocal.exe"
    if (Test-Path $sslocal) {
        return $sslocal
    }

    $inPath = Get-Command sslocal -ErrorAction SilentlyContinue
    if ($inPath) {
        return $inPath.Source
    }

    Write-Host ""
    Write-Host "sslocal.exe not found." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Download shadowsocks-rust from:"
    Write-Host "  https://github.com/shadowsocks/shadowsocks-rust/releases" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Extract sslocal.exe into this folder:" -ForegroundColor White
    Write-Host "  $PSScriptRoot" -ForegroundColor Cyan
    Write-Host ""

    $answer = Read-Host "Download automatically? (y/n)"
    if ($answer -ne 'y') {
        exit 1
    }

    Write-Host "Fetching latest release..." -ForegroundColor Gray
    $releaseInfo = Invoke-RestMethod "https://api.github.com/repos/shadowsocks/shadowsocks-rust/releases/latest"
    $asset = $releaseInfo.assets | Where-Object { $_.name -match "x86_64-pc-windows-msvc\.zip$" } | Select-Object -First 1

    if (-not $asset) {
        Write-Host "Could not find Windows release asset." -ForegroundColor Red
        exit 1
    }

    $zipPath = Join-Path $PSScriptRoot "ss-rust.zip"
    Write-Host "Downloading $($asset.name)..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath

    Write-Host "Extracting..." -ForegroundColor Gray
    Expand-Archive -Path $zipPath -DestinationPath $PSScriptRoot -Force

    Remove-Item $zipPath -Force

    if (Test-Path $sslocal) {
        Write-Host "sslocal.exe ready." -ForegroundColor Green
        return $sslocal
    }

    Write-Host "sslocal.exe not found after extraction. Check the archive contents." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Outline VPN Local Proxy ===" -ForegroundColor Green
Write-Host ""

$parsed = Parse-SsKey -Key $SsKey

Write-Host "Server:     $($parsed.RemoteHost):$($parsed.Port)"
Write-Host "Method:     $($parsed.Method)"
Write-Host "Local port: 127.0.0.1:$LocalPort"
Write-Host ""

$sslocal = Get-SsLocal

Write-Host "Starting local SOCKS5 proxy..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

& $sslocal `
    -b "127.0.0.1:$LocalPort" `
    -s "$($parsed.RemoteHost):$($parsed.Port)" `
    -k $parsed.Password `
    -m $parsed.Method
