import { Router } from 'express'
import { fetchBitcoinForecast } from './binance.js'
import { connectMarketStream, streamStatus } from './fourHourStream.js'
import { fetchBitcoinMarket } from './polymarket.js'

export const apiRouter = Router()

apiRouter.get('/health', async (_request, response) => {
  response.json({ status: 'ok' })
})

export async function collectMarket(durationHours: 1 | 4) {
  const market = await fetchBitcoinMarket(durationHours)
  connectMarketStream(durationHours, market)
  return { market }
}

async function collect(durationHours: 1 | 4, response: Parameters<Parameters<typeof apiRouter.post>[1]>[1], next: Parameters<Parameters<typeof apiRouter.post>[1]>[2]) {
  try {
    const { market } = await collectMarket(durationHours)
    response.status(200).json({ ...market })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('No current Bitcoin')) {
      response.status(404).json({ error: error.message })
      return
    }
    next(error)
  }
}

apiRouter.post('/collect/1h', (request, response, next) => void collect(1, response, next))
apiRouter.post('/collect/4h', (request, response, next) => void collect(4, response, next))
apiRouter.get('/collect/1h/status', (_request, response) => response.json(streamStatus(1)))
apiRouter.get('/collect/4h/status', (_request, response) => response.json(streamStatus(4)))

async function latestSnapshot(durationHours: string, response: Parameters<Parameters<typeof apiRouter.get>[1]>[1], next: Parameters<Parameters<typeof apiRouter.get>[1]>[2]) {
  if (durationHours !== '1' && durationHours !== '4') {
    response.status(400).json({ error: 'Duration must be 1 or 4 hours' })
    return
  }

  try {
    const market = await fetchBitcoinMarket(Number(durationHours) as 1 | 4)
    connectMarketStream(Number(durationHours) as 1 | 4, market)
    const forecast = await fetchBitcoinForecast(market)
    response.json(forecast)
  } catch (error) {
    next(error)
  }
}

apiRouter.get('/snapshots/:durationHours/latest', (request, response, next) =>
  void latestSnapshot(request.params.durationHours, response, next),
)
apiRouter.get('/collect/1h/latest', (_request, response, next) => void latestSnapshot('1', response, next))
apiRouter.get('/collect/4h/latest', (_request, response, next) => void latestSnapshot('4', response, next))

apiRouter.post('/update', async (_request, response, next) => {
  try {
    const market = await fetchBitcoinMarket(4)
    const forecast = await fetchBitcoinForecast(market)
    const horizon = forecast.horizons['4']
    response.status(200).json({
      direction: horizon.upProbability >= horizon.downProbability ? 'UP' : 'DOWN',
      confidence: Math.abs(horizon.upProbability - horizon.downProbability),
      generated_at: forecast.generatedAt,
      horizon_hours: 4,
    })
  } catch (error) {
    next(error)
  }
})