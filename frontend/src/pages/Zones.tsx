import { useCallback, useEffect, useState } from 'react'
import { api, errMsg, isAdmin } from '../services/api'
import type { Zone } from '../types'
import { useDevices } from '../hooks/useDevices'
import MapView from '../components/MapView'
import { CityPicker } from '../components/zones/CityPicker'
import { Badge, Button, Card, Empty, ErrorNote, Field, inputCls, PageHeader } from '../components/ui'

const circlePolygon = ([lat, lng]: [number, number], km: number, n = 32): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n
    return [+(lat + (km / 111) * Math.sin(a)).toFixed(5), +(lng + (km / (111 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a)).toFixed(5)] as [number, number]
  })

export default function Zones() {
  const [zones, setZones] = useState<Zone[]>([])
  const { devices: deviceList } = useDevices()
  const devices = deviceList ?? []
  const [selected, setSelected] = useState<number | null>(null)
  const [mode, setMode] = useState<'none' | 'polygon' | 'circle'>('none')
  const [draft, setDraft] = useState<[number, number][]>([])
  const [preview, setPreview] = useState<[number, number][] | null>(null)
  const [radius, setRadius] = useState(30)
  const [form, setForm] = useState({ name: '', priority: 10, color: '#3b82f6' })
  const [err, setErr] = useState('')
  const admin = isAdmin()

  const load = useCallback(() => {
    api.get('/zones').then((r) => setZones(r.data))
  }, [])
  useEffect(() => { load() }, [load])

  const onMapClick = (p: [number, number]) => {
    if (mode === 'polygon') setDraft((d) => [...d, p])
    else if (mode === 'circle') setDraft(circlePolygon(p, radius))
  }
  const cancel = () => { setMode('none'); setDraft([]); setErr('') }
  const create = async () => {
    setErr('')
    try {
      const { data } = await api.post('/zones', { name: form.name, polygon: draft, priority: form.priority, color: form.color })
      cancel(); setForm({ ...form, name: '' }); load(); setSelected(data.id)
    } catch (e) { setErr(errMsg(e)) }
  }

  return (
    <div className="stagger space-y-6">
      <PageHeader title="Zones & map" subtitle="Draw geofences, then decide what plays inside each one."
        actions={admin && mode === 'none' && <><Button onClick={() => setMode('polygon')}>✎ Draw polygon</Button><Button variant="secondary" onClick={() => setMode('circle')}>◯ Circle by radius</Button></>} />
      {mode !== 'none' && (
        <Card title={mode === 'polygon' ? 'Click the map to add corners (min. 3)' : 'Click the map to place the zone centre'}>
          <ErrorNote msg={err} />
          <div className={`grid gap-x-4 gap-y-1 sm:grid-cols-2 ${mode === 'circle' ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
            <Field label="Zone name"><input className={inputCls} placeholder="e.g. Connaught Place…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Priority"><input type="number" className={inputCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: +e.target.value })} /></Field>
            {mode === 'circle' && <Field label="Radius (km)"><input type="number" min={1} className={inputCls} value={radius} onChange={(e) => setRadius(+e.target.value)} /></Field>}
            <Field label="Colour">
              <span className="relative flex h-[38px] items-center gap-2.5 rounded-2xl border border-ink-200 bg-white/80 px-3 focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100">
                <span className="size-5 shrink-0 rounded-full ring-2 ring-white shadow" style={{ background: form.color }} aria-hidden="true" />
                <span className="font-mono text-xs uppercase text-ink-500">{form.color}</span>
                <input type="color" aria-label="Zone colour" className="absolute inset-0 size-full cursor-pointer opacity-0" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
              </span>
            </Field>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-ink-100/70 pt-4">
            <p className="mr-auto text-xs text-ink-400">Higher priority wins where zones overlap.</p>
            <Button variant="ghost" onClick={cancel}>Cancel</Button>
            {mode === 'polygon' && <Button variant="secondary" disabled={!draft.length} onClick={() => setDraft((d) => d.slice(0, -1))}>Undo</Button>}
            <Button className="whitespace-nowrap" disabled={draft.length < 3 || !form.name} onClick={create}>Save zone</Button>
          </div>
        </Card>
      )}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2"><MapView zones={zones} devices={devices} draft={draft} preview={preview} height={520} selectedZone={selected}
          onMapClick={mode !== 'none' ? onMapClick : undefined} onZoneClick={(z) => mode === 'none' && setSelected(z.id)} /></Card>
        <div className="space-y-6">
          {admin && (
            <Card title="Add a city">
              <p className="mb-3 text-sm text-ink-500">Pick a city and its boundary becomes a zone instantly. No drawing needed.</p>
              <CityPicker onPreview={setPreview} onCreated={(z) => { load(); setSelected(z.id) }} />
            </Card>
          )}
          <Card title="Zones">
            <ul className="divide-y divide-ink-100/70">
              {zones.map((z) => (
                <li key={z.id} className={`flex cursor-pointer items-center gap-2 py-2 ${selected === z.id ? 'font-semibold' : ''}`} onClick={() => setSelected(z.id)}>
                  <span className="h-3 w-3 rounded-full" style={{ background: z.color }} />{z.name}
                  <Badge tone="gray">P{z.priority}</Badge>
                  <span className="text-xs text-ink-400">{devices.filter((d) => d.zone_id === z.id).length} device(s)</span>
                  {admin && <button className="ml-auto text-ink-400 hover:text-red-600" onClick={async (e) => { e.stopPropagation(); if (confirm(`Delete ${z.name} and its assignments?`)) { await api.delete(`/zones/${z.id}`); if (selected === z.id) setSelected(null); load() } }}>✕</button>}
                </li>
              ))}
            </ul>
            {!zones.length && <Empty>No zones — draw one on the map</Empty>}
          </Card>
        </div>
      </div>
    </div>
  )
}
