# KoinThePol Agent Guide

## Project

KoinThePol monitors Bitcoin Up/Down prediction markets from Polymarket. The system has two independent responsibilities:

- **Collector**: starts the market WebSocket, receives live market prices, and persists snapshots.
- **Dashboard**: read-only presentation of the current stream and the latest persisted snapshot.

Do not make the dashboard trigger collection or write to PostgreSQL.

## Architecture

- `server/polymarket.ts`: discovers the currently valid 1h or 4h Bitcoin market and normalizes its metadata.
- `server/fourHourStream.ts`: owns the Polymarket WebSocket connections for 1h and 4h markets.
- `server/routes.ts`: exposes collection, status, latest snapshot, health, and prediction routes.
- `server/db.ts`: initializes PostgreSQL and persists snapshots.
- `src/App.tsx`: read-only live dashboard.
- `src/App.css` and `src/index.css`: dashboard presentation.

## Data Rules

- Market selection must use the real event window, preferably `eventStartTime`, not the market creation `startDate`.
- At 08:59 ET, the selected windows must be 08:00-09:00 for 1h and 08:00-12:00 for 4h.
- A market must be active, not closed, and currently inside its event window.
- Persist the market `slug`, `market_id`, duration, probabilities, timestamp, and raw payload.
- Polymarket `price_changes[].price` is the source of truth for the `UP` and `DOWN` contract prices.
- Do not label contract prices as BTC spot prices or BTC/USDT prices.
- The dashboard must not use Binance or another external spot-price feed unless explicitly requested as a separate metric.

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
- Persist historical snapshots at most once per market per minute.
- A persistence failure must not stop live in-memory updates or make the dashboard hang.
- Handle socket errors and close events without crashing the API.

## Dashboard Rules

- The dashboard is read-only.
- Show the current Polymarket `UP` and `DOWN` prices, not a fabricated BTC spot value.
- Clearly distinguish live WebSocket values from database history.
- Do not show a collect button in the dashboard.
- If the database is slow or unavailable, still render live stream data when the status endpoint responds.
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
