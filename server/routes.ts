import { Router } from 'express'
import { insertMarketSnapshot, pool } from './db.js'
import { connectMarketStream, streamStatus } from './fourHourStream.js'
import { fetchBitcoinMarket } from './polymarket.js'

export const apiRouter = Router()

apiRouter.get('/health', async (_request, response) => {
  await pool.query('SELECT 1')
  response.json({ status: 'ok' })
})

export async function collectMarket(durationHours: 1 | 4) {
  const market = await fetchBitcoinMarket(durationHours)
  connectMarketStream(durationHours, market)
  const upIndex = market.outcomes.findIndex((outcome) => outcome.toLowerCase() === 'up')
  const downIndex = market.outcomes.findIndex((outcome) => outcome.toLowerCase() === 'down')
  const snapshot = await insertMarketSnapshot(
    market.id,
    market.slug,
    durationHours,
    market.outcomePrices[upIndex],
    market.outcomePrices[downIndex],
    market.raw,
  )
  return { market, snapshot }
}

async function collect(durationHours: 1 | 4, response: Parameters<Parameters<typeof apiRouter.post>[1]>[1], next: Parameters<Parameters<typeof apiRouter.post>[1]>[2]) {
  try {
    const { market, snapshot } = await collectMarket(durationHours)
    response.status(snapshot.created ? 201 : 200).json({ ...market, snapshot })
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
    const result = await pool.query(
      `SELECT id, market_id, duration_hours, up_probability, down_probability,
              observed_at, slug, payload
       FROM market_snapshots
       WHERE duration_hours = $1
       ORDER BY observed_at DESC
       LIMIT 1`,
      [Number(durationHours)],
    )
    const snapshot = result.rows[0]
    if (!snapshot) {
      response.status(404).json({ error: `No ${durationHours}h snapshot found` })
      return
    }
    response.json(snapshot)
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
    const result = await pool.query<{
      id: string
      market_id: string
      up_probability: number
      down_probability: number
    }>(`SELECT id, market_id, up_probability, down_probability
        FROM market_snapshots ORDER BY observed_at DESC LIMIT 1`)
    const snapshot = result.rows[0]
    if (!snapshot) return response.status(404).json({ error: 'No market snapshot available' })

    const direction = snapshot.up_probability >= snapshot.down_probability ? 'UP' : 'DOWN'
    const confidence = Math.abs(snapshot.up_probability - snapshot.down_probability)
    const prediction = await pool.query(
      `INSERT INTO predictions (market_id, direction, confidence, snapshot_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [snapshot.market_id, direction, confidence, snapshot.id],
    )
    response.status(201).json(prediction.rows[0])
  } catch (error) {
    next(error)
  }
})