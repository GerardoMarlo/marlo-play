$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot '..\.dev.vars.sandbox'
if (Test-Path -LiteralPath $target) { throw 'El archivo ya existe. No se sobrescribió; solicita actualizarlo de forma segura.' }
$client = Read-Host 'Skydropx SANDBOX Client ID' -AsSecureString
$secret = Read-Host 'Skydropx SANDBOX Client Secret' -AsSecureString
function Reveal-ForFile([Security.SecureString]$value) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
try {
  $idText = Reveal-ForFile $client
  $secretText = Reveal-ForFile $secret
  if (!$idText -or !$secretText) { throw 'Ambos valores son obligatorios.' }
  $lines = @('SKYDROPX_ENVIRONMENT="sandbox"', ('SKYDROPX_CLIENT_ID=' + ($idText | ConvertTo-Json -Compress)), ('SKYDROPX_CLIENT_SECRET=' + ($secretText | ConvertTo-Json -Compress)))
  [IO.File]::WriteAllLines([IO.Path]::GetFullPath($target), $lines)
  Write-Host 'Credenciales sandbox guardadas en archivo local ignorado por Git. No se mostraron valores.'
} finally { $client.Dispose(); $secret.Dispose(); $idText=$null; $secretText=$null; $lines=$null }
