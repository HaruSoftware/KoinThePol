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

type StreamStatus = { connected: boolean; marketId?: string }

const api = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, options)
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
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = async (selectedDuration: Duration) => {
    setLoading(true)
    setError(null)
    try {
      const [latest, stream] = await Promise.all([
        api<Snapshot>(`/api/collect/${selectedDuration}h/latest`),
        api<StreamStatus>(`/api/collect/${selectedDuration}h/status`),
      ])
      setSnapshot(latest)
      setStatus(stream)
    } catch (loadError) {
      setSnapshot(null)
      setError(loadError instanceof Error ? loadError.message : 'Could not load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadDashboard(duration) }, [duration])

  const collect = async () => {
    setRefreshing(true)
    setError(null)
    try {
      await api(`/api/collect/${duration}h`, { method: 'POST' })
      await loadDashboard(duration)
    } catch (collectError) {
      setError(collectError instanceof Error ? collectError.message : 'Could not collect market data')
    } finally {
      setRefreshing(false)
    }
  }

  const marketPayload = snapshot?.payload.market ?? snapshot?.payload
  const question = marketPayload?.question ?? 'No market snapshot selected'
  const marketStart = marketPayload?.eventStartTime ?? marketPayload?.startDate
  const marketEnd = marketPayload?.endDate

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
      {loading ? <section className="loading-panel">Reading the latest saved snapshot<span>...</span></section> : snapshot ? <>
        <section className="market-banner">
          <div><p className="eyebrow">CURRENT MARKET</p><h2>{question}</h2><p className="market-slug">{snapshot.slug ?? snapshot.market_id}</p></div>
          <div className="market-window"><span>Window</span><strong>{marketStart && formatTime(marketStart)}</strong><strong>{marketEnd && formatTime(marketEnd)}</strong></div>
        </section>
        <section className="price-grid" aria-label="Latest market prices">
          <article className="price-card up-card"><div className="card-topline"><span className="direction-dot up-dot" /> UP <span className="contract-label">contract price</span></div><strong className="price-value">{formatPercent(snapshot.up_probability)}</strong><div className="price-bar"><span style={{ width: `${asNumber(snapshot.up_probability) * 100}%` }} /></div></article>
          <article className="price-card down-card"><div className="card-topline"><span className="direction-dot down-dot" /> DOWN <span className="contract-label">contract price</span></div><strong className="price-value">{formatPercent(snapshot.down_probability)}</strong><div className="price-bar"><span style={{ width: `${asNumber(snapshot.down_probability) * 100}%` }} /></div></article>
        </section>
        <section className="details-row">
          <div className="detail-block"><span>Last saved</span><strong>{formatTime(snapshot.observed_at)}</strong></div><div className="detail-block"><span>Snapshot</span><strong>#{snapshot.id}</strong></div><div className="detail-block"><span>Stream</span><strong className={status.connected ? 'connected-text' : ''}>{status.connected ? 'Live updates' : 'Not connected'}</strong></div>
          <button className="refresh-button" onClick={() => void collect()} disabled={refreshing} title="Collect and refresh latest market data"><span className={refreshing ? 'refresh-icon spinning' : 'refresh-icon'}>↻</span>{refreshing ? 'Collecting' : 'Collect now'}</button>
        </section>
      </> : <section className="empty-panel"><h2>No {duration}h snapshot yet</h2><p>Collect the current market to create the first saved reading.</p><button className="refresh-button" onClick={() => void collect()} disabled={refreshing}>{refreshing ? 'Collecting' : 'Collect market'}</button></section>}
      <footer className="footer-note"><span>Probability engine</span><strong>Coming next</strong><span>Snapshot data is the current source of truth.</span></footer>
    </main>
  )
}

export default App
