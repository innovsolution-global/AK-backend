# Démarre le capteur SMTP de développement (Mailpit).
#
# Aucun email ne quitte la machine : tout est intercepté et consultable sur
# http://127.0.0.1:8025. Indispensable pour vérifier les invitations de partage,
# dont le token n'existe que dans le message envoyé.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

if (Get-Process -Name mailpit -ErrorAction SilentlyContinue) {
    Write-Host "Mailpit est déjà démarré." -ForegroundColor Yellow
    exit 0
}

$arguments = @(
    '--smtp=127.0.0.1:1025'
    '--listen=127.0.0.1:8025'
    '--database=' + (Join-Path $root 'mailpit.db')
    '--max=500'
    '--smtp-auth-accept-any'
    '--smtp-auth-allow-insecure'
)

& (Join-Path $root 'mailpit.exe') @arguments
