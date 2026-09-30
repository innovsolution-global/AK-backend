/**
 * Pose un mot de passe connu sur un compte — outil de développement.
 *
 *   npm run user:password --workspace backend -- adresse@exemple.com 'MotDePasse!2026'
 *
 * Deux usages : reprendre la main sur un compte de démonstration, et donner
 * aux tests de bout en bout une session de bénéficiaire. Le mot de passe d'un
 * partage ne circule que par email — aucune route de l'API ne le renvoie, et
 * il ne doit pas en exister : le test ne peut donc pas le connaître autrement.
 *
 * Le script écrit directement en base, comme le seed : il n'ouvre aucune route
 * et refuse de s'exécuter hors développement. Les sessions ouvertes du compte
 * sont invalidées au passage (`tokenVersion`).
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Interdit en production : le mot de passe passe par la ligne de commande.');
  }

  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    throw new Error("Usage : npm run user:password -- <email> <mot de passe>");
  }

  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase(), deletedAt: null },
    select: { id: true, email: true },
  });

  if (!user) {
    throw new Error(`Aucun compte actif pour ${email}.`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await argon2.hash(password, ARGON2_OPTIONS),
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      // Les sessions ouvertes avec l'ancien mot de passe tombent.
      tokenVersion: { increment: 1 },
    },
  });

  // Le mot de passe n'est jamais réaffiché : il est déjà dans l'historique du
  // terminal de celui qui l'a saisi, inutile de l'y remettre.
  console.log(`Mot de passe remplacé pour ${user.email}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
