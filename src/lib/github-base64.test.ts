// Lives under src/ rather than beside worker/github.ts because vitest.config.ts
// only collects test files under src/. The subject is the Worker's base64 pair.
import { describe, it, expect } from 'vitest';
import { fromBase64, toBase64 } from '../../worker/github';

describe('UTF-8 safe base64', () => {
  it('round-trips Icelandic text', () => {
    const text = 'Kartöflustappa með hýði — þæfð í smjöri, 1½ dl rjómi.';
    expect(fromBase64(toBase64(text))).toBe(text);
  });

  it('encodes characters bare btoa would throw on', () => {
    // btoa('þ') throws InvalidCharacterError; this must not.
    expect(() => toBase64('þðöéÞÐÖÉ')).not.toThrow();
    expect(fromBase64(toBase64('þðöéÞÐÖÉ'))).toBe('þðöéÞÐÖÉ');
  });

  it('round-trips a whole recipe document', () => {
    const doc = JSON.stringify({ title: 'Lambaskankar', steps: [{ text: 'Brúnið {{lambaskankar}} vel.' }] }, null, 2) + '\n';
    expect(fromBase64(toBase64(doc))).toBe(doc);
  });

  it('reads base64 that GitHub has wrapped at 60 columns', () => {
    const text = 'Þetta er langur texti sem GitHub skiptir í línur þegar það skilar honum.';
    const wrapped = toBase64(text).replace(/(.{20})/g, '$1\n');
    expect(fromBase64(wrapped)).toBe(text);
  });

  it('produces ordinary base64 for ASCII', () => {
    expect(toBase64('hello')).toBe('aGVsbG8=');
  });
});
