/**
 * Sets (or creates) a local emergency admin — for a lost password.
 * Run: docker compose exec app node dist/scripts/reset-local-admin.js <benutzername>
 */
import '../lib/loadSecretEnv';
import readline from 'readline';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/setupStore';
import { LOCAL_USERNAME_RE, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../lib/setupValidation';

function askHidden(question: string): Promise<string> {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        process.stdout.write(question);
        // Suppress the echo of typed characters.
        (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
        rl.question('', (answer) => {
            rl.close();
            process.stdout.write('\n');
            resolve(answer);
        });
    });
}

async function main() {
    const username = (process.argv[2] ?? '').trim().toLowerCase();
    if (!LOCAL_USERNAME_RE.test(username)) {
        console.error('Aufruf: node dist/scripts/reset-local-admin.js <benutzername>  (3–32 Zeichen: a–z, 0–9, . _ -)');
        process.exit(1);
    }
    const password = await askHidden('Neues Passwort: ');
    const repeat = await askHidden('Passwort wiederholen: ');
    if (password !== repeat) throw new Error('Die Passwörter stimmen nicht überein.');
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
        throw new Error(`Das Passwort muss ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} Zeichen lang sein.`);
    }

    const prisma = new PrismaClient();
    try {
        const passwordHash = await hashPassword(password);
        await prisma.user.upsert({
            where: { email: username },
            create: { email: username, password_hash: passwordHash, role: 'admin' },
            update: { password_hash: passwordHash, role: 'admin' },
        });
        console.log(`Notfall-Admin "${username}" gesetzt. Anmeldung über „Notfall-Login" auf der Login-Seite.`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
