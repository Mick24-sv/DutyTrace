$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$envPath = Join-Path $repoRoot 'backend\.env'
if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
  throw 'backend/.env was not found. Create it from backend/.env.example first.'
}

git -C $repoRoot check-ignore --quiet -- backend/.env
if ($LASTEXITCODE -ne 0) {
  throw 'Safety check failed: backend/.env is not ignored by Git; no file was changed.'
}

$lines = [System.IO.File]::ReadAllLines($envPath)
$productionLine = $lines | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $productionLine) {
  throw 'DATABASE_URL is not configured in backend/.env; no file was changed.'
}

$productionUrl = ($productionLine -replace '^\s*DATABASE_URL\s*=\s*', '').Trim()
try {
  $productionUri = [Uri]$productionUrl
} catch {
  throw 'The configured production database URL could not be parsed; no file was changed.'
}

$testUri = [Uri]'postgresql://postgres@localhost:5432/dutytrace_test'
if ($productionUri.Host -eq $testUri.Host -and $productionUri.Port -eq $testUri.Port -and $productionUri.AbsolutePath -eq $testUri.AbsolutePath) {
  throw 'Safety check failed: the local test database target matches DATABASE_URL; no file was changed.'
}

$securePassword = Read-Host 'Enter the LOCAL PostgreSQL password for user postgres (input is hidden)' -AsSecureString
if ($securePassword.Length -eq 0) {
  throw 'No local password was entered; no file was changed.'
}

$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $encodedPassword = [Uri]::EscapeDataString($password)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $securePassword.Dispose()
  $password = $null
}

$testUrl = "postgresql://postgres:${encodedPassword}@localhost:5432/dutytrace_test"
$updatedLines = @($lines | Where-Object {
    $_ -notmatch '^\s*TEST_DATABASE_URL\s*=' -and
    $_ -notmatch '^\s*TEST_DATABASE_SSL\s*=' -and
    $_ -notmatch '^\s*TEST_DATABASE_SSL_CA\s*='
  })
$updatedLines += "TEST_DATABASE_URL=$testUrl"
$updatedLines += 'TEST_DATABASE_SSL=false'
$updatedLines += 'TEST_DATABASE_SSL_CA='
[System.IO.File]::WriteAllLines($envPath, $updatedLines, [System.Text.UTF8Encoding]::new($false))

$encodedPassword = $null
$testUrl = $null
Write-Output 'Local test database settings were saved to ignored backend/.env. DATABASE_URL was preserved.'
