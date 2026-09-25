import { useEffect, useState } from 'react'
import './App.css'

type Duration = 1 | 4

type ForecastHorizon = {
  hours: Duration
  upProbability: number
  downProbability: number
  sampleCount: number
  averageReturn: number
}

type Forecast = {
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

type StreamStatus = {
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
}

const api = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 5000)
  const response = await fetch(path, { ...options, signal: controller.signal }).finally(() => window.clearTimeout(timeout))
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Request failed with ${response.status}`)
  }
  return response.json() as Promise<T>
}

const asNumber = (value: number | string) => Number(value)
const formatPercent = (value: number | string) => `${(asNumber(value) * 100).toFixed(1)}%`
const formatBitcoinPrice = (value?: number) => value === undefined ? '--' : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const formatTime = (value: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(value))
const validDate = (value?: string) => value && Number.isFinite(new Date(value).getTime()) ? value : undefined

function App() {
  const [duration, setDuration] = useState<Duration>(4)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [status, setStatus] = useState<StreamStatus>({ connected: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    let active = true
    const loadDashboard = async () => {
      setLoading(true)
      setError(null)
      const [statusResult, snapshotResult] = await Promise.allSettled([
        api<StreamStatus>(`/api/collect/${duration}h/status`),
        api<Forecast>(`/api/collect/${duration}h/latest`),
      ])
      if (!active) return
      if (statusResult.status === 'fulfilled') setStatus(statusResult.value)
      if (snapshotResult.status === 'fulfilled') setForecast(snapshotResult.value)
      if (snapshotResult.status === 'rejected') {
        setError(snapshotResult.reason instanceof Error ? snapshotResult.reason.message : 'Could not calculate forecast')
      } else if (statusResult.status === 'rejected') {
        setError(statusResult.reason instanceof Error ? statusResult.reason.message : 'Could not load market status')
      }
      setLoading(false)
    }
    void loadDashboard()
    return () => { active = false }
  }, [duration])

  useEffect(() => {
    const refreshLiveStatus = () => {
      void api<StreamStatus>(`/api/collect/${duration}h/status`)
        .then(setStatus)
        .catch(() => undefined)
    }
    const interval = window.setInterval(refreshLiveStatus, 500)
    return () => window.clearInterval(interval)
  }, [duration])

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const question = status.question ?? forecast?.marketQuestion ?? 'Bitcoin probability forecast'
  const marketStart = validDate(status.eventStartTime) ?? validDate(forecast?.eventStartTime)
  const marketEnd = validDate(status.endDate) ?? validDate(forecast?.endDate)
  const horizon = forecast?.horizons[String(duration) as '1' | '4']
  const bitcoinReferencePrice = forecast?.currentPrice
  const referencePrice = forecast?.referencePrice ?? status.bitcoinReferencePrice
  const liveUpdatedAt = forecast?.generatedAt
  const secondsLeft = marketEnd ? Math.max(0, Math.floor((new Date(marketEnd).getTime() - clock) / 1000)) : 0
  const remaining = `${Math.floor(secondsLeft / 3600).toString().padStart(2, '0')}:${Math.floor((secondsLeft % 3600) / 60).toString().padStart(2, '0')}:${(secondsLeft % 60).toString().padStart(2, '0')}`

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark">K</span><div><p className="eyebrow">MARKET OBSERVATORY</p><p className="brand-name">KoinThePol</p></div></div>
        <div className="live-indicator"><span /> Data feed {status.connected ? 'connected' : 'standby'}</div>
      </header>

      <section className="intro-row">
        <div><p className="eyebrow accent-copy">BITCOIN / UP OR DOWN</p><h1>Decision desk</h1><p className="intro-copy">A fixed daily estimate based on completed Binance windows, kept stable until the next UTC day.</p></div>
        <div className="window-switcher" role="tablist" aria-label="Market duration">
          {[1, 4].map((hours) => <button className={duration === hours ? 'window-tab active' : 'window-tab'} key={hours} onClick={() => setDuration(hours as Duration)} role="tab" aria-selected={duration === hours}>{hours}h window</button>)}
        </div>
      </section>

        {error && <div className="notice error-notice"><strong>Could not calculate forecast.</strong> {error}</div>}
          {loading ? <section className="loading-panel">Loading today&apos;s Binance candles<span>...</span></section> : (forecast || status.connected) ? <>
        <section className="market-banner">
          <div><p className="eyebrow">POLYMARKET MARKET</p><h2>{question}</h2><p className="market-slug">{forecast?.marketSlug ?? status.slug} · reference {referencePrice === undefined ? '--' : `$${referencePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</p></div>
          <div className="market-window"><span>Ends in</span><strong className="countdown">{remaining}</strong><small>{marketStart && formatTime(marketStart)} - {marketEnd && formatTime(marketEnd)}</small></div>
        </section>
        {forecast ? <>
          <section className="btc-ticker"><div><span className="ticker-label">BTC/USDT current price</span><strong>{formatBitcoinPrice(bitcoinReferencePrice)}</strong></div><div><span className="ticker-label">Polymarket reference</span><strong>{formatBitcoinPrice(referencePrice)}</strong></div><span className="ticker-status">Binance input / market target</span></section>
          <section className="price-grid" aria-label="Latest market prices">
            <article className="price-card up-card"><div className="card-topline"><span className="direction-dot up-dot" /> UP <span className="contract-label">Model estimate</span></div><strong className="price-value">{formatPercent(horizon?.upProbability ?? 0)}</strong><p className="price-probability">Historical positive outcomes</p><p className="asset-id">{horizon?.sampleCount ?? 0} completed windows</p><div className="price-bar"><span style={{ width: `${(horizon?.upProbability ?? 0) * 100}%` }} /></div></article>
            <article className="price-card down-card"><div className="card-topline"><span className="direction-dot down-dot" /> DOWN <span className="contract-label">Model estimate</span></div><strong className="price-value">{formatPercent(horizon?.downProbability ?? 0)}</strong><p className="price-probability">Historical non-positive outcomes</p><p className="asset-id">{forecast.candleCount} candles analyzed</p><div className="price-bar"><span style={{ width: `${(horizon?.downProbability ?? 0) * 100}%` }} /></div></article>
          </section>
          <section className="details-row">
            <div className="detail-block"><span>Forecast fixed at</span><strong>{liveUpdatedAt && formatTime(liveUpdatedAt)}</strong></div><div className="detail-block"><span>Data window</span><strong>{forecast.dataStart && formatTime(forecast.dataStart)} - {forecast.dataEnd && formatTime(forecast.dataEnd)}</strong></div><div className="detail-block"><span>Market</span><strong className="connected-text">{forecast.marketId}</strong></div>
          </section>
        </> : <section className="empty-panel"><h2>Forecast unavailable</h2><p>{error ?? 'Waiting for enough Binance candles to calculate the forecast.'}</p></section>}
      </> : <section className="empty-panel"><h2>No {duration}h market connected</h2><p>The collector has not started this stream yet. The dashboard only displays collector data.</p></section>}
      <footer className="footer-note"><span>Dashboard mode</span><strong>Read only</strong><span>Daily forecast fixed after first calculation; nothing is persisted.</span></footer>
    </main>
  )
}

export default App
