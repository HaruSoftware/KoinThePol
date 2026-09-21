import { config } from './config.js'

export type MarketData = {
  id: string
  question: string
  outcomes: string[]
  outcomePrices: number[]
  clobTokenIds: string[]
  startDate?: string
  endDate?: string
  raw: unknown
}

type MarketResponse = {
  id?: string
  conditionId?: string
  question?: string
  slug?: string
  startDate?: string
  endDate?: string
  active?: boolean
  closed?: boolean
  clobTokenIds?: string | string[]
  outcomes?: string | string[]
  outcomePrices?: string | number[]
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

  if (markets.length === 0) {
    const response = await fetch(config.polymarketApiUrl)
    if (!response.ok) throw new Error(`Polymarket returned HTTP ${response.status}`)
    const page = (await response.json()) as MarketResponse[]
    if (Array.isArray(page)) markets.push(...page)
  }

  const market = markets
    .filter((item) => {
      const question = item.question?.toLowerCase() ?? ''
      const slug = item.slug?.toLowerCase() ?? ''
      const start = Date.parse(item.startDate ?? '')
      const end = Date.parse(item.endDate ?? '')
      return (
        item.active === true &&
        item.closed !== true &&
        question.includes('bitcoin') &&
        question.includes('up') &&
        question.includes('down') &&
        (slug.includes(`-updown-${durationHours}h-`) || question.includes(`${durationHours} hour`)) &&
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start <= now &&
        now < end
      )
    })
    .sort((first, second) => Date.parse(first.endDate ?? '') - Date.parse(second.endDate ?? ''))[0]
  if (!market) throw new Error(`No current Bitcoin up/down ${durationHours}h market found`)

  const outcomes = parseArray(market.outcomes).map(String)
  const outcomePrices = parseArray(market.outcomePrices).map(Number)
  const clobTokenIds = parseArray(market.clobTokenIds).map(String)
  const marketId = market.id ?? market.conditionId
  if (!marketId || !market.question || outcomes.length < 2 || outcomePrices.length < 2 || clobTokenIds.length < 2) {
    throw new Error('Bitcoin market response has an invalid format')
  }

  return {
    id: marketId,
    question: market.question,
    outcomes,
    outcomePrices,
    clobTokenIds,
    startDate: market.startDate,
    endDate: market.endDate,
    raw: market,
  }
}