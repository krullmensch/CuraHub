import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../index';

const booksDir = path.join(__dirname, '../../uploads/.books');
const FILE = `route-test-${Date.now()}.pdf`;

beforeAll(() => {
    fs.mkdirSync(booksDir, { recursive: true });
    fs.writeFileSync(path.join(booksDir, FILE), '%PDF-1.4\n%%EOF\n');
});
afterAll(() => fs.rmSync(path.join(booksDir, FILE), { force: true }));

describe('book PDFs', () => {
    it('are never served by the static uploads handler', async () => {
        for (const prefix of ['/uploads', '/api/uploads']) {
            const res = await request(app).get(`${prefix}/.books/${FILE}`);
            expect(res.status).toBe(404);
        }
    });
    it('answer 404 for a malformed asset id without touching the database', async () => {
        const res = await request(app).get('/api/books/abc/pdf');
        expect(res.status).toBe(404);
    });
});
