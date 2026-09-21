import 'dotenv/config'

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export const config = {
  port: numberFromEnv('PORT', 3001),
  databaseUrl: process.env.DATABASE_URL ?? '',
  polymarketApiUrl:
    process.env.POLYMARKET_API_URL ??
    'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=100',
  polymarketWebSocketUrl:
    process.env.POLYMARKET_WEBSOCKET_URL ??
    'wss://ws-subscriptions-clob.polymarket.com/ws/market',
}

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required')
}