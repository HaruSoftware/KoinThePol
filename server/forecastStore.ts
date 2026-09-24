import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BitcoinForecast } from './binance.js'

type ForecastCache = Record<string, BitcoinForecast>

const cacheDirectory = path.join(process.cwd(), 'data')
const cacheFile = path.join(cacheDirectory, 'forecast-cache.json')

export async function readForecast(key: string): Promise<BitcoinForecast | undefined> {
  try {
    const content = await readFile(cacheFile, 'utf8')
    const cache = JSON.parse(content) as ForecastCache
    return cache[key]
  } catch {
    return undefined
  }
}

export async function writeForecast(key: string, forecast: BitcoinForecast): Promise<void> {
  await mkdir(cacheDirectory, { recursive: true })
  let cache: ForecastCache = {}
  try {
    cache = JSON.parse(await readFile(cacheFile, 'utf8')) as ForecastCache
  } catch {
    cache = {}
  }
  cache[key] = forecast
  await writeFile(cacheFile, JSON.stringify(cache, null, 2), 'utf8')
}