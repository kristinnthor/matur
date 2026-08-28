# Matur

Persónulegur uppskriftavefur — [matur.kristinn.eu](https://matur.kristinn.eu)

Icelandic recipe site. Recipes are structured JSON validated at build time, rendered as a
static offline-capable PWA with serving scaling and a kitchen cook mode.

## Development

```bash
npm install
npm run dev      # http://localhost:4321
npm test         # units and step-interpolation tests
npm run build    # static output to dist/
```

## Structure

| Path | Purpose |
|---|---|
| `src/lib/units.ts` | Icelandic unit system — canonical storage, display formatting, scaling |
| `src/lib/steps.ts` | Resolves `{{ingredient}}` references in step text |
| `src/content.config.ts` | Recipe schema, categories and tags |
| `src/content/recipes/` | One JSON file per recipe |
| `docs/superpowers/specs/` | Design spec |
| `docs/superpowers/plans/` | Implementation plans |
| `docs/recipe-links.md` | Source link triage |

## Units

Amounts are stored canonically (grams / millilitres / counts) and rendered in Icelandic units
only at display time. Rounding happens in the display unit so scaled amounts stay measurable —
`6¼ dl`, never `6,3 dl`. Ingredients marked `"scalable": false` (salt, raising agents, seasoning)
do not change when servings change.
