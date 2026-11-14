param(
  [Parameter(Mandatory=$true)][ValidateSet('mercadopago','paypal','resend','skydropx','turnstile','access')][string]$Provider,
  [Parameter(Mandatory=$true)][ValidateSet('sandbox','production')][string]$Environment
)
$ErrorActionPreference='Stop'
$target=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot ('..\.dev.vars.'+$Environment)))
$fields=@{
 mercadopago=@('MP_PUBLIC_KEY','MP_ACCESS_TOKEN','MP_WEBHOOK_SECRET')
 paypal=@('PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_WEBHOOK_ID')
 resend=@('RESEND_API_KEY','EMAIL_FROM')
 skydropx=@('SKYDROPX_CLIENT_ID','SKYDROPX_CLIENT_SECRET','SKYDROPX_WEBHOOK_SECRET')
 turnstile=@('TURNSTILE_SITE_KEY','TURNSTILE_SECRET')
 access=@('ACCESS_TEAM_DOMAIN','ACCESS_AUD','ADMIN_EMAILS')
}
$lines=if(Test-Path -LiteralPath $target){@(Get-Content -LiteralPath $target)}else{@()}
foreach($name in $fields[$Provider]) {
  $value=Read-Host "$name ($Environment; Enter conserva el valor existente)" -AsSecureString
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($value)
  try {
    $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    if($plain) {
      $plain=$plain.Trim()
      if($name -eq 'ACCESS_TEAM_DOMAIN' -and $plain -notmatch '^[a-zA-Z0-9-]+\.cloudflareaccess\.com$') { throw 'ACCESS_TEAM_DOMAIN debe ser el dominio de equipo terminado en .cloudflareaccess.com, sin https:// y sin correo.' }
      if($name -eq 'ACCESS_AUD' -and $plain -notmatch '^[a-fA-F0-9]{64}$') { throw 'ACCESS_AUD debe ser el identificador de audiencia de 64 caracteres.' }
      if($name -eq 'ADMIN_EMAILS' -and @($plain.Split(',') | Where-Object { $_.Trim() -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$' }).Count -gt 0) { throw 'ADMIN_EMAILS requiere correos completos separados por comas.' }
      $lines=@($lines | Where-Object { !$_.StartsWith($name+'=') })
      $lines+=($name+'='+($plain | ConvertTo-Json -Compress))
    }
  } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$value.Dispose();$plain=$null }
}
if($Provider -eq 'paypal' -or $Provider -eq 'skydropx') {
 $name=if($Provider -eq 'paypal'){'PAYPAL_ENVIRONMENT'}else{'SKYDROPX_ENVIRONMENT'}
 $envValue=if($Provider -eq 'paypal' -and $Environment -eq 'production'){'live'}else{$Environment}
 $lines=@($lines | Where-Object { !$_.StartsWith($name+'=') })
 $lines+=($name+'="'+$envValue+'"')
}
[IO.File]::WriteAllLines($target,$lines)
$lines=$null
Write-Host 'Configuración guardada en archivo privado ignorado por Git. No se activaron pagos ni envíos.'
