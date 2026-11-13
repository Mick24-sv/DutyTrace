param(
  [Parameter(Mandatory=$true)][string]$Email,
  [Parameter(Mandatory=$true)][string]$FullName
)
$ErrorActionPreference = 'Stop'
$setupRoot = Split-Path -Parent $PSScriptRoot
$setupScript = Join-Path $setupRoot 'src\db\createSuperadmin.js'
$setupPassword = Read-Host 'Choose the superadmin password (at least 10 characters)' -AsSecureString
$setupConfirmation = Read-Host 'Confirm the password' -AsSecureString
$setupPasswordPtr = [IntPtr]::Zero
$setupConfirmationPtr = [IntPtr]::Zero
$previousEmail = $env:SUPERADMIN_EMAIL
$previousName = $env:SUPERADMIN_NAME
$previousPassword = $env:SUPERADMIN_PASSWORD
try {
  $setupPasswordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($setupPassword)
  $setupConfirmationPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($setupConfirmation)
  $setupPlaintext = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($setupPasswordPtr)
  $setupConfirmPlaintext = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($setupConfirmationPtr)
  if ($setupPlaintext -cne $setupConfirmPlaintext) { throw 'Passwords do not match. No account was created.' }
  $env:SUPERADMIN_EMAIL = $Email
  $env:SUPERADMIN_NAME = $FullName
  $env:SUPERADMIN_PASSWORD = $setupPlaintext
  & node $setupScript
  if ($LASTEXITCODE -ne 0) { throw 'Superadmin setup did not complete. Review the message above.' }
} finally {
  $env:SUPERADMIN_EMAIL = $previousEmail
  $env:SUPERADMIN_NAME = $previousName
  $env:SUPERADMIN_PASSWORD = $previousPassword
  $setupPlaintext = $null
  $setupConfirmPlaintext = $null
  if ($setupPasswordPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($setupPasswordPtr) }
  if ($setupConfirmationPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($setupConfirmationPtr) }
  $setupPassword.Dispose()
  $setupConfirmation.Dispose()
}
