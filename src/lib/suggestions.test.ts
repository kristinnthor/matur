import { describe, it, expect } from 'vitest';
import { MAX_URL, normaliseUrl, siteOf } from './suggestions';

describe('normaliseUrl', () => {
  it('keeps an ordinary recipe link', () => {
    expect(normaliseUrl('https://ljufmeti.com/2016/05/30/mexikofiskur/')).toBe(
      'https://ljufmeti.com/2016/05/30/mexikofiskur/',
    );
  });

  it('assumes https for a bare host, which is what people paste', () => {
    expect(normaliseUrl('ljufmeti.com/x')).toBe('https://ljufmeti.com/x');
  });

  it('refuses anything that is not http(s)', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'mailto:someone@example.com',
    ]) {
      expect(normaliseUrl(bad)).toBeNull();
    }
  });

  it('refuses empty, junk and over-long input', () => {
    expect(normaliseUrl('')).toBeNull();
    expect(normaliseUrl('   ')).toBeNull();
    expect(normaliseUrl('not a url')).toBeNull();
    expect(normaliseUrl('localhost')).toBeNull(); // no dot: not a real site
    expect(normaliseUrl(`https://x.is/${'a'.repeat(MAX_URL)}`)).toBeNull();
  });

  it('strips the tracking junk that share sheets append', () => {
    expect(
      normaliseUrl(
        'https://chefnotrequired.com/beer-braised-short-ribs/?utm_source=Pinterest&utm_medium=organic&fbclid=abc&tp_image_id=9487',
      ),
    ).toBe('https://chefnotrequired.com/beer-braised-short-ribs/');
  });

  it('keeps query parameters that identify the recipe', () => {
    expect(normaliseUrl('https://x.is/recipe?id=42')).toBe('https://x.is/recipe?id=42');
  });

  it('drops the fragment, which never means a different recipe', () => {
    expect(normaliseUrl('https://x.is/recipe#ingredients')).toBe('https://x.is/recipe');
  });

  it('normalises two shares of the same recipe to one link', () => {
    const a = normaliseUrl('https://x.is/r/?utm_source=Pinterest');
    const b = normaliseUrl('https://x.is/r/#method');
    expect(a).toBe(b);
  });
});

describe('siteOf', () => {
  it('reads as a site name, without the www', () => {
    expect(siteOf('https://www.gotteri.is/2018/10/05/sjonvarpskaka/')).toBe('gotteri.is');
    expect(siteOf('https://ljufmeti.com/x')).toBe('ljufmeti.com');
  });

  it('falls back to the raw value rather than throwing', () => {
    expect(siteOf('nonsense')).toBe('nonsense');
  });
});
