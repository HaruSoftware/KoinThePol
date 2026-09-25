# KoinThePol Agent Guide

## Project

KoinThePol monitors Bitcoin Up/Down prediction markets from Polymarket. The system has two independent responsibilities:

- **Collector**: starts the market WebSocket and receives live market prices.
- **Forecast**: fetches the last 24 hours of Binance BTCUSDT candles and calculates 1h/4h estimates in memory.
- **Dashboard**: read-only presentation of the current stream and the latest persisted snapshot.

Do not make the dashboard trigger collection or persist data.

## Architecture

- `server/polymarket.ts`: discovers the currently valid 1h or 4h Bitcoin market and normalizes its metadata.
- `server/fourHourStream.ts`: owns the Polymarket WebSocket connections for 1h and 4h markets.
- `server/routes.ts`: exposes collection, status, forecast, health, and prediction routes.
- `server/binance.ts`: fetches current-day Binance candles and calculates empirical probabilities.
- `src/App.tsx`: read-only live dashboard.
- `src/App.css` and `src/index.css`: dashboard presentation.

## Data Rules

- Market selection must use the real event window, preferably `eventStartTime`, not the market creation `startDate`.
- At 08:59 ET, the selected windows must be 08:00-09:00 for 1h and 08:00-12:00 for 4h.
- A market must be active, not closed, and currently inside its event window.
- Forecasts use completed 5-minute candle windows from the last 24 hours.
- Freeze the first valid forecast per Polymarket market and persist it in the local ignored `data/forecast-cache.json` file.
- Polymarket `price_changes[].price` is the source of truth for the `UP` and `DOWN` contract prices.
- Do not label contract prices as BTC spot prices or BTC/USDT prices.
- The dashboard uses Binance BTC/USDT as the requested forecast input and labels it separately from Polymarket prices.

## API Contract

Collector routes:

- `POST /api/collect/1h`
- `POST /api/collect/4h`

Read-only dashboard routes:

- `GET /api/collect/1h/status`
- `GET /api/collect/4h/status`
- `GET /api/collect/1h/latest`
- `GET /api/collect/4h/latest`
- `GET /api/health`

The external collector may call both `POST /api/collect/*` routes once per minute. The dashboard only calls `GET` routes and refreshes live status frequently.

The status response should expose the live stream state and, when available:

- `connected`
- `marketId`
- `slug`
- `question`
- `eventStartTime`
- `endDate`
- `upProbability`
- `downProbability`
- `updatedAt`
- `assetIds`

## WebSocket Rules

- Keep one active Polymarket stream per duration.
- Subscribe using the market's `clobTokenIds`.
- Update in-memory prices on every valid WebSocket event.
- Handle socket errors and close events without crashing the API.

## Dashboard Rules

- The dashboard is read-only.
- Show model-estimated `UP` and `DOWN` probabilities and the current Binance spot price.
- Clearly distinguish model estimates from Polymarket market prices.
- Do not show a collect button in the dashboard.
- If Binance is unavailable while a market has no saved forecast, show the forecast error without fabricating probabilities.
- Keep the visual language close to Polymarket: restrained neutral surfaces, compact controls, subtle borders, and limited accent color.

## Development

```powershell
npm install
npm run server
npm run dev
```

Validation commands:

```powershell
npm run server:build
npm run build
npm run lint
```

The API uses `PORT=3001` by default. Vite runs on port `5173` and proxies `/api` to the API server.

## Change Discipline

- Preserve the collector/dashboard separation.
- Prefer existing route and stream abstractions over new parallel implementations.
- Keep database migrations backward-compatible with existing Neon data.
- Test the narrowest affected command after each edit.
- Do not commit, reset, or discard unrelated user changes.
