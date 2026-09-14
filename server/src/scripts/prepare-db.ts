/**
 * CLN-03: container start step — applies Prisma migrations instead of `prisma db push`
 * (db push can silently drop columns/data when the schema changes).
 *
 * Databases created by the old `db push` start already have all tables but no
 * `_prisma_migrations` table. They are baselined once: `0_init` (the schema as it was when
 * migrations were introduced) is marked as applied, then `migrate deploy` runs the rest.
 *
 * Run: node dist/scripts/prepare-db.js   (Dockerfile CMD does this before `npm start`)
 */
import { execFileSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const BASELINE_MIGRATION = '0_init';

function prismaCli(args: string[]) {
    execFileSync('npx', ['prisma', ...args], { stdio: 'inherit' });
}

async function main() {
    const prisma = new PrismaClient();
    let hasMigrationsTable = false;
    let hasAppTables = false;
    try {
        const rows = await prisma.$queryRaw<{ name: string }[]>`
            SELECT TABLE_NAME AS name FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('_prisma_migrations', 'User')`;
        hasMigrationsTable = rows.some((r) => r.name === '_prisma_migrations');
        hasAppTables = rows.some((r) => r.name === 'User');
    } finally {
        await prisma.$disconnect();
    }

    if (!hasMigrationsTable && hasAppTables) {
        console.log(`[prepare-db] Existing database without migration history — baselining ${BASELINE_MIGRATION}`);
        prismaCli(['migrate', 'resolve', '--applied', BASELINE_MIGRATION]);
    }

    prismaCli(['migrate', 'deploy']);
}

main().catch((err) => {
    console.error('[prepare-db] Failed:', err);
    process.exit(1);
});
