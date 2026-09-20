# 4. Architecture des modules NestJS — AK IMMO

## 4.1 Arborescence

```
backend/src/
├── main.ts                     # bootstrap : Helmet, CORS, pipes, Swagger
├── app.module.ts               # composition racine
│
├── config/
│   ├── configuration.ts        # typage des variables d'environnement
│   ├── env.validation.ts       # validation Zod au démarrage (fail-fast)
│   └── config.module.ts
│
├── common/
│   ├── decorators/             # @CurrentUser @Roles @RequirePermissions @Public @Audit
│   ├── dto/                    # PaginationQueryDto, PaginatedResult, IdParamDto
│   ├── filters/                # AllExceptionsFilter (§39)
│   ├── guards/                 # JwtAuthGuard, RolesGuard, PermissionsGuard
│   ├── interceptors/           # ResponseEnvelope, AuditLog, Timeout, Logging
│   ├── pipes/                  # ParseUuidPipe, TrimPipe
│   ├── services/               # ScopeService (périmètres), ReferenceService
│   └── utils/                  # crypto, pagination, slug, fichiers
│
├── prisma/
│   ├── prisma.module.ts        # @Global
│   └── prisma.service.ts       # connexion, soft-delete helpers, $transaction
│
├── auth/                       # login, logout, refresh, mots de passe, activation
├── users/
├── roles/
├── permissions/
├── locations/
├── sites/
├── properties/
├── property-documents/
├── property-shares/            # + shared-access (accès bénéficiaire)
├── maps/
├── projects/
├── project-components/
├── project-documents/
├── building-permits/
├── project-status/
├── companies/
├── notifications/
├── mail/                       # templates + transport SMTP
├── storage/                    # abstraction S3/MinIO, URLs signées
├── audit/
├── dashboard/
├── search/                     # recherche globale (§24)
├── uploads/                    # validation fichiers (extension, MIME, magic bytes)
└── tasks/                      # @nestjs/schedule : expiration partages, alertes permis
```

## 4.2 Anatomie d'un module

Chaque module métier suit la même structure, ce qui rend le code prévisible :

```
properties/
├── properties.module.ts
├── properties.controller.ts     # HTTP uniquement : routes, guards, Swagger
├── properties.service.ts        # règles métier, transactions, scope
├── properties.repository.ts     # accès Prisma, requêtes, pagination
├── dto/
│   ├── create-property.dto.ts
│   ├── update-property.dto.ts
│   ├── query-properties.dto.ts
│   └── property-response.dto.ts
├── entities/property.entity.ts  # modèle de sortie Swagger
└── properties.service.spec.ts
```

**Règle de dépendance** : `Controller → Service → Repository → PrismaService`.
Un contrôleur ne touche jamais Prisma ; un repository ne contient jamais de règle métier.

## 4.3 Modules transverses

| Module | Rôle | Exporté |
|---|---|---|
| `PrismaModule` | client Prisma partagé, `@Global()` | `PrismaService` |
| `ConfigModule` | configuration validée, `@Global()` | `AppConfigService` |
| `CommonModule` | `ScopeService`, `ReferenceService`, utilitaires | oui |
| `StorageModule` | upload/download S3, URLs signées, suppression | `StorageService` |
| `UploadsModule` | validation des fichiers avant stockage | `FileValidationService` |
| `MailModule` | rendu des templates + envoi SMTP | `MailService` |
| `AuditModule` | écriture des `audit_logs` + `AuditInterceptor` | `AuditService` |
| `NotificationsModule` | notifications in-app + déclenchement email | `NotificationsService` |
| `TasksModule` | tâches planifiées (cron) | — |

## 4.4 Chaîne de traitement d'une requête

```
Requête
  → Helmet · CORS · compression · ThrottlerGuard (rate limit)
  → JwtAuthGuard        (sauf @Public)
  → RolesGuard          (@Roles)
  → PermissionsGuard    (@RequirePermissions)
  → ValidationPipe      (DTO, whitelist: true, forbidNonWhitelisted: true)
  → Controller → Service (scope + règles métier, transactions) → Repository
  → ResponseEnvelopeInterceptor   ({ success, data, meta })
  → AuditInterceptor              (écrit audit_logs pour les actions déclarées)
  ← Réponse
      (toute exception ⇒ AllExceptionsFilter ⇒ format §39)
```

## 4.5 Points d'attention par module

### `auth`
`AuthService` (login/refresh/logout), `PasswordService` (Argon2id), `TokenService` (JWT + rotation),
`JwtStrategy`, `JwtRefreshStrategy`. Toutes les routes sont `@Public()` sauf `/auth/me`,
`/auth/change-password` et `/auth/logout`.

### `properties`
Transaction à la création : génération de la référence via séquence, insertion du terrain,
insertion des coordonnées, affectation des gestionnaires, entrée d'audit. Vérifie la cohérence
`site.locationId === property.locationId`.

### `property-shares`
Génère un token aléatoire de 32 octets, stocke son SHA-256, envoie l'email d'invitation contenant le
lien d'activation. L'activation crée le compte `UTILISATEUR_PARTAGE`, laisse le bénéficiaire définir
son mot de passe, passe le partage à `ACTIVE`. Révocation : `REVOKED` + `tokenVersion++` sur le
compte bénéficiaire pour invalider ses sessions en cours.

### `project-status`
Le changement de statut et l'écriture de `project_status_history` se font dans la **même
transaction**. Aucune route ne permet de modifier ou supprimer l'historique.

### `tasks`
- Toutes les heures : passage à `EXPIRED` des partages échus, désactivation des comptes associés.
- Quotidien : notification des partages expirant sous 7 jours et des permis expirant sous 30 jours.
- Quotidien : purge des `temporary_access_tokens` et `refresh_tokens` expirés depuis plus de 30 jours.
