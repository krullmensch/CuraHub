import request from 'supertest';
import { app } from '../index';
import { publicUser, completeOnboarding } from '../lib/onboarding';

const at = new Date('2026-10-29T10:00:00.000Z');
const base = { id: 7, email: 'a@hsbi.de', role: 'curator', password_hash: 'x', createdAt: at };

describe('publicUser', () => {
    it('returns id, email, role and the onboarding timestamp as ISO', () => {
        expect(publicUser({ ...base, onboarding_completed_at: at }))
            .toEqual({ id: 7, email: 'a@hsbi.de', role: 'curator', onboardingCompletedAt: '2026-10-29T10:00:00.000Z' });
    });
    it('returns null when the tour was never completed', () => {
        expect(publicUser({ ...base, onboarding_completed_at: null }).onboardingCompletedAt).toBeNull();
    });
    it('never leaks the password hash', () => {
        expect(publicUser({ ...base, onboarding_completed_at: null })).not.toHaveProperty('password_hash');
    });
});

describe('completeOnboarding', () => {
    it('sets the timestamp only where it is still null and returns the stored value', async () => {
        const setIfNull = jest.fn(async () => undefined);
        const read = jest.fn(async () => ({ onboarding_completed_at: at }));
        const now = new Date('2026-10-30T00:00:00Z');
        await expect(completeOnboarding({ setIfNull, read }, 7, now)).resolves.toBe(at);
        expect(setIfNull).toHaveBeenCalledWith(7, now);
    });
    it('keeps the first timestamp on a second call', async () => {
        const read = jest.fn(async () => ({ onboarding_completed_at: at }));
        await expect(completeOnboarding({ setIfNull: async () => undefined, read }, 7, new Date())).resolves.toBe(at);
    });
    it('returns null for an unknown user', async () => {
        await expect(completeOnboarding({ setIfNull: async () => undefined, read: async () => null }, 7, new Date())).resolves.toBeNull();
    });
});

describe('POST /auth/me/onboarding', () => {
    it('answers 401 without a token', async () => {
        expect((await request(app).post('/auth/me/onboarding')).status).toBe(401);
    });
    it('answers 401 with an invalid token', async () => {
        const res = await request(app).post('/auth/me/onboarding').set('Authorization', 'Bearer nope');
        expect(res.status).toBe(401);
    });
});
