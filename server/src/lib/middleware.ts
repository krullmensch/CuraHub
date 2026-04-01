import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_dev_key';

export type AppRole = 'user' | 'curator' | 'prof' | 'admin';

const ROLE_HIERARCHY: Record<AppRole, number> = {
  user: 0,
  curator: 1,
  prof: 2,
  admin: 3,
};

// Augment Express Request so downstream handlers get typed req.user
declare global {
  namespace Express {
    interface Request {
      user?: { userId: number; role: AppRole };
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Kein Token vorhanden' });
    return;
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: AppRole };
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Ungültiger Token' });
  }
};

/**
 * requireRole('curator', 'prof', 'admin') — allows request only if req.user.role
 * meets or exceeds the minimum role in the list. Must be chained after authenticate.
 */
export const requireRole = (...roles: AppRole[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Keine Berechtigung für diese Aktion' });
      return;
    }
    next();
  };

/** curator, prof, admin — can access the editor */
export const requireCurator = requireRole('curator', 'prof', 'admin');

/** prof, admin — can invite collaborators and elevate users to curator */
export const requireProf = requireRole('prof', 'admin');

/** admin only */
export const requireAdmin = requireRole('admin');

/**
 * Returns true if role `a` is at least as high as role `b` in the hierarchy.
 */
export const roleAtLeast = (a: AppRole, b: AppRole): boolean =>
  ROLE_HIERARCHY[a] >= ROLE_HIERARCHY[b];

/**
 * Prisma OR filter: matches exhibitions the user owns OR is a collaborator on.
 * Use inside any exhibition-scoped where clause.
 */
export const exhibitionAccessFilter = (userId: number) => ({
  OR: [
    { project: { ownerId: userId } },
    { collaborators: { some: { userId } } },
  ],
});
