import { mayCreateBranch, startsNewBranch } from '../lib/branchCreation';

describe('startsNewBranch', () => {
    it('main never starts a branch', () => {
        expect(startsNewBranch('main', null)).toBe(false);
        expect(startsNewBranch('main', 'feature')).toBe(false);
    });

    it('the source version\'s own branch is continued, not started', () => {
        expect(startsNewBranch('feature', 'feature')).toBe(false);
    });

    it('another name, or an unknown source, starts a branch', () => {
        expect(startsNewBranch('feature', 'main')).toBe(true);
        expect(startsNewBranch('feature', 'other')).toBe(true);
        expect(startsNewBranch('feature', null)).toBe(true);
        expect(startsNewBranch('feature', undefined)).toBe(true);
    });
});

describe('mayCreateBranch', () => {
    it('curator, prof and admin may', () => {
        for (const role of ['curator', 'prof', 'admin']) expect(mayCreateBranch(role)).toBe(true);
    });

    it('other roles may not', () => {
        expect(mayCreateBranch('user')).toBe(false);
        expect(mayCreateBranch('')).toBe(false);
    });
});
