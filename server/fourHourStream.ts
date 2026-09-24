import WebSocket from 'ws'
import { config } from './config.js'
import { fetchClobPrice, type MarketData } from './polymarket.js'

type DurationHours = 1 | 4

type ActiveStream = {
  socket: WebSocket
  marketId: string
  market: MarketData
  prices: number[]
  updatedAt: string
  bitcoinReferencePrice?: number
  assetIds?: string[]
  pricePoller?: ReturnType<typeof setInterval>
}

const activeStreams = new Map<DurationHours, ActiveStream>()

async function refreshClobPrices(durationHours: DurationHours, stream: ActiveStream): Promise<void> {
  const prices = await Promise.all(stream.market.clobTokenIds.map((tokenId) => fetchClobPrice(tokenId, 'BUY')))
  if (activeStreams.get(durationHours) !== stream) return

  stream.prices = prices
  stream.updatedAt = new Date().toISOString()
}

export function connectMarketStream(durationHours: DurationHours, market: MarketData): void {
  const activeStream = activeStreams.get(durationHours)
  if (activeStream?.marketId === market.id && activeStream.socket.readyState === WebSocket.OPEN) return
  if (activeStream?.pricePoller) clearInterval(activeStream.pricePoller)
  activeStream?.socket.close()

  const prices = [...market.outcomePrices]
  const socket = new WebSocket(config.polymarketWebSocketUrl)
  const stream: ActiveStream = {
    socket,
    marketId: market.id,
    market,
    prices,
    updatedAt: new Date().toISOString(),
    bitcoinReferencePrice: market.bitcoinReferencePrice,
  }
  activeStreams.set(durationHours, stream)
  stream.pricePoller = setInterval(() => {
    void refreshClobPrices(durationHours, stream).catch((error: unknown) => console.error('CLOB price refresh failed', error))
  }, 2_000)
  void refreshClobPrices(durationHours, stream).catch((error: unknown) => console.error('Initial CLOB price refresh failed', error))

  socket.on('open', () => {
    socket.send(JSON.stringify({ assets_ids: market.clobTokenIds, type: 'market' }))
  })

  socket.on('error', (error) => console.error('Polymarket WebSocket error', error))
  socket.on('close', () => {
    if (activeStreams.get(durationHours)?.socket === socket) {
      stream.updatedAt = new Date().toISOString()
    }
  })
}

export function connectFourHourStream(market: MarketData): void {
  connectMarketStream(4, market)
}

export function streamStatus(durationHours: DurationHours): {
  connected: boolean
  marketId?: string
  slug?: string
  question?: string
  eventStartTime?: string
  endDate?: string
  upProbability?: number
  downProbability?: number
  updatedAt?: string
  bitcoinReferencePrice?: number
  assetIds?: string[]
} {
  const activeStream = activeStreams.get(durationHours)
  return {
    connected: activeStream?.socket.readyState === WebSocket.OPEN,
    marketId: activeStream?.marketId,
    slug: activeStream?.market.slug,
    question: activeStream?.market.question,
    eventStartTime: activeStream?.market.eventStartTime,
    endDate: activeStream?.market.endDate,
    upProbability: activeStream ? activeStream.prices[activeStream.market.outcomes.findIndex((outcome) => outcome.toLowerCase() === 'up')] : undefined,
    downProbability: activeStream ? activeStream.prices[activeStream.market.outcomes.findIndex((outcome) => outcome.toLowerCase() === 'down')] : undefined,
    updatedAt: activeStream?.updatedAt,
    bitcoinReferencePrice: activeStream?.bitcoinReferencePrice,
    assetIds: activeStream?.market.clobTokenIds,
  }
}