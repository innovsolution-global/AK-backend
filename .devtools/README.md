# .devtools — outils de développement local

Ce dossier contient les binaires et données de développement. **Il est ignoré par Git.**

## Démarrage

Tout se pilote depuis la racine du dépôt, en Node :

```bash
npm run dev          # infrastructure + API + frontend, dans un seul terminal
npm run dev:infra    # uniquement le stockage S3 et Mailpit
npm run dev:status   # état des cinq services
npm run dev:down     # arrête le stockage S3 et Mailpit
```

L'orchestrateur est [scripts/dev.mjs](../scripts/dev.mjs). Sans dépendance, il fonctionne
avant même `npm install` et sur Windows, macOS et Linux.

## Binaires attendus

| Fichier | Rôle | Source |
|---|---|---|
| `weed.exe` (ou `weed`) | Stockage objet S3 — SeaweedFS | [releases](https://github.com/seaweedfs/seaweedfs/releases), archive `windows_amd64.zip` |
| `mailpit.exe` (ou `mailpit`) | Capture SMTP | [releases](https://github.com/axllent/mailpit/releases), archive `mailpit-windows-amd64.zip` |
| `s3-config.json` | Identifiants S3 | générés localement, repris dans `backend/.env` |

Si un binaire manque, `npm run dev` le signale et continue sans lui.

## Pourquoi SeaweedFS et non MinIO

Le prompt maître (§2, §36) prévoit MinIO comme stockage objet de développement. En 2025, MinIO a
archivé ses projets communautaires : les binaires ne sont plus distribués et ne reçoivent plus de
correctifs de sécurité. SeaweedFS est actif et expose la même API S3.

**Le code applicatif est inchangé** : `StorageService` parle S3 via `@aws-sdk/client-s3`. Seules les
variables d'environnement diffèrent entre développement et production.

## Ports

Tous les services écoutent **uniquement sur 127.0.0.1** :

| Service | Port | Usage |
|---|---|---|
| S3 API | 8333 | utilisé par le backend (`S3_ENDPOINT`) |
| Filer | 8888 | navigation dans les fichiers stockés |
| Master | 9333 | supervision SeaweedFS |
| Volume | 8080 | stockage physique |
| SMTP | 1025 | destination des emails du backend |
| Mailpit UI | 8025 | http://127.0.0.1:8025 — lecture des emails capturés |

## Télémétrie

SeaweedFS remonte des statistiques anonymes **à partir de 10 Gio stockés**, seuil jamais atteint en
développement. L'option `-telemetry=false` n'existe que sur `weed master`, pas sur `weed server`.

## Données

`data/` contient les objets stockés, `mailpit.db` les emails capturés. Les supprimer remet ces
outils à zéro ; les métadonnées de documents resteront en base et leurs téléchargements échoueront.

## Production

Ni SeaweedFS, ni Mailpit, ni ce dossier n'ont vocation à être déployés. En production,
`S3_ENDPOINT` pointe vers S3, R2 ou équivalent, et `SMTP_*` vers un service transactionnel.
