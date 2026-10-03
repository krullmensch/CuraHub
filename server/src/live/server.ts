import type { Server } from 'http';
import type { Duplex } from 'stream';
import jwt from 'jsonwebtoken';
import { WebSocketServer, WebSocket } from 'ws';
import type { PrismaClient } from '@prisma/client';

import { JWT_SECRET } from '../lib/jwtSecret';
import { exhibitionAccessFilter } from '../lib/middleware';
import { allowedOrigins } from '../lib/corsOrigins';
import { getSetupState } from '../lib/setupState';
import { LiveHub, type HubDeps, type TokenClaims } from './hub';
import { parseClaimKey, type ClaimKind } from './protocol';
import { isLivePath, liveOriginAllowed } from './origin';

const PING_INTERVAL_MS = 15_000;
/** Client messages are tiny (ids, a slug, a token); anything bigger is not ours. */
const MAX_PAYLOAD_BYTES = 16 * 1024;

export function prismaHubDeps(prisma: PrismaClient): HubDeps {
    return {
        verifyToken(token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                if (typeof decoded !== 'object' || typeof decoded.userId !== 'number') return null;
                return { userId: decoded.userId, role: typeof decoded.role === 'string' ? decoded.role : 'user' };
            } catch {
                return null;
            }
        },
        loadUser(userId) {
            return prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
        },
        async canAccessExhibition(claims: TokenClaims, exhibitionId, versionId) {
            const exhibition = await prisma.exhibition.findFirst({
                where: { id: exhibitionId, ...exhibitionAccessFilter(claims.userId, claims.role === 'admin') },
                select: { id: true },
            });
            if (!exhibition) return false;
            if (versionId === null) return true;
            const version = await prisma.exhibitionVersion.findFirst({
                where: { id: versionId, exhibition_id: exhibitionId },
                select: { id: true },
            });
            return version !== null;
        },
        async resolvePublicSlug(slug) {
            const exhibition = await prisma.exhibition.findFirst({
                where: { slug, versions: { some: { is_published: true } } },
                select: { id: true },
            });
            return exhibition?.id ?? null;
        },
        async keysInVersion(versionId, keys) {
            const ids: Record<ClaimKind, number[]> = { instance: [], wall: [], figure: [] };
            for (const key of keys) {
                const parsed = parseClaimKey(key);
                if (parsed) ids[parsed.kind].push(parsed.id);
            }
            const select = { id: true } as const;
            const [instances, walls, figures] = await Promise.all([
                ids.instance.length ? prisma.artworkInstance.findMany({ where: { versionId, id: { in: ids.instance } }, select }) : [],
                ids.wall.length ? prisma.modularWall.findMany({ where: { versionId, id: { in: ids.wall } }, select }) : [],
                ids.figure.length ? prisma.scaleFigure.findMany({ where: { versionId, id: { in: ids.figure } }, select }) : [],
            ]);
            return new Set([
                ...instances.map((r) => `instance:${r.id}`),
                ...walls.map((r) => `wall:${r.id}`),
                ...figures.map((r) => `figure:${r.id}`),
            ]);
        },
    };
}

function refuse(socket: Duplex, status: string) {
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
}

/** Serves the live channel on the API's HTTP server. Returns a function that stops it. */
export function attachLiveServer(server: Server, hub: LiveHub): () => void {
    const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
    const alive = new WeakMap<WebSocket, boolean>();

    server.on('upgrade', (req, socket, head) => {
        if (!isLivePath(req.url)) return refuse(socket, '404 Not Found');
        if (!getSetupState()?.complete) return refuse(socket, '503 Service Unavailable');
        const allowed = allowedOrigins(process.env, getSetupState()?.publicUrl ?? null);
        if (!liveOriginAllowed(req.headers, allowed, process.env.NODE_ENV === 'production')) {
            return refuse(socket, '403 Forbidden');
        }
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
    });

    wss.on('connection', (ws: WebSocket) => {
        alive.set(ws, true);
        ws.on('pong', () => alive.set(ws, true));
        const handle = hub.attach({
            send(msg) {
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
            },
            close(code, reason) {
                ws.close(code, reason);
            },
        });
        ws.on('message', (data, isBinary) => {
            if (isBinary) return;
            handle.onMessage(data.toString()).catch((err) => console.error('[Live] Message failed:', err));
        });
        ws.on('close', () => handle.onClose());
        ws.on('error', (err) => console.error('[Live] Socket error:', err.message));
    });

    const ping = setInterval(() => {
        for (const ws of wss.clients) {
            if (!alive.get(ws)) {
                ws.terminate();
                continue;
            }
            alive.set(ws, false);
            ws.ping();
        }
    }, PING_INTERVAL_MS);

    return () => {
        clearInterval(ping);
        for (const ws of wss.clients) ws.terminate();
        wss.close();
        hub.dispose();
    };
}
