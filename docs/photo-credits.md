# Photo origins

**The authoritative record for any photo is git history**, because photos are
replaced in place (same `<slug>.jpg` filename) by uploads from the site:

```bash
git log --follow --oneline src/content/recipes/photos/<slug>.jpg
```

A commit message `photo: <slug> (upphlaðin af <nafni>)` means a family photo
uploaded through the camera button on the recipe page, credited to whoever was signed
in; the table below then no longer describes what is shown. Older uploads say
`(upphlaðin af síðunni)`, from before uploads required signing in.

## Stock photo origins (initial seeding)

These files were *seeded* from [Pexels](https://www.pexels.com) under the
[Pexels license](https://www.pexels.com/license/) (free use, attribution not
required). A row here says where the file **originally** came from — not
necessarily what it shows today; check git history per the note above.

| File | Pexels source |
|---|---|
| boeuf-bourguignon.jpg | [27819664](https://www.pexels.com/photo/27819664/) |
| djusi-kjotbollur.jpg | [11098094](https://www.pexels.com/photo/11098094/) |
| heilsteikt-nautasteik.jpg | [11713082](https://www.pexels.com/photo/11713082/) |
| hvitlauksbraud.jpg | [18453900](https://www.pexels.com/photo/18453900/) |
| kartoflusalat-med-beikoni-og-piparosti.jpg | [21625304](https://www.pexels.com/photo/21625304/) |
| kjuklingur-i-paprikusosu.jpg | [10338434](https://www.pexels.com/photo/10338434/) |
| lambakotilettur-med-myntu-chimichurri.jpg | [17988080](https://www.pexels.com/photo/17988080/) — Mayumi Maciel |
| ofnbakadur-humar.jpg | [16975236](https://www.pexels.com/photo/16975236/) |
| reykt-raud-chimichurri.jpg | [15792422](https://www.pexels.com/photo/15792422/) |
| rosakal-med-beikoni-og-hnetum.jpg | [10942840](https://www.pexels.com/photo/10942840/) |
| spaghetti-carbonara.jpg | [19062758](https://www.pexels.com/photo/19062758/) |

Family uploads (never Pexels): `fylltar-saetar-kartoflur.jpg` and anything newer —
see git history. Recipes without any photo show the designed fallback card until
someone cooks them with a phone at hand.

## Wikimedia Commons photos

Everything sourced from Commons is recorded in
`src/content/recipes/photos/credits.json` rather than in this table, because
the site *displays* those credits — CC BY and CC BY-SA both require
attribution. Each entry carries the creator, the licence, the licence URL, the
Commons file page, and the **sha256 of the bytes it describes**. `creditFor()`
in `src/lib/photos.ts` only shows a credit while that hash still matches the
file on disk, so the moment someone uploads their own shot over one the
stranger's byline disappears by itself. Nothing needs cleaning up by hand.

A Commons sweep filled 24 of the 27 photo-less recipes. Three were left on the
fallback card deliberately, because no accurate photo existed and a misleading
one is worse than none:

| Recipe | Why no photo |
|---|---|
| `pizza-med-hakkbotni` | Every candidate is a dough pizza; the whole point is a minced-meat base |
| `kramdar-kartoflur` | Nothing on Commons is a photo *of* smashed potatoes — only plates where some appear in a corner |
| `mexikofiskur` | No candidates across eight queries; the dish is an Icelandic invention, and "fish mornay" matches marionberry pies |

Three more were nearly missed for a bad reason worth recording: the first pass
judged candidates from 300 px contact-sheet tiles, and searched on the wrong
description. `sjonvarpskaka` was queried as a chocolate cake when it is a
coconut-topped tray bake; `basilkjuklingur` and `italskur-ponnukjuklingur` were
queried on their categories rather than what is actually in them. Re-reading the
recipe before writing the query, and judging at the real crop size, found all
three. `nautabitar-i-hvitlaukssmjori` was rejected outright on a thumbnail and is
in fact a clean shot of beef cubes with the garlic visible.

Most of these photos are cropped and resized only. One is also tone-adjusted:
`nautabitar-i-hvitlaukssmjori.jpg` was brightened (brightness 1.14, saturation
1.1, mild contrast) because the original is a dim indoor shot. CC BY-SA asks
that modifications be indicated, so it is noted here.
