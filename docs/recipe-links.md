# Recipe links — triage

> **Status 2026-08-28 (evening): all 18 recipes are converted and live.** The three
> blocked sources were recovered (mbl.is via browser, pjatt.is and the truncated
> gottimatinn link via the Wayback Machine — the latter turned out to be Kjúklingur
> í hvítvínsrjómasósu eftir Helenu Gunnarsdóttur, 2016). The table below is kept as
> the historical record of the triage.

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

## Batch 2 — Pinterest food feed, 2026-08-29 (30 recipes)

Source: the pins listed on the user's Pinterest "Food" board tab. 77 pins collected,
57 with usable outbound links; junk (video/Facebook/Etsy/spam pins, tag-archive
pages, dead domains) and duplicate dishes were dropped. 39 candidates imported —
one fetch blocked (eefkooktzo.nl, 403) — and these 30 converted:

| Slug | Source | Kind |
|---|---|---|
| eina-kjuklingauppskriftin | grgs.is | text |
| sjonvarpskaka | gotteri.is | text |
| bjor-kjuklingur | gottimatinn.is | jsonld |
| franskur-kjuklingapottrettur | vinotek.is | text |
| pizza-med-hakkbotni | eldhussogur.com | text |
| kjuklingur-i-kasjuhnetusosu | grgs.is | text |
| mexikofiskur | ljufmeti.com | text |
| bayonne-skinka | gotteri.is | text |
| haegeldad-lambalaeri | eldhussogur.com | text |
| basilkjuklingur | grgs.is | text |
| ostafylltar-kjuklingabringur | lindaben.is | text |
| nautacarpaccio | thecookful.com | jsonld |
| stracotto | closetcooking.com | text |
| lambapottrettur-i-raudvini | vikalinka.com | jsonld |
| lambaskankar | whereismyspoon.co | jsonld |
| sitronu-estragon-kjuklingur | thefoodcharlatan.com | jsonld |
| kleftiko | oliveandmango.com | text |
| grillud-lambarif | simply-delicious-food.com | jsonld |
| bolognese | oliviascuisine.com | jsonld |
| nautakinnar-i-raudvini | recipetineats.com | jsonld |
| spezzatino | supergoldenbakes.com | jsonld |
| nauta-madras | foodleclub.com | jsonld |
| fyllt-svinalund | neighborfoodblog.com | jsonld |
| kjotbollusupa-med-sveppum | whatgreatgrandmaate.com | jsonld |
| mars-ostakaka | bestrecipes.com.au | jsonld |
| kokos-kjuklingakarri | gelukkigindekeuken.com | text |
| kjuklingalaeri-i-sveppasosu | heerlijkehappen.nl | jsonld |
| italskur-kjuklingapottrettur | 15gram.be | text |
| kjuklingur-marsala | cookingqueens.nl | jsonld |
| fiskur-i-gulri-sosu | recetariocanecositas.com | text |

Eight spare drafts imported but not converted (run `npm run translate` when wanted):
kjuklinga-ofnrettur-med-sveppum, dijon-kjuklingur-med-spinati, kjuklinga-cordon-bleu,
cottage-pie, beef-wellington, ofnbakadir-lambaskankar, hunangs-dijon-kjuklingur,
caesar-kjuklingur.

## Consequences for the plan

1. **Translation is a smaller job than assumed.** 11 of 18 are already Icelandic. Those need
   structuring, unit normalisation, and improvement — not translation. Only 7 need the full
   translate pass.
2. **The JSON-LD import path covers 7 of 18.** The spec assumed most recipe sites publish it;
   that holds for modern English food blogs but not for Icelandic blogs from 2009–2013. The
   importer needs a second strategy — per-site HTML extraction, or assisted manual entry.
3. **Three need recovery.** mbl.is needs a browser fetch, pjatt.is needs the Wayback Machine,
   and the gottimatinn.is blog link needs the correct URL.
