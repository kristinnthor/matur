/** Shared taxonomy — pure module, importable from both Astro and node scripts. */

export const UNIT_VALUES = [
  'g', 'kg', 'ml', 'dl', 'l', 'tsk', 'msk',
  'stk', 'rif', 'búnt', 'dós', 'pakki', 'sneið', 'klípa',
] as const;

export const CATEGORIES = {
  kjot: 'Kjöt',
  kjuklingur: 'Kjúklingur',
  fiskur: 'Fiskur og sjávarréttir',
  graenmeti: 'Grænmetisréttir',
  pasta: 'Pasta og núðlur',
  pottrettir: 'Súpur og pottréttir',
  bakstur: 'Bakstur',
  eftirrettir: 'Eftirréttir',
  morgunmatur: 'Morgunmatur',
  medlaeti: 'Meðlæti',
  sosur: 'Sósur og dressingar',
} as const;

export const TAGS = {
  fljotlegt: 'Fljótlegt',
  haegeldad: 'Hægeldað',
  veislumatur: 'Veislumatur',
  barnvaent: 'Barnvænt',
  frystivaent: 'Frystivænt',
} as const;
