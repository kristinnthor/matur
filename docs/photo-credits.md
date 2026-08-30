# Photo origins

**The authoritative record for any photo is git history**, because photos are
replaced in place (same `<slug>.jpg` filename) by uploads from the site:

```bash
git log --follow --oneline src/content/recipes/photos/<slug>.jpg
```

A commit message `photo: <slug> (upphlaðin af <nafni>)` means a family photo
uploaded through `/myndir/` or the recipe page, credited to whoever was signed
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
