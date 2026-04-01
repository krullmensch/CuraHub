import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

export const authRouter = Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_dev_key';

// Validation Schema
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// ─── HSBI Validation ─────────────────────────────────────────────────────────
// Sends credentials to the HSBI SSO endpoint. The password is NEVER stored or logged.

export async function validateHSBI(username: string, password: string): Promise<boolean> {
  const body = new URLSearchParams({
    option: 'credential',
    doauth: 'auth',
    target: 'https://www.hsbi.de/intern?weiterleitung',
    Ecom_User_ID: username,
    Ecom_Password: password,
  });

  const response = await fetch('https://www.hsbi.de/cms-ajax-login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Origin': 'https://www.hsbi.de',
      'Referer': 'https://www.hsbi.de/login',
    },
    body: body.toString(),
    redirect: 'manual',
  });

  const text = await response.text();

  // Successful login: empty body OR redirect (302)
  if (text.trim() === '' || response.status === 302 || response.redirected) {
    return true;
  }

  // Failed login: 200 OK with HTML content in the body
  return false;
}

// ─── Login ───────────────────────────────────────────────────────────────────

authRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = loginSchema.parse(req.body);

    // Validate against HSBI
    const isValid = await validateHSBI(username, password);
    if (!isValid) {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }

    // Construct email from HSBI username
    const email = `${username}@hsbi.de`;

    // Upsert user: find existing or create on first login
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: { email, role: 'user' },
      });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '365d' });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Benutzername und Passwort sind erforderlich' });
    }
    res.status(500).json({ error: 'Anmeldung fehlgeschlagen' });
  }
});

// ─── Me ──────────────────────────────────────────────────────────────────────

authRouter.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string };
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (!user) return res.status(401).json({ error: 'User not found' });

        res.json({ id: user.id, email: user.email, role: user.role });
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
});
