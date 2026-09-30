/**
 * Re-opens the setup wizard (users and data are kept). Afterwards restart the app;
 * the new setup code appears in `docker compose logs app`.
 * Run: docker compose exec app node dist/scripts/reset-setup.js
 */
import '../lib/loadSecretEnv';
import { PrismaClient } from '@prisma/client';
import { SETTING_COMPLETED } from '../lib/setupState';

async function main() {
    const prisma = new PrismaClient();
    try {
        await prisma.systemSetting.deleteMany({ where: { key: SETTING_COMPLETED } });
        console.log('Setup wieder geöffnet. Jetzt neu starten: docker compose restart app');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
