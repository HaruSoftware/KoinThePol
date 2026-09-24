import express, { type ErrorRequestHandler } from 'express'
import { config } from './config.js'
import { apiRouter, collectMarket } from './routes.js'

const app = express()
app.use(express.json())
app.use('/api', apiRouter)

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({ error: 'Internal server error' })
}
app.use(errorHandler)

app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`))

let collectionRunning = false
const refreshMarkets = async (): Promise<void> => {
  if (collectionRunning) return
  collectionRunning = true
  try {
    await Promise.allSettled(([1, 4] as const).map(async (durationHours) => {
      try {
        await collectMarket(durationHours)
      } catch (error) {
        console.error(`Unable to collect ${durationHours}h market`, error)
      }
    }))
  } finally {
    collectionRunning = false
  }
}

void refreshMarkets()
setInterval(() => void refreshMarkets(), 60_000)