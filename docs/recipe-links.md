# Recipe links — triage

Source: the list supplied 2026-08-28. Status checked the same day.

**18 recipes, 2 non-recipes.** Of the 18: **11 already in Icelandic**, 7 in English.
Only **7 publish `schema.org/Recipe` JSON-LD**, so the automated import path in the spec
covers well under half the list.

## Ready to import — JSON-LD present (7)

| # | Recipe | Source | Lang |
|---|---|---|---|
| 1 | Boeuf Bourguignon — **already done**, seeds the site | thatovenfeelin.com | EN |
| 2 | Chicken & mushroom stroganoff | anorganizedchaos.com | EN |
| 3 | Chicken & spinach in creamy paprika sauce | whatsinthepan.com | EN |
| 4 | Italian skillet chicken, tomatoes & mushrooms | themediterraneandish.com | EN |
| 5 | Kartöflusalat með beikoni og piparosti | gottimatinn.is | IS |
| 6 | Baked pesto chicken | kalynskitchen.com | EN |
| 7 | Smoky red chimichurri | thebeardedhiker.com | EN |

## Live but no JSON-LD — needs HTML parsing or manual entry (8)

| # | Recipe | Source | Lang |
|---|---|---|---|
| 8 | Djúsí kjötbollur | lindaben.is | IS |
| 9 | Stórgott hvítlauksbrauð | ljufmeti.com (2012) | IS |
| 10 | Lamb chops with mint chimichurri | kitchenlush.com | EN |
| 11 | Kjúklingur með sætum kartöflum, spínati og fetaosti | ljufmeti.com (2013) | IS |
| 12 | Rósakál með beikoni og hnetum | vinotek.is (2013) | IS |
| 13 | Heilsteikt nautasteik | vinotek.is (2009) | IS |
| 14 | Ofnbakaður humar með hvítlaukssmjöri | eldhussogur.com (2012) | IS |
| 15 | Spaghetti carbonara | hun.is | IS |

## Blocked or broken (3)

| # | Recipe | Source | Status |
|---|---|---|---|
| 16 | Kramdar kartöflur með kryddblöndu og osti | mbl.is | **403** — blocks automated fetches; readable in a browser |
| 17 | Fylltar sætar kartöflur | pjatt.is | **Connection failed** — site appears to be gone; try the Wayback Machine |
| 18 | (kjúklingaréttur, slug truncated) | gottimatinn.is/matarblog | **404** — dead link; original URL may have been cut short |

## Not recipes — excluded (2)

- `ljufmeti.com/page/4/` — a blog pagination page, not a recipe
- `pinterest.com/pin-builder/` — Pinterest's own tool

## Consequences for the plan

1. **Translation is a smaller job than assumed.** 11 of 18 are already Icelandic. Those need
   structuring, unit normalisation, and improvement — not translation. Only 7 need the full
   translate pass.
2. **The JSON-LD import path covers 7 of 18.** The spec assumed most recipe sites publish it;
   that holds for modern English food blogs but not for Icelandic blogs from 2009–2013. The
   importer needs a second strategy — per-site HTML extraction, or assisted manual entry.
3. **Three need recovery.** mbl.is needs a browser fetch, pjatt.is needs the Wayback Machine,
   and the gottimatinn.is blog link needs the correct URL.
