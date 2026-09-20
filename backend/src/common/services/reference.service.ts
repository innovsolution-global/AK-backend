import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const PROPERTY_REFERENCE_PREFIX = 'AK-IMM';
export const PROJECT_REFERENCE_PREFIX = 'AK-PRJ';
export const REFERENCE_PADDING = 6;

/**
 * Génération des références métier : `AK-IMM-000001`, `AK-PRJ-000001` (§9, §14).
 *
 * S'appuie sur une séquence PostgreSQL et non sur un `MAX(reference) + 1` :
 * deux créations simultanées obtiendraient sinon la même référence, et l'index
 * unique ferait échouer l'une des deux transactions.
 */
@Injectable()
export class ReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async nextPropertyReference(tx?: Prisma.TransactionClient): Promise<string> {
    return this.next('property_reference_seq', PROPERTY_REFERENCE_PREFIX, tx);
  }

  async nextProjectReference(tx?: Prisma.TransactionClient): Promise<string> {
    return this.next('project_reference_seq', PROJECT_REFERENCE_PREFIX, tx);
  }

  private async next(
    sequence: string,
    prefix: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const client = tx ?? this.prisma;

    // Le nom de séquence provient exclusivement de constantes internes ; il
    // n'est jamais construit à partir d'une entrée utilisateur.
    const rows = await client.$queryRawUnsafe<Array<{ value: bigint }>>(
      `SELECT nextval('${sequence}') AS value`,
    );

    const value = rows[0]?.value ?? BigInt(1);
    return `${prefix}-${value.toString().padStart(REFERENCE_PADDING, '0')}`;
  }
}
