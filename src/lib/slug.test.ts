import { describe, it, expect } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('transliterates Icelandic characters', () => {
    expect(slugify('Kjúklinga-stroganoff með sveppum')).toBe('kjuklinga-stroganoff-med-sveppum');
  });

  it('handles thorn, eth and ae', () => {
    expect(slugify('Þessar fylltu sætu kartöflur!')).toBe('thessar-fylltu-saetu-kartoflur');
  });

  it('collapses whitespace and punctuation to single dashes', () => {
    expect(slugify('Boeuf  Bourguignon')).toBe('boeuf-bourguignon');
    expect(slugify('  Rósakál, með beikoni & hnetum  ')).toBe('rosakal-med-beikoni-hnetum');
  });
});
