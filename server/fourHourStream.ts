import WebSocket from 'ws'
import { config } from './config.js'
import { insertMarketSnapshot } from './db.js'
import type { MarketData } from './polymarket.js'

type PriceChange = {
  asset_id?: string
  price?: string | number
}

type MarketEvent = {
  event_type?: string
  asset_id?: string
  price?: string | number
  price_changes?: PriceChange[]
}

let activeSocket: WebSocket | undefined
let activeMarketId: string | undefined

function priceFromEvent(event: MarketEvent, tokenIds: string[], prices: number[]): boolean {
  const changes = event.price_changes ?? [event]
  let changed = false
  for (const change of changes) {
    const index = tokenIds.indexOf(change.asset_id ?? '')
    const price = Number(change.price)
    if (index >= 0 && Number.isFinite(price)) {
      prices[index] = price
      changed = true
    }
  }
  return changed
}

async function saveSnapshot(market: MarketData, prices: number[], event: unknown): Promise<void> {
  await insertMarketSnapshot(
    market.id,
    4,
    prices[0],
    prices[1],
    { market: market.raw, event, prices },
  )
}

export function connectFourHourStream(market: MarketData): void {
  if (activeMarketId === market.id && activeSocket?.readyState === WebSocket.OPEN) return
  activeSocket?.close()

  const prices = [...market.outcomePrices]
  const socket = new WebSocket(config.polymarketWebSocketUrl)
  activeSocket = socket
  activeMarketId = market.id

  socket.on('open', () => {
    socket.send(JSON.stringify({ assets_ids: market.clobTokenIds, type: 'market' }))
  })

  socket.on('message', (rawMessage) => {
    try {
      const parsed = JSON.parse(rawMessage.toString()) as MarketEvent | MarketEvent[]
      const events = Array.isArray(parsed) ? parsed : [parsed]
      for (const event of events) {
        if (priceFromEvent(event, market.clobTokenIds, prices)) {
          void saveSnapshot(market, prices, event).catch((error: unknown) => console.error(error))
        }
      }
    } catch (error) {
      console.error('Invalid Polymarket WebSocket message', error)
    }
  })

  socket.on('error', (error) => console.error('Polymarket WebSocket error', error))
  socket.on('close', () => {
    if (activeSocket === socket) {
      activeSocket = undefined
      activeMarketId = undefined
    }
  })
}

export function fourHourStreamStatus(): { connected: boolean; marketId?: string } {
  return {
    connected: activeSocket?.readyState === WebSocket.OPEN,
    marketId: activeMarketId,
  }
}