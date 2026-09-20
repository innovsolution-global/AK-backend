/**
 * Crée le bucket applicatif s'il n'existe pas.
 *
 * Idempotent, et utilisable aussi bien en développement (SeaweedFS) qu'au
 * premier déploiement sur S3 : l'application ne crée jamais de bucket à la
 * volée, ce qui éviterait mal les fautes de frappe dans `S3_BUCKET`.
 *
 *   npm run storage:setup
 */
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { config as loadEnv } from 'dotenv';

loadEnv();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

async function main(): Promise<void> {
  const bucket = required('S3_BUCKET');
  const endpoint = required('S3_ENDPOINT');

  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: required('S3_ACCESS_KEY'),
      secretAccessKey: required('S3_SECRET_KEY'),
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  });

  console.log(`Stockage : ${endpoint}`);

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`  · bucket « ${bucket} » déjà présent`);
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`  ✓ bucket « ${bucket} » créé`);
  }

  // Vérifie le cycle complet écriture/suppression : un bucket existant mais
  // non inscriptible échouerait plus tard, au premier upload utilisateur.
  const probeKey = `.healthcheck/${Date.now()}.txt`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: probeKey,
      Body: Buffer.from('ak-immo storage probe'),
      ContentType: 'text/plain',
    }),
  );
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: probeKey }));

  console.log('  ✓ écriture et suppression vérifiées');
  console.log('\nStockage prêt.\n');
}

main().catch((error) => {
  console.error('\nÉchec de la configuration du stockage :', (error as Error).message);
  process.exitCode = 1;
});
