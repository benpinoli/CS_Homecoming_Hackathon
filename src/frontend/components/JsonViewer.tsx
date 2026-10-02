import { useMemo, useState } from 'react'
import '../styles/JsonViewer.css'

interface JsonViewerProps {
  value: unknown
  /** Levels expanded at first */
  initialDepth?: number
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

const isContainer = (v: Json): v is Json[] | { [key: string]: Json } => typeof v === 'object' && v !== null

const summary = (v: Json[] | { [key: string]: Json }) => {
  const n = Array.isArray(v) ? v.length : Object.keys(v).length
  return Array.isArray(v) ? `${n} item${n === 1 ? '' : 's'}` : `${n} key${n === 1 ? '' : 's'}`
}

function Scalar({ value }: { value: Exclude<Json, Json[] | { [key: string]: Json }> }) {
  if (value === null) return <span className="jv-null">null</span>
  if (typeof value === 'string') return <span className="jv-string">“{value}”</span>
  if (typeof value === 'number') return <span className="jv-number">{value}</span>
  return <span className="jv-bool">{String(value)}</span>
}

function Node({ name, value, depth, openAll, last }: {
  name?: string
  value: Json
  depth: number
  openAll: { open: boolean; version: number } | null
  last: boolean
}) {
  const [openState, setOpen] = useState<{ open: boolean; version: number } | null>(null)
  // An expand/collapse-all click wins over local toggles made before it
  const override = openAll && (!openState || openAll.version > openState.version) ? openAll : openState
  const label = name !== undefined ? <><span className="jv-key">{name}</span><span className="jv-punct">: </span></> : null
  const comma = last ? '' : ','

  if (!isContainer(value)) {
    return (
      <div className="jv-line">
        {label}<Scalar value={value} /><span className="jv-punct">{comma}</span>
      </div>
    )
  }

  const isArray = Array.isArray(value)
  const entries: Array<[string, Json]> = isArray ? value.map((v, i) => [String(i), v]) : Object.entries(value)
  const [openChar, closeChar] = isArray ? ['[', ']'] : ['{', '}']
  const open = override ? override.open : depth < 2
  const toggle = () => setOpen({ open: !open, version: (openAll?.version ?? 0) + Date.now() })

  if (entries.length === 0) {
    return <div className="jv-line">{label}<span className="jv-punct">{openChar}{closeChar}{comma}</span></div>
  }

  return (
    <div className="jv-node">
      <button className="jv-toggle" onClick={toggle} aria-expanded={open}>
        <span className={`jv-arrow${open ? ' open' : ''}`} aria-hidden="true" />
        {label}
        <span className="jv-punct">{openChar}</span>
        {!open && (
          <>
            <span className="jv-summary">{summary(value)}</span>
            <span className="jv-punct">{closeChar}{comma}</span>
          </>
        )}
      </button>
      {open && (
        <>
          <div className="jv-children">
            {entries.map(([k, v], i) => (
              <Node
                key={k}
                name={isArray ? undefined : k}
                value={v}
                depth={depth + 1}
                openAll={openAll}
                last={i === entries.length - 1}
              />
            ))}
          </div>
          <div className="jv-line"><span className="jv-punct">{closeChar}{comma}</span></div>
        </>
      )}
    </div>
  )
}

/** Collapsible, color-coded JSON with expand/collapse-all and copy */
export default function JsonViewer({ value }: JsonViewerProps) {
  const [openAll, setOpenAll] = useState<{ open: boolean; version: number } | null>(null)
  const [copied, setCopied] = useState(false)
  const text = useMemo(() => JSON.stringify(value, null, 2), [value])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="json-viewer">
      <div className="jv-toolbar">
        <button className="btn btn-secondary" onClick={() => setOpenAll({ open: true, version: Date.now() })}>Expand all</button>
        <button className="btn btn-secondary" onClick={() => setOpenAll({ open: false, version: Date.now() })}>Collapse all</button>
        <button className="btn btn-secondary" onClick={copy}>{copied ? 'Copied' : 'Copy JSON'}</button>
      </div>
      <div className="jv-body" role="tree" aria-label="JSON output">
        <Node value={value as Json} depth={0} openAll={openAll} last />
      </div>
    </div>
  )
}
