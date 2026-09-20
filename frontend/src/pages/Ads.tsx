import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { api, errMsg, isAdmin, mediaUrl } from '../services/api'
import type { Assignment, Content, Zone } from '../types'
import { Badge, Button, Card, Empty, ErrorNote, Field, inputCls, PageHeader } from '../components/ui'

const EVERYWHERE = 'all'
const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? 'border-brand-500 bg-brand-600 text-white' : 'border-ink-200 bg-white/70 text-ink-600 hover:border-brand-300'}`
const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}` : `${s} s`)

export default function AdsPage() {
  const admin = isAdmin()
  const [ads, setAds] = useState<Content[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [def, setDef] = useState(10)
  const [defDraft, setDefDraft] = useState(10)
  const [files, setFiles] = useState<File[]>([])
  const [targets, setTargets] = useState<string[]>([])
  const [seconds, setSeconds] = useState('')
  const [view, setView] = useState<string>(EVERYWHERE)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const [c, z, a, s] = await Promise.all([api.get('/content'), api.get('/zones'), api.get('/assignments'), api.get('/settings/ads')])
    setAds(c.data); setZones(z.data); setAssignments(a.data); setDef(s.data.default_duration); setDefDraft(s.data.default_duration)
  }, [])
  useEffect(() => { load() }, [load])

  const zoneKey = view === EVERYWHERE ? null : +view
  const plain = (a: Assignment) => !a.is_emergency && a.group_id == null && !a.start_time
  const playlist = assignments.filter((a) => plain(a) && a.zone_id === zoneKey).sort((x, y) => x.id - y.id)
  const other = assignments.filter((a) => !a.is_emergency && a.zone_id === zoneKey && !plain(a)).length
  const countFor = (k: number | null) => assignments.filter((a) => plain(a) && a.zone_id === k).length
  const adOf = (id: number) => ads.find((c) => c.id === id)
  const loop = playlist.reduce((s, a) => s + (a.content_type === 'video' ? a.content_duration : a.duration ?? a.content_duration), 0)
  const available = ads.filter((c) => !playlist.some((a) => a.content_id === c.id))
  const toggle = (k: string) => setTargets((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]))

  const run = async (fn: () => Promise<unknown>, ok = '') => {
    setErr(''); setMsg('')
    try { await fn(); setMsg(ok); await load() } catch (e) { setErr(errMsg(e)) }
  }

  const upload = async (e: FormEvent) => {
    e.preventDefault(); if (!files.length) return
    setBusy(true); setErr(''); setMsg('')
    let done = 0
    try {
      for (const f of files) {
        const fd = new FormData(); fd.append('file', f); fd.append('name', f.name.replace(/\.[^.]+$/, ''))
        if (seconds) fd.append('duration', seconds)
        if (targets.length) fd.append('zone_ids', targets.join(','))
        await api.post('/content/upload', fd); done++
      }
      setMsg(`Added ${done} ad${done === 1 ? '' : 's'}${targets.length ? ' and put them in the chosen playlists. Displays start playing them now.' : ' to the library. Add them to a playlist below.'}`)
      setFiles([]); if (fileRef.current) fileRef.current.value = ''
    } catch (x) { setErr(`${done} of ${files.length} uploaded. ${errMsg(x)}`) } finally { setBusy(false); load() }
  }

  const setRunTime = (a: Assignment, raw: string) => {
    const v = raw === '' ? null : Math.max(1, Math.min(3600, +raw))
    if (v === a.duration) return
    run(() => api.put(`/assignments/${a.id}`, {
      content_id: a.content_id, zone_id: a.zone_id, group_id: a.group_id, start_time: a.start_time, end_time: a.end_time,
      priority: a.priority, duration: v, is_emergency: a.is_emergency, active: a.active,
    }))
  }

  return (
    <div className="stagger space-y-6">
      <PageHeader title="Ads" subtitle="Add your ads, choose where each one plays and for how long. Displays loop their zone's playlist automatically." />
      <ErrorNote msg={err} />
      {msg && <p role="status" className="rounded-2xl bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-700">{msg}</p>}

      {admin && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Add ads" className="lg:col-span-2">
            <form onSubmit={upload}>
              <Field label="Images or videos (.jpg .png .mp4 .webm). Pick several at once">
                <input ref={fileRef} type="file" multiple accept=".jpg,.jpeg,.png,.mp4,.webm" onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  className={inputCls + ' file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100'} />
              </Field>
              <p className="mb-1.5 text-xs font-semibold text-ink-500">Play in</p>
              <div className="mb-3 flex flex-wrap gap-2">
                <button type="button" aria-pressed={targets.includes(EVERYWHERE)} className={chip(targets.includes(EVERYWHERE))} onClick={() => toggle(EVERYWHERE)}>Everywhere</button>
                {zones.map((z) => <button type="button" key={z.id} aria-pressed={targets.includes(String(z.id))} className={chip(targets.includes(String(z.id)))} onClick={() => toggle(String(z.id))}>{z.name}</button>)}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-44"><Field label="Seconds on screen"><input type="number" min={1} className={inputCls} value={seconds} placeholder={`${def} (default)`} onChange={(e) => setSeconds(e.target.value)} /></Field></div>
                <div className="mb-3"><Button disabled={!files.length || busy}>{busy ? 'Uploading…' : files.length > 1 ? `Add ${files.length} ads` : 'Add ad'}</Button></div>
              </div>
              <p className="text-xs text-ink-400">Leave the zones empty to only keep the ads in the library. Videos always play to their end.</p>
            </form>
          </Card>
          <Card title="Default run time">
            <p className="mb-3 text-sm text-ink-500">How long an image ad stays on screen when you don't set a time. 10 seconds is recommended: long enough to read, short enough that people passing by see several ads.</p>
            <div className="flex items-end gap-2">
              <div className="w-28"><Field label="Seconds"><input type="number" min={1} max={3600} className={inputCls} value={defDraft} onChange={(e) => setDefDraft(+e.target.value)} /></Field></div>
              <div className="mb-3"><Button variant="secondary" disabled={defDraft === def || defDraft < 1} onClick={() => run(() => api.put('/settings/ads', { seconds: defDraft }), 'Default run time saved. It applies to ads added from now on.')}>Save</Button></div>
            </div>
          </Card>
        </div>
      )}

      <Card title="Playlists">
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Playlist location">
          {[{ k: EVERYWHERE, n: 'Everywhere', c: countFor(null) }, ...zones.map((z) => ({ k: String(z.id), n: z.name, c: countFor(z.id) }))].map((t) => (
            <button key={t.k} role="tab" aria-selected={view === t.k} className={chip(view === t.k)} onClick={() => { setView(t.k); setPick('') }}>{t.n} · {t.c}</button>
          ))}
        </div>
        {!playlist.length && <Empty>{view === EVERYWHERE ? 'No ads for everywhere yet' : 'No ads in this zone yet. Displays here show the default content.'}</Empty>}
        <ul className="divide-y divide-ink-100/70">
          {playlist.map((a, i) => {
            const c = adOf(a.content_id)
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="w-5 text-center text-xs text-ink-400">{i + 1}</span>
                <span className="block aspect-video w-24 shrink-0 overflow-hidden rounded-xl bg-ink-900">
                  {c && (c.type === 'image' ? <img src={mediaUrl(c.id, c.version)} alt="" className="h-full w-full object-cover" /> : <video src={mediaUrl(c.id, c.version)} className="h-full w-full object-cover" muted preload="metadata" />)}
                </span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.content_name}</span><Badge tone={a.content_type === 'video' ? 'blue' : 'gray'}>{a.content_type}</Badge></span>
                {a.content_type === 'video'
                  ? <span className="text-xs text-ink-500">plays to the end ({fmt(a.content_duration)})</span>
                  : <label className="flex items-center gap-1.5 text-xs text-ink-500">Runs
                    <input type="number" min={1} disabled={!admin} aria-label={`Seconds for ${a.content_name}`} className={inputCls + ' !w-20 !py-1'} defaultValue={a.duration ?? ''} placeholder={String(a.content_duration)} key={`${a.id}-${a.duration}`}
                      onBlur={(e) => setRunTime(a, e.target.value)} />s</label>}
                {admin && <Button variant="ghost" className="!px-2 !py-1 text-xs !text-red-600" aria-label={`Remove ${a.content_name} from this playlist`} onClick={() => run(() => api.delete(`/assignments/${a.id}`), 'Removed from the playlist.')}>Remove</Button>}
              </li>
            )
          })}
        </ul>
        {playlist.length > 0 && <p className="mt-3 rounded-2xl bg-brand-50/70 px-4 py-2.5 text-sm text-ink-600">Loop: <b>{fmt(loop)}</b> across <b>{playlist.length}</b> ad{playlist.length === 1 ? '' : 's'}, repeating automatically.{other > 0 && ` ${other} more scheduled or group assignment${other === 1 ? '' : 's'} apply here (see Schedules).`}</p>}
        {admin && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select aria-label="Ad to add" className={inputCls + ' !w-72'} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{available.length ? 'Add an ad from the library…' : 'Every ad is already here'}</option>
              {available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Button variant="secondary" disabled={!pick} onClick={() => run(async () => { await api.post('/ads/assign', { content_id: +pick, zone_id: zoneKey }); setPick('') }, 'Added to the playlist.')}>Add to playlist</Button>
          </div>
        )}
        {view !== EVERYWHERE && <p className="mt-3 text-xs text-ink-400">A zone with its own ads plays only those. It does not also play the Everywhere ads.</p>}
      </Card>
    </div>
  )
}
