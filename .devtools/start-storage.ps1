# Démarre le stockage objet S3 de développement (SeaweedFS).
#
# Écoute exclusivement sur 127.0.0.1 : sans `-ip.bind`, SeaweedFS s'attache à
# l'adresse réseau de la machine et exposerait le stockage — et ses identifiants
# — à tout le réseau local.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

if (Get-Process -Name weed -ErrorAction SilentlyContinue) {
    Write-Host "SeaweedFS est déjà démarré." -ForegroundColor Yellow
    exit 0
}

$dataDir = Join-Path $root 'data'
$config  = Join-Path $root 's3-config.json'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

# Les arguments sont construits dans un tableau : une expression entre
# parenthèses placée directement après « = » n'est pas évaluée par PowerShell
# et le chemin arriverait vide.
$arguments = @(
    'server'
    "-dir=$dataDir"
    '-ip=127.0.0.1'
    '-ip.bind=127.0.0.1'
    '-s3'
    "-s3.config=$config"
    '-master.port=9333'
    '-volume.port=8080'
    '-filer.port=8888'
    '-volume.max=10'
)

& (Join-Path $root 'weed.exe') @arguments
