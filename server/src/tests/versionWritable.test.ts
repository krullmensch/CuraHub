import type { Response } from 'express';
import { ensureVersionWritable } from '../lib/versionWritable';

function fakeRes() {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    return { res: { status } as unknown as Response, status, json };
}

describe('ensureVersionWritable', () => {
    it('returns true and sends nothing for an unpublished version', () => {
        const { res, status } = fakeRes();
        const ok = ensureVersionWritable(res, { is_published: false });
        expect(ok).toBe(true);
        expect(status).not.toHaveBeenCalled();
    });

    it('sends 409 version_published for a published version', () => {
        const { res, status, json } = fakeRes();
        const ok = ensureVersionWritable(res, { is_published: true });
        expect(ok).toBe(false);
        expect(status).toHaveBeenCalledWith(409);
        expect(json).toHaveBeenCalledWith({ code: 'version_published', error: 'Diese Version ist veröffentlicht und schreibgeschützt.' });
    });
});
