import express, { type ErrorRequestHandler } from 'express'
import { config } from './config.js'
import { initializeDatabase } from './db.js'
import { apiRouter } from './routes.js'

const app = express()
app.use(express.json())
app.use('/api', apiRouter)

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({ error: 'Internal server error' })
}
app.use(errorHandler)

await initializeDatabase()
app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`))