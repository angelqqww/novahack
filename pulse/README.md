# Pulse — merchant analytics for Sakura Ramen House

A DoorDash-Merchant-Tablet-style analytics app (hackathon demo). Pulse reads 12 weeks of order history to find busy
patterns, rank menu items, forecast demand for purchasing/prep/staffing, and feed those predictions into how live
orders are prioritized.

## Run

```bash
cd pulse
npm install
npm run dev      # http://localhost:5173 — best at 1280×800 (works down to 1024 wide)
npm test         # analytics tests
npm run build
```

## Screens

- **Insights**: KPIs with count-up and sparklines, AI insights with actions, mini heatmap, top sellers. Fits one screen.
- **Heatmap**: days × hours (custom CSS grid), Orders / Revenue / Prep time, last 4 / 12 weeks or predicted next
  week (dashed cells + confidence), peak and quietest callouts, tap a cell for details.
- **Menu**: photo cards with Star / Rising / Slow mover / Often sold out badges, 4 sorts, item detail sheet.
- **Forecast**: 7-day forecast (actual solid, predicted dashed, 80% band, last week's accuracy), smart shopping
  list with CSV export, prep plan, staffing.
- **Live Orders**: queue ranked by AI priority score, "why this order is first" sheet, rush banner, and a panel
  showing which analytics feed the ranking. Toggle "Arrival order" to compare.
- **Settings**: dark mode, store status, demo clock, new-store "learning" mode, and Loading / Empty / Error previews.

## Demo tips

- The **demo clock** starts at 5:40 PM today, so the "Rush expected in 20 min" banner shows on Live Orders.
- Tap **Add to order list** on the chashu insight, then open Forecast: pork belly is checked and tagged "From AI insight".
- Settings → Order history → **New store (3 weeks)** shows the onboarding state.

## Code map

- `src/data/mock.ts`: all mock data (menu, ingredients, weather, live orders, deterministic 12-week history).
- `src/data/api.ts`: async data layer. Swap these functions for real API calls.
- `src/lib/analytics.ts`: pure analytics (heatmap, forecast, insights, shopping list, staffing, priority score).
- `src/components`: KpiTile, InsightCard, HeatmapGrid, MenuItemCard, ForecastChart, OrderCard, Card (loading/empty/error).
- `src/components/ui`: shadcn/ui components (Radix), sized for touch.

Food photos are from Unsplash (unsplash.com/photos/&lt;id&gt;, ids in `mock.ts`), used under the Unsplash License and
stored in `public/menu` so the demo works offline.
