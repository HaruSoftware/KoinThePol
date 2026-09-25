import { config } from './config.js'
import { readForecast, writeForecast } from './forecastStore.js'
import type { MarketData } from './polymarket.js'

type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string]

export type ForecastHorizon = {
  hours: 1 | 4
  upProbability: number
  downProbability: number
  sampleCount: number
  averageReturn: number
}

export type BitcoinForecast = {
  marketId: string
  marketSlug: string
  marketQuestion: string
  eventStartTime?: string
  endDate?: string
  referencePrice: number
  symbol: string
  interval: string
  currentPrice: number
  dataStart: string
  dataEnd: string
  candleCount: number
  generatedAt: string
  horizons: Record<'1' | '4', ForecastHorizon>
}

const cachedForecasts = new Map<string, BitcoinForecast>()
const forecastRequests = new Map<string, Promise<BitcoinForecast>>()

function probabilityForHorizon(closes: number[], currentPrice: number, referencePrice: number, hours: 1 | 4): ForecastHorizon {
  const candlesPerHorizon = hours * 12
  const returns: number[] = []
  for (let index = 0; index + candlesPerHorizon < closes.length; index += 1) {
    const start = closes[index]
    const end = closes[index + candlesPerHorizon]
    if (start > 0 && Number.isFinite(end)) {
      const projectedEnd = currentPrice * (end / start)
      returns.push((projectedEnd - currentPrice) / currentPrice)
    }
  }

  if (returns.length === 0) {
    throw new Error(`Not enough Binance candles to calculate a ${hours}h forecast`)
  }

  const upCount = returns.filter((value) => currentPrice * (1 + value) > referencePrice).length
  // Laplace smoothing avoids presenting 0% or 100% from a small sample.
  const upProbability = (upCount + 1) / (returns.length + 2)
  return {
    hours,
    upProbability,
    downProbability: 1 - upProbability,
    sampleCount: returns.length,
    averageReturn: returns.reduce((total, value) => total + value, 0) / returns.length,
  }
}

async function calculateBitcoinForecast(market: MarketData): Promise<BitcoinForecast> {
  const referencePrice = market.bitcoinReferencePrice
  if (referencePrice === undefined || !Number.isFinite(referencePrice)) {
    throw new Error(`Polymarket market ${market.slug} has no Bitcoin reference price`)
  }
  const now = Date.now()
  const startTime = now - 24 * 60 * 60 * 1000
  const url = new URL('/api/v3/klines', config.binanceApiUrl)
  url.searchParams.set('symbol', 'BTCUSDT')
  url.searchParams.set('interval', '5m')
  url.searchParams.set('startTime', String(startTime))
  url.searchParams.set('endTime', String(now))
  url.searchParams.set('limit', '1000')

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Binance returned HTTP ${response.status}`)
  const payload = (await response.json()) as BinanceKline[] | { code?: number; msg?: string }
  if (!Array.isArray(payload)) throw new Error(`Binance returned an invalid candle response: ${payload.msg ?? 'unknown error'}`)

  const candles = payload
    .filter((candle) => candle[6] <= now)
    .map((candle) => ({ closeTime: candle[6], close: Number(candle[4]) }))
    .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
  if (candles.length < 49) throw new Error('Not enough Binance candles in the last 24 hours')

  const firstCandle = candles[0]
  const lastCandle = candles[candles.length - 1]
  const currentPrice = lastCandle.close
  return {
    marketId: market.id,
    marketSlug: market.slug,
    marketQuestion: market.question,
    eventStartTime: market.eventStartTime,
    endDate: market.endDate,
    referencePrice,
    symbol: 'BTCUSDT',
    interval: '5m',
    currentPrice,
    dataStart: new Date(firstCandle.closeTime).toISOString(),
    dataEnd: new Date(lastCandle.closeTime).toISOString(),
    candleCount: candles.length,
    generatedAt: new Date().toISOString(),
    horizons: {
      '1': probabilityForHorizon(candles.map((candle) => candle.close), currentPrice, referencePrice, 1),
      '4': probabilityForHorizon(candles.map((candle) => candle.close), currentPrice, referencePrice, 4),
    },
  }
}

export async function fetchBitcoinForecast(market: MarketData): Promise<BitcoinForecast> {
  const key = `${market.id}:${market.slug}`
  const memoryValue = cachedForecasts.get(key)
  if (memoryValue) return memoryValue
  const storedValue = await readForecast(key)
  if (storedValue) {
    cachedForecasts.set(key, storedValue)
    return storedValue
  }
  const pending = forecastRequests.get(key)
  if (pending) return pending

  const request = calculateBitcoinForecast(market)
    .then(async (value) => {
      await writeForecast(key, value)
      cachedForecasts.set(key, value)
      return value
    })
    .finally(() => forecastRequests.delete(key))
  forecastRequests.set(key, request)
  return request
}