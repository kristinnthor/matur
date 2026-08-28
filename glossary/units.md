# Units — conversion and idiom

Derived from the five hand-converted recipes. These rules are what the automated
translate pass must follow.

## Never emit these

The original failure mode was English unit names in structured data. The schema now rejects
them, but the translator must not produce them in the first place:

| Never | Always |
|---|---|
| `kilograms`, `grams` | `kg`, `g` |
| `teaspoons`, `tablespoons` | `tsk`, `msk` |
| `milliliters`, `deciliters` | `ml`, `dl` |
| `0.5 tsk` | `½ tsk` (the renderer does this — author `0.5`) |

## Conversions from English sources

| Source | Icelandic | Note |
|---|---|---|
| 1 cup | 2.4 dl | Round to a measurable value: 2.5 dl |
| ½ cup | 1.2 dl | Prefer 1.25 dl so it renders `1¼ dl` |
| ⅔ cup | 1.6 dl | Prefer 1.5 dl |
| ⅓ cup | 0.8 dl | Prefer 0.75 dl → `¾ dl` |
| 1 oz | 28 g | Round to 25 g |
| 8 oz | 225 g | Standard mushroom/cheese pack |
| 1 lb | 450 g | |
| 1 inch | 2.5 cm | Usually written as a range: "2–3 cm bitum" |
| 350 °F | 175 °C | |
| 375 °F | 190 °C | |
| 400 °F | 200 °C | |
| 165 °F (chicken) | 74 °C | Usually better as "eldaður í gegn" |

## Authoring preferences

- **Volume ≥ 100 ml is always `dl`.** Never author `500 ml`; author `5 dl`.
- **Prefer amounts that land on quarters.** `1.25 dl` renders `1¼ dl`; `1.2 dl` renders the
  unmeasurable `1,2 dl`. When a conversion lands awkwardly, round to the nearest quarter of
  the display unit rather than preserving false precision.
- **`tsk` and `msk` stay as authored.** Never convert them to ml.
- **Counts use the specific unit.** `rif` for garlic cloves, `stk` for whole items,
  `búnt` for bunches. `rif` and `stk` are not interchangeable when aggregating.

## `scalable: false`

Set it on anything that does not scale linearly:

- salt, pepper, and other seasoning-to-taste
- raising agents (lyftiduft, matarsódi)
- chilli flakes and hot spices
- bay leaves and whole aromatics
- oil for frying ("olía til steikingar")

Doubling a recipe must not double the cayenne.
