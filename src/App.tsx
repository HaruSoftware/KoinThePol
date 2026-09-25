import { useEffect, useRef, useState } from 'react'
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
  currentPrice?: number
  priceChange?: number
  assetIds?: string[]
}

type CompletedEvent = {
  marketId: string
  question: string
  direction: 'UP' | 'DOWN' | null
}

type MarketResult = { resolved: boolean; direction?: 'UP' | 'DOWN' }

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
const formatPriceChange = (value?: number) => value === undefined ? '--' : `${value >= 0 ? '+' : '-'}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const formatPercentChange = (value?: number, reference?: number) => value === undefined || reference === undefined || reference === 0 ? '--' : `${value >= 0 ? '+' : ''}${((value / reference) * 100).toFixed(2)}%`
const formatTime = (value: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(value))
const validDate = (value?: string) => value && Number.isFinite(new Date(value).getTime()) ? value : undefined

function App() {
  const [duration, setDuration] = useState<Duration>(4)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [status, setStatus] = useState<StreamStatus>({ connected: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  const [completedEvent, setCompletedEvent] = useState<CompletedEvent | null>(null)
  const [advanceLoading, setAdvanceLoading] = useState(false)
  const [advanceError, setAdvanceError] = useState<string | null>(null)
  const transitioningMarketId = useRef<string | null>(null)
  const reportDialogRef = useRef<HTMLElement>(null)
  const reportIsOpen = completedEvent !== null

  useEffect(() => {
    let active = true
    const loadDashboard = async () => {
      setLoading(true)
      setError(null)
      setCompletedEvent(null)
      transitioningMarketId.current = null
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

  useEffect(() => {
    if (!reportIsOpen) return

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = reportDialogRef.current
    const focusableElements = dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')
    ;(focusableElements?.[0] ?? dialog)?.focus()

    const keepFocusInDialog = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        return
      }
      if (event.key !== 'Tab' || !dialog) return

      const elements = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')]
      if (elements.length === 0) {
        event.preventDefault()
        dialog.focus()
      } else if (event.shiftKey && document.activeElement === elements[0]) {
        event.preventDefault()
        elements[elements.length - 1].focus()
      } else if (!event.shiftKey && document.activeElement === elements[elements.length - 1]) {
        event.preventDefault()
        elements[0].focus()
      }
    }

    document.addEventListener('keydown', keepFocusInDialog)
    return () => {
      document.removeEventListener('keydown', keepFocusInDialog)
      previousFocus?.focus()
    }
  }, [reportIsOpen])

  const question = status.question ?? forecast?.marketQuestion ?? 'Bitcoin probability forecast'
  const marketStart = validDate(forecast?.eventStartTime) ?? validDate(status.eventStartTime)
  const marketEnd = validDate(forecast?.endDate) ?? validDate(status.endDate)
  const horizon = forecast?.horizons[String(duration) as '1' | '4']
  const bitcoinReferencePrice = status.currentPrice ?? forecast?.currentPrice
  const referencePrice = forecast?.referencePrice ?? status.bitcoinReferencePrice
  const priceChange = status.priceChange ?? (bitcoinReferencePrice !== undefined && referencePrice !== undefined ? bitcoinReferencePrice - referencePrice : undefined)
  const liveUpdatedAt = forecast?.generatedAt
  const secondsLeft = marketEnd ? Math.max(0, Math.floor((new Date(marketEnd).getTime() - clock) / 1000)) : 0
  const remaining = `${Math.floor(secondsLeft / 3600).toString().padStart(2, '0')}:${Math.floor((secondsLeft % 3600) / 60).toString().padStart(2, '0')}:${(secondsLeft % 60).toString().padStart(2, '0')}`
  const modelDirection = (horizon?.upProbability ?? 0) >= (horizon?.downProbability ?? 0) ? 'UP' : 'DOWN'
  const modelProbability = modelDirection === 'UP' ? horizon?.upProbability ?? 0 : horizon?.downProbability ?? 0

  const loadNextEvent = async () => {
    if (!completedEvent || advanceLoading) return
    setAdvanceLoading(true)
    setAdvanceError(null)
    try {
      const nextForecast = await api<Forecast>(`/api/collect/${duration}h/latest`)
      if (nextForecast.marketId === completedEvent.marketId) {
        setAdvanceError('The next event is not available yet. Try again shortly.')
        return
      }
      const nextStatus = await api<StreamStatus>(`/api/collect/${duration}h/status`)
      setForecast(nextForecast)
      setStatus(nextStatus)
      setCompletedEvent(null)
      transitioningMarketId.current = null
    } catch (nextError) {
      setAdvanceError(nextError instanceof Error ? nextError.message : 'Could not load the next event.')
    } finally {
      setAdvanceLoading(false)
    }
  }

  useEffect(() => {
    if (loading || !forecast || !marketEnd || secondsLeft > 0 || transitioningMarketId.current === forecast.marketId) return

    let active = true
    let retryTimer: number | undefined
    transitioningMarketId.current = forecast.marketId

    const settleAndAdvance = async (): Promise<void> => {
      try {
        const result = await api<MarketResult>(`/api/markets/${encodeURIComponent(forecast.marketSlug)}/result`)
        if (!active) return
        if (!result.resolved || !result.direction) {
          setCompletedEvent({ marketId: forecast.marketId, question: forecast.marketQuestion, direction: null })
          retryTimer = window.setTimeout(() => void settleAndAdvance(), 3_000)
          return
        }
        setCompletedEvent({
          marketId: forecast.marketId,
          question: forecast.marketQuestion,
          direction: result.direction,
        })
      } catch {
        retryTimer = window.setTimeout(() => void settleAndAdvance(), 3_000)
      }
    }

    setCompletedEvent({ marketId: forecast.marketId, question: forecast.marketQuestion, direction: null })
    void settleAndAdvance()
    return () => {
      active = false
      if (transitioningMarketId.current === forecast.marketId) transitioningMarketId.current = null
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    }
  }, [duration, forecast, loading, marketEnd, secondsLeft])

  const reportIsCorrect = completedEvent?.direction === modelDirection

  return (
    <>
    <main className="dashboard-shell" aria-hidden={reportIsOpen ? true : undefined} inert={reportIsOpen ? true : undefined}>
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
          <div><p className="eyebrow">POLYMARKET MARKET</p><h2>{question}</h2><p className="market-slug">{forecast?.marketSlug ?? status.slug} · reference {referencePrice === undefined ? '--' : `$${referencePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} {status.slug && <a href={`https://polymarket.com/event/${status.slug}`} target="_blank" rel="noreferrer">Open market ↗</a>}</p></div>
          <div className="market-window"><span>Ends in</span><strong className="countdown">{remaining}</strong><small>{marketStart && formatTime(marketStart)} - {marketEnd && formatTime(marketEnd)}</small></div>
        </section>
        {forecast ? <>
          <section className="btc-ticker"><div className="btc-live-value"><span className="ticker-label">BTC/USDT live price</span><strong>{formatBitcoinPrice(bitcoinReferencePrice)}</strong><span className={priceChange === undefined ? 'price-change' : priceChange >= 0 ? 'price-change positive-change' : 'price-change negative-change'}>{formatPriceChange(priceChange)} <small>{formatPercentChange(priceChange, referencePrice)}</small></span></div><span className="ticker-status">Binance spot</span></section>
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
    {completedEvent && completedEvent.marketId === forecast?.marketId && <div className="report-backdrop">
      <section className="event-report" role="dialog" aria-modal="true" aria-labelledby="report-title" aria-describedby="report-description" tabIndex={-1} ref={reportDialogRef}>
        <header className="report-header"><div><p className="eyebrow">KOIN THE POL · EVENT REPORT</p><h2 id="report-title">{completedEvent.direction ? 'Event complete' : 'Event settling'}</h2></div><span className="report-window">{duration}H WINDOW</span></header>
        <p className="report-question" id="report-description">{completedEvent.question}</p>
        <div className={`report-outcome ${completedEvent.direction === 'UP' ? 'report-up' : completedEvent.direction === 'DOWN' ? 'report-down' : 'report-waiting'}`} aria-live="polite">
          <span>OFFICIAL OUTCOME</span><strong>{completedEvent.direction ?? 'SETTLING'}</strong><small>{completedEvent.direction ? 'Confirmed by Polymarket' : 'Updating while Polymarket settles the market'}</small>
        </div>
        <div className="report-section"><div className="report-section-heading"><h3>Model read</h3><span>{completedEvent.direction ? (reportIsCorrect ? 'Signal matched' : 'Signal missed') : 'Waiting for result'}</span></div>
          <div className="report-metrics"><div><span>Model signal</span><strong className={modelDirection === 'UP' ? 'report-positive' : 'report-negative'}>{modelDirection}</strong></div><div><span>Signal probability</span><strong>{formatPercent(modelProbability)}</strong></div><div><span>Completed sample</span><strong>{horizon?.sampleCount ?? 0} windows</strong></div><div><span>Market reference</span><strong>{formatBitcoinPrice(forecast?.referencePrice)}</strong></div></div>
          <div className="report-probabilities"><div><span>UP</span><strong>{formatPercent(horizon?.upProbability ?? 0)}</strong><div className="report-track"><i className="report-track-up" style={{ width: `${(horizon?.upProbability ?? 0) * 100}%` }} /></div></div><div><span>DOWN</span><strong>{formatPercent(horizon?.downProbability ?? 0)}</strong><div className="report-track"><i className="report-track-down" style={{ width: `${(horizon?.downProbability ?? 0) * 100}%` }} /></div></div></div>
        </div>
        {advanceError && <p className="report-error" role="alert">{advanceError}</p>}
        <footer className="report-footer"><span>{completedEvent.direction ? 'Review complete' : 'Waiting for official settlement'}</span><button type="button" className="next-event-button" onClick={() => void loadNextEvent()} disabled={!completedEvent.direction || advanceLoading}>{advanceLoading ? 'Loading next event...' : 'Next event'} <span aria-hidden="true">→</span></button></footer>
      </section>
    </div>}
    </>
  )
}

export default App
