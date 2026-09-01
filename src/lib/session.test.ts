import { describe, it, expect } from 'vitest';
import { isAdmin, isAllowed, parseAllowlist, signSession, verifySession } from './session';

const SECRET = 'leynilykill-fyrir-prufur';
const user = { sub: '1234567890', email: 'kristinn@example.com', name: 'Kristinn' };
const HOUR = 3600;

describe('session tokens', () => {
  it('round-trips the signed-in user', async () => {
    const token = await signSession(user, SECRET, 1000 + HOUR);
    expect(await verifySession(token, SECRET, 1000)).toEqual(user);
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signSession(user, 'annar-lykill', 1000 + HOUR);
    expect(await verifySession(token, SECRET, 1000)).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await signSession(user, SECRET, 1000 + HOUR);
    const [body, sig] = token.split('.');
    const forged = btoa(JSON.stringify({ ...user, email: 'annar@example.com', exp: 1000 + HOUR }))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '');
    expect(await verifySession(`${forged}.${sig}`, SECRET, 1000)).toBeNull();
    expect(body).not.toBe(forged);
  });

  it('rejects an expired token', async () => {
    const token = await signSession(user, SECRET, 1000);
    expect(await verifySession(token, SECRET, 1000)).toBeNull();
    expect(await verifySession(token, SECRET, 999)).toEqual(user);
  });

  it('rejects nonsense rather than throwing', async () => {
    for (const bad of [undefined, null, '', 'no-dot', '.', 'a.b', '%%%.%%%']) {
      expect(await verifySession(bad, SECRET, 1000)).toBeNull();
    }
  });
});

describe('allowlist', () => {
  it('reads commas, spaces and newlines', () => {
    expect(parseAllowlist('a@x.is, b@x.is\nc@x.is  d@x.is')).toEqual([
      'a@x.is',
      'b@x.is',
      'c@x.is',
      'd@x.is',
    ]);
  });

  it('ignores case and padding on both sides', () => {
    const allow = parseAllowlist('  Kristinn@Example.COM ');
    expect(isAllowed('kristinn@example.com', allow)).toBe(true);
    expect(isAllowed(' KRISTINN@EXAMPLE.COM  ', allow)).toBe(true);
  });

  it('turns away anyone not listed', () => {
    const allow = parseAllowlist('a@x.is');
    expect(isAllowed('b@x.is', allow)).toBe(false);
  });

  it('fails closed when unconfigured, rather than admitting the world', () => {
    for (const raw of [undefined, null, '', '   ', ',,']) {
      expect(isAllowed('anyone@example.com', parseAllowlist(raw))).toBe(false);
    }
  });
});

describe('the admin role', () => {
  it('grants the role to a listed address', () => {
    expect(isAdmin('kristinn@example.com', parseAllowlist('kristinn@example.com'))).toBe(true);
  });

  it('is case- and whitespace-insensitive, like the sign-in allowlist', () => {
    const admins = parseAllowlist(' Kristinn@Example.com , annar@example.com ');
    expect(isAdmin('  KRISTINN@example.com ', admins)).toBe(true);
  });

  it('refuses an address that is not listed', () => {
    expect(isAdmin('gestur@example.com', parseAllowlist('kristinn@example.com'))).toBe(false);
  });

  it('fails closed on an empty or unset list', () => {
    expect(isAdmin('kristinn@example.com', parseAllowlist(''))).toBe(false);
    expect(isAdmin('kristinn@example.com', parseAllowlist(undefined))).toBe(false);
    expect(isAdmin('kristinn@example.com', [])).toBe(false);
  });
});
