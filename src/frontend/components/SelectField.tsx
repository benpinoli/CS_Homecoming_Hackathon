import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import '../styles/SelectField.css'

interface SelectFieldProps<T extends string> {
  id: string
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}

/** Dropdown styled like the rest of the site (the browser's own menu can't be styled) */
export default function SelectField<T extends string>({ id, label, value, options, onChange }: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [dropUp, setDropUp] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const listId = useId()

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value))
  const selected = options[selectedIndex]

  const openMenu = () => {
    setActive(selectedIndex)
    // Open upward when there isn't room below
    const r = root.current?.getBoundingClientRect()
    setDropUp(!!r && window.innerHeight - r.bottom < options.length * 40 + 24 && r.top > window.innerHeight - r.bottom)
    setOpen(true)
  }

  const choose = (i: number) => {
    onChange(options[i].value)
    setOpen(false)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  // Keep the highlighted option in view
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open) openMenu()
        else setActive((a) => Math.min(last, a + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        if (!open) openMenu()
        else setActive((a) => Math.max(0, a - 1))
        break
      case 'Home':
        if (open) { e.preventDefault(); setActive(0) }
        break
      case 'End':
        if (open) { e.preventDefault(); setActive(last) }
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (open) choose(active)
        else openMenu()
        break
      case 'Escape':
        if (open) { e.preventDefault(); setOpen(false) }
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <div className="form-group dropdown" ref={root}>
      <label id={`${id}-label`} htmlFor={id}>{label}</label>
      <button
        type="button"
        id={id}
        className={`dropdown-button${open ? ' open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${id}-label ${id}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span>{selected?.label}</span>
        <span className="dropdown-chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-labelledby={`${id}-label`}
          className={`dropdown-menu${dropUp ? ' up' : ''}`}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`dropdown-option${i === active ? ' active' : ''}${o.value === value ? ' selected' : ''}`}
              onPointerEnter={() => setActive(i)}
              onPointerDown={(e) => e.preventDefault()} // keep focus on the button
              onClick={() => choose(i)}
            >
              {o.label}
              {o.value === value && <span className="dropdown-check" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
