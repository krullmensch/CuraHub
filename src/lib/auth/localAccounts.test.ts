import { describe, expect, it } from 'vitest';
import { isLocalAccount, newPasswordError } from './localAccounts';

describe('isLocalAccount', () => {
  it('tells usernames from HSBI addresses', () => {
    expect(isLocalAccount('gast.lehmann')).toBe(true);
    expect(isLocalAccount('amuster@hsbi.de')).toBe(false);
  });
});

describe('newPasswordError', () => {
  it('accepts a long, new, repeated password', () => {
    expect(newPasswordError('k7mq-x2ha-p9tr-c4we', 'ein-neues-passwort', 'ein-neues-passwort')).toBeNull();
  });
  it('needs 12 characters', () => {
    expect(newPasswordError('alt', 'kurz', 'kurz')).toMatch(/mindestens 12/);
  });
  it('needs a different password', () => {
    expect(newPasswordError('ein-neues-passwort', 'ein-neues-passwort', 'ein-neues-passwort')).toMatch(/unterscheiden/);
  });
  it('needs the repetition to match', () => {
    expect(newPasswordError('alt', 'ein-neues-passwort', 'ein-neues-passwortX')).toMatch(/stimmen nicht/);
  });
});
