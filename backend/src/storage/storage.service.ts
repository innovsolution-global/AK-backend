import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { AppConfigService } from '../config/app-config.service';

export interface StoredObject {
  storageKey: string;
  size: number;
  mimeType: string;
}

/**
 * Accès au stockage objet (§25).
 *
 * Les fichiers ne sont jamais servis directement par l'API : le client reçoit
 * une **URL signée à durée limitée**, et la clé de stockage n'est jamais
 * exposée. Les clés sont opaques (UUID), ce qui interdit d'en deviner une autre
 * à partir d'une clé connue.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: S3Client;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    const { endpoint, region, accessKey, secretKey, forcePathStyle } =
      this.config.storage;

    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      // MinIO n'expose pas de sous-domaines par bucket : le chemin est requis
      // en développement, facultatif sur S3.
      forcePathStyle,
    });
  }

  /**
   * Construit une clé de stockage opaque.
   *
   * Le préfixe reste lisible pour l'exploitation (inventaire, purge), mais le
   * nom de fichier d'origine n'y figure pas : il pourrait contenir des
   * informations sensibles ou des caractères dangereux.
   */
  buildKey(prefix: string, originalName: string): string {
    const extension = extname(originalName).toLowerCase().slice(0, 10);
    return `${prefix.replace(/^\/+|\/+$/g, '')}/${randomUUID()}${extension}`;
  }

  async upload(
    storageKey: string,
    buffer: Buffer,
    mimeType: string,
    metadata: Record<string, string> = {},
  ): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.storage.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
        // Force le téléchargement : un HTML ou un SVG téléversé ne doit jamais
        // s'exécuter dans le navigateur sur l'origine du stockage.
        ContentDisposition: 'attachment',
        Metadata: metadata,
      }),
    );

    return { storageKey, size: buffer.length, mimeType };
  }

  /**
   * URL de téléchargement temporaire.
   *
   * `fileName` est renvoyé au navigateur via `response-content-disposition`,
   * ce qui permet de restituer le nom d'origine sans l'avoir stocké dans la clé.
   */
  async getSignedDownloadUrl(
    storageKey: string,
    fileName: string,
    inline = false,
  ): Promise<{ url: string; expiresIn: number }> {
    const disposition = inline ? 'inline' : 'attachment';
    const expiresIn = this.config.storage.signedUrlTtl;

    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.storage.bucket,
        Key: storageKey,
        ResponseContentDisposition: `${disposition}; filename="${sanitizeFileName(fileName)}"`,
      }),
      { expiresIn },
    );

    return { url, expiresIn };
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.storage.bucket,
        Key: storageKey,
      }),
    );
  }

  /**
   * Supprime un objet sans propager l'erreur.
   * Utilisé pour nettoyer un fichier déjà téléversé quand la transaction
   * métier échoue ensuite : l'échec du nettoyage ne doit pas masquer la cause
   * initiale.
   */
  async deleteQuietly(storageKey: string): Promise<void> {
    try {
      await this.delete(storageKey);
    } catch (error) {
      this.logger.warn(
        `Nettoyage impossible pour ${storageKey} : ${(error as Error).message}`,
      );
    }
  }

  /** Vérifie l'accès au bucket — exposé par `/api/health`. */
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.config.storage.bucket }),
      );
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Neutralise les caractères qui casseraient l'en-tête `Content-Disposition`
 * ou permettraient une traversée de répertoire côté client.
 */
function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[\r\n"\\]/g, '')
    .replace(/[/\\]/g, '_')
    .slice(0, 200);
}
