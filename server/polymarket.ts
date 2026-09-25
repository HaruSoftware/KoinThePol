import { config } from './config.js'

export type MarketData = {
  id: string
  slug: string
  question: string
  outcomes: string[]
  outcomePrices: number[]
  clobTokenIds: string[]
  startDate?: string
  eventStartTime?: string
  endDate?: string
  raw: unknown
  bitcoinReferencePrice?: number
}

type MarketResponse = {
  id?: string
  conditionId?: string
  question?: string
  slug?: string
  startDate?: string
  startTime?: string
  eventStartTime?: string
  endDate?: string
  active?: boolean
  closed?: boolean
  clobTokenIds?: string | string[]
  outcomes?: string | string[]
  outcomePrices?: string | number[]
  eventMetadata?: { priceToBeat?: string | number }
  events?: Array<{ eventMetadata?: { priceToBeat?: string | number } }>
}

type EventResponse = {
  markets?: MarketResponse[]
  eventMetadata?: { priceToBeat?: string | number }
}

const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

function hourlyEventSlug(timestamp: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hour12: true,
  }).formatToParts(new Date(timestamp * 1000))
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const hour = values.hour
  const period = values.dayPeriod.toLowerCase()
  return `bitcoin-up-or-down-${monthNames[Number(values.month) - 1]}-${values.day}-${values.year}-${hour}${period}-et`
}

function parseArray(value: string | string[] | number[] | undefined): (string | number)[] {
  if (Array.isArray(value)) return value
  if (!value) return []
  try {
    return JSON.parse(value) as (string | number)[]
  } catch {
    return []
  }
}

export async function fetchBitcoinMarket(durationHours: 1 | 4): Promise<MarketData> {
  const now = Date.now()
  const durationSeconds = durationHours * 60 * 60
  const currentWindow = Math.floor(now / 1000 / durationSeconds) * durationSeconds
  const candidates = [currentWindow, currentWindow - durationSeconds, currentWindow + durationSeconds]
  const markets: MarketResponse[] = []

  for (const timestamp of candidates) {
    const response = await fetch(
      `https://gamma-api.polymarket.com/markets/slug/btc-updown-${durationHours}h-${timestamp}`,
    )
    if (response.ok) markets.push((await response.json()) as MarketResponse)
  }

  if (durationHours === 1 && markets.length === 0) {
    for (const timestamp of candidates) {
      const response = await fetch(`https://gamma-api.polymarket.com/events/slug/${hourlyEventSlug(timestamp)}`)
      if (!response.ok) continue
      const event = (await response.json()) as EventResponse
      markets.push(...(event.markets ?? []).map((market) => ({
        ...market,
        eventMetadata: market.eventMetadata ?? event.eventMetadata,
      })))
    }
  }

  if (markets.length === 0) {
    const baseUrl = new URL(config.polymarketApiUrl)
    baseUrl.searchParams.set('active', 'true')
    baseUrl.searchParams.set('closed', 'false')
    baseUrl.searchParams.set('limit', '100')
    for (let offset = 0; offset < 1000; offset += 100) {
      baseUrl.searchParams.set('offset', String(offset))
      const response = await fetch(baseUrl)
      if (!response.ok) throw new Error(`Polymarket returned HTTP ${response.status}`)
      const page = (await response.json()) as MarketResponse[]
      if (!Array.isArray(page) || page.length === 0) break
      markets.push(...page)
      if (page.length < 100) break
    }
  }

  const market = markets
    .filter((item) => {
      const question = item.question?.toLowerCase() ?? ''
      const slug = item.slug?.toLowerCase() ?? ''
      const start = Date.parse(item.eventStartTime ?? item.startTime ?? item.startDate ?? '')
      const end = Date.parse(item.endDate ?? '')
      return (
        item.active === true &&
        item.closed !== true &&
        question.includes('bitcoin') &&
        question.includes('up') &&
        question.includes('down') &&
        (slug.includes(`-updown-${durationHours}h-`) || (durationHours === 1 && slug.startsWith('bitcoin-up-or-down-')) || question.includes(`${durationHours} hour`)) &&
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start <= now &&
        now < end
      )
    })
    .sort((first, second) => {
      const firstStart = Date.parse(first.eventStartTime ?? first.startTime ?? first.startDate ?? '')
      const secondStart = Date.parse(second.eventStartTime ?? second.startTime ?? second.startDate ?? '')
      return secondStart - firstStart
    })[0]
  if (!market) throw new Error(`No current Bitcoin up/down ${durationHours}h market found`)

  const outcomes = parseArray(market.outcomes).map(String)
  const clobTokenIds = parseArray(market.clobTokenIds).map(String)
  const marketId = market.id ?? market.conditionId
  const upIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === 'up')
  const downIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === 'down')
  if (!marketId || !market.slug || !market.question || upIndex < 0 || downIndex < 0 || clobTokenIds.length <= Math.max(upIndex, downIndex)) {
    throw new Error('Bitcoin market response has an invalid format')
  }
  const outcomePrices = await Promise.all(clobTokenIds.map((tokenId) => fetchClobPrice(tokenId, 'BUY')))
  return {
    id: marketId,
    slug: market.slug,
    question: market.question,
    outcomes,
    outcomePrices,
    clobTokenIds,
    startDate: market.startDate,
    eventStartTime: market.eventStartTime ?? market.startTime,
    endDate: market.endDate,
    raw: market,
    bitcoinReferencePrice: Number.isFinite(Number((market.eventMetadata ?? market.events?.[0]?.eventMetadata)?.priceToBeat))
      ? Number((market.eventMetadata ?? market.events?.[0]?.eventMetadata)?.priceToBeat)
      : undefined,
  }
}

export async function fetchBitcoinMarketResult(slug: string): Promise<{ resolved: boolean; direction?: 'UP' | 'DOWN' }> {
  const response = await fetch(`https://gamma-api.polymarket.com/markets/slug/${encodeURIComponent(slug)}`)
  if (response.status === 404) return { resolved: false }
  if (!response.ok) throw new Error(`Polymarket returned HTTP ${response.status}`)

  const market = (await response.json()) as MarketResponse
  if (market.closed !== true) return { resolved: false }

  const outcomes = parseArray(market.outcomes).map((outcome) => String(outcome).toLowerCase())
  const prices = parseArray(market.outcomePrices).map(Number)
  if (outcomes.length !== prices.length || prices.some((price) => !Number.isFinite(price))) {
    return { resolved: false }
  }
  const winnerIndex = prices.findIndex((price) => price >= 0.99)
  if (winnerIndex < 0 || prices.some((price, index) => index !== winnerIndex && price > 0.01)) {
    return { resolved: false }
  }

  const winner = outcomes[winnerIndex]
  return winner === 'up' || winner === 'down'
    ? { resolved: true, direction: winner.toUpperCase() as 'UP' | 'DOWN' }
    : { resolved: false }
}

type ClobPriceResponse = { price?: string | number }

export async function fetchClobPrice(tokenId: string, side: 'BUY' | 'SELL' = 'BUY'): Promise<number> {
  const response = await fetch(`https://clob.polymarket.com/price?token_id=${encodeURIComponent(tokenId)}&side=${side}`)
  if (!response.ok) throw new Error(`CLOB ${side} price returned HTTP ${response.status}`)
  const data = (await response.json()) as ClobPriceResponse
  const price = Number(data.price)
  if (!Number.isFinite(price)) throw new Error(`CLOB returned an invalid ${side} price for token ${tokenId}`)
  return price
}

