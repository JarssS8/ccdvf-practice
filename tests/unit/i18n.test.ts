import { describe, expect, it } from 'vitest'
import { en } from '../../src/i18n/en'
import { es } from '../../src/i18n/es'
import { DOMAINS } from '../../src/shared/exam'
import { run } from '../../scripts/i18n.mjs'

type Tree = Record<string, unknown>

/** Every leaf path with its kind, so both dictionaries can be compared shape by shape. */
function shape(o: unknown, prefix = ''): string[] {
  if (Array.isArray(o)) return [`${prefix}:array(${o.length})`]
  if (o && typeof o === 'object') return Object.keys(o).sort().flatMap((k) => shape((o as Tree)[k], prefix ? `${prefix}.${k}` : k))
  return [`${prefix}:${typeof o}`]
}

describe('dictionaries', () => {
  it('Spanish has exactly the same keys and kinds as English', () => {
    expect(shape(es)).toEqual(shape(en))
  })
  it('no Spanish string is left empty', () => {
    const empty: string[] = []
    const walk = (o: unknown, p: string): void => {
      if (typeof o === 'string' && !o.trim()) empty.push(p)
      else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, `${p}.${k}`)
    }
    walk(es, 'es')
    expect(empty).toEqual([])
  })
  it('every exam domain has a label in both languages', () => {
    for (const d of DOMAINS) {
      expect(en.domains[d.name]).toBeTruthy()
      expect(es.domains[d.name]).toBeTruthy()
    }
  })
  it('plural helpers read naturally', () => {
    expect(es.sync.pending(1)).toBe('1 cambio sin subir')
    expect(en.sync.pending(2)).toBe('2 changes not uploaded')
  })
})

describe('Spanish study content', () => {
  it('every translation is current and structurally sound', () => {
    const r = run('check')
    expect(r.issues).toEqual([])
    expect(r.stale).toBe(0)
    expect(r.missing).toBe(0)
  })
})
