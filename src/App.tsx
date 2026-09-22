import { useEffect, useState } from 'react'
import './App.css'

type Duration = 1 | 4

type Snapshot = {
  id: string
  market_id: string
  duration_hours: Duration
  up_probability: number | string
  down_probability: number | string
  observed_at: string
  slug: string | null
  payload: {
    question?: string
    eventStartTime?: string
    startDate?: string
    endDate?: string
    market?: {
      question?: string
      eventStartTime?: string
      startDate?: string
      endDate?: string
    }
  }
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
const formatTime = (value: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(value))

function App() {
  const [duration, setDuration] = useState<Duration>(4)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [status, setStatus] = useState<StreamStatus>({ connected: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clock, setClock] = useState(() => Date.now())

  const loadDashboard = async (selectedDuration: Duration) => {
    setLoading(true)
    setError(null)
    try {
      const stream = await api<StreamStatus>(`/api/collect/${selectedDuration}h/status`)
      setStatus(stream)
      setLoading(false)
      void api<Snapshot>(`/api/collect/${selectedDuration}h/latest`)
        .then(setSnapshot)
        .catch(() => undefined)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load dashboard data')
      setLoading(false)
    }
  }

  useEffect(() => { void loadDashboard(duration) }, [duration])

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

  const marketPayload = snapshot?.payload.market ?? snapshot?.payload
  const question = status.question ?? marketPayload?.question ?? 'Live market connected'
  const marketStart = status.eventStartTime ?? marketPayload?.eventStartTime ?? marketPayload?.startDate
  const marketEnd = status.endDate ?? marketPayload?.endDate
  const upProbability = status.upProbability ?? asNumber(snapshot?.up_probability ?? 0)
  const downProbability = status.downProbability ?? asNumber(snapshot?.down_probability ?? 0)
  const liveUpdatedAt = status.updatedAt ?? snapshot?.observed_at
  const secondsLeft = marketEnd ? Math.max(0, Math.floor((new Date(marketEnd).getTime() - clock) / 1000)) : 0
  const remaining = `${Math.floor(secondsLeft / 3600).toString().padStart(2, '0')}:${Math.floor((secondsLeft % 3600) / 60).toString().padStart(2, '0')}:${(secondsLeft % 60).toString().padStart(2, '0')}`

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark">K</span><div><p className="eyebrow">MARKET OBSERVATORY</p><p className="brand-name">KoinThePol</p></div></div>
        <div className="live-indicator"><span /> Data feed {status.connected ? 'connected' : 'standby'}</div>
      </header>

      <section className="intro-row">
        <div><p className="eyebrow accent-copy">BITCOIN / UP OR DOWN</p><h1>Decision desk</h1><p className="intro-copy">The latest saved market prices, arranged for a quick read before the next move.</p></div>
        <div className="window-switcher" role="tablist" aria-label="Market duration">
          {[1, 4].map((hours) => <button className={duration === hours ? 'window-tab active' : 'window-tab'} key={hours} onClick={() => setDuration(hours as Duration)} role="tab" aria-selected={duration === hours}>{hours}h window</button>)}
        </div>
      </section>

      {error && <div className="notice error-notice"><strong>No snapshot available.</strong> {error}</div>}
          {loading ? <section className="loading-panel">Connecting to the live market<span>...</span></section> : (snapshot || status.connected) ? <>
        <section className="market-banner">
          <div><p className="eyebrow">{status.connected ? 'LIVE MARKET' : 'LAST SAVED MARKET'}</p><h2>{question}</h2><p className="market-slug">{status.slug ?? snapshot?.slug ?? snapshot?.market_id}</p></div>
          <div className="market-window"><span>Ends in</span><strong className="countdown">{remaining}</strong><small>{marketStart && formatTime(marketStart)} - {marketEnd && formatTime(marketEnd)}</small></div>
        </section>
        <section className="price-grid" aria-label="Latest market prices">
          <article className="price-card up-card"><div className="card-topline"><span className="direction-dot up-dot" /> UP <span className="contract-label">Polymarket price</span></div><strong className="price-value">{formatPercent(upProbability)}</strong><p className="asset-id">{status.assetIds?.[0] ?? 'asset pending'}</p><div className="price-bar"><span style={{ width: `${upProbability * 100}%` }} /></div></article>
          <article className="price-card down-card"><div className="card-topline"><span className="direction-dot down-dot" /> DOWN <span className="contract-label">Polymarket price</span></div><strong className="price-value">{formatPercent(downProbability)}</strong><p className="asset-id">{status.assetIds?.[1] ?? 'asset pending'}</p><div className="price-bar"><span style={{ width: `${downProbability * 100}%` }} /></div></article>
        </section>
        <section className="details-row">
          <div className="detail-block"><span>{status.connected ? 'WebSocket update' : 'Last saved'}</span><strong>{liveUpdatedAt && formatTime(liveUpdatedAt)}</strong></div><div className="detail-block"><span>Snapshot</span><strong>{snapshot ? `#${snapshot.id}` : 'Not saved yet'}</strong></div><div className="detail-block"><span>Stream</span><strong className={status.connected ? 'connected-text' : ''}>{status.connected ? 'Live updates' : 'Not connected'}</strong></div>
        </section>
      </> : <section className="empty-panel"><h2>No {duration}h market connected</h2><p>The collector has not started this stream yet. The dashboard only displays collector data.</p></section>}
      <footer className="footer-note"><span>Dashboard mode</span><strong>Read only</strong><span>Collector and persistence run independently.</span></footer>
    </main>
  )
}

export default App
