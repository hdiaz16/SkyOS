import { describe, expect, it } from 'vitest'
import { anchors, mix, paletteAt, phaseAt } from './daylight'

const at = (h: number, m = 0) => h * 60 + m

describe('the day behind the desk', () => {
  it('hangs its anchors from sunrise and sunset, in order around the clock', () => {
    const list = anchors({ sunrise: at(6, 30), sunset: at(19, 30) })
    expect(list.map((a) => a.phase)).toEqual(['noche', 'alba', 'mañana', 'mediodía', 'tarde', 'ocaso', 'anochecer', 'noche'])
    expect(list.map((a) => a.at)).toEqual([at(5), at(6, 10), at(8, 30), at(13), at(17), at(19, 30), at(20, 40), at(22, 30)])
  })

  it('names the hour by the nearest anchor', () => {
    expect(phaseAt(at(9))).toBe('mañana')
    expect(phaseAt(at(13, 10))).toBe('mediodía')
    expect(phaseAt(at(19, 25))).toBe('ocaso')
    expect(phaseAt(at(2))).toBe('noche')
    expect(phaseAt(at(23, 59))).toBe('noche')
  })

  it('is exactly the morning in the field at the morning anchor, light and dark', () => {
    expect(paletteAt(at(8, 30), false)).toMatchObject({ bgA: '#e8eee8', blob1: '#b9d4b3', hill2: '#cfdccf' })
    expect(paletteAt(at(8, 30), true)).toMatchObject({ bgA: '#0e1512', blob1: '#1e3b30' })
  })

  it('mixes between anchors instead of jumping', () => {
    const before = paletteAt(at(13), false)
    const mid = paletteAt(at(15), false)
    const after = paletteAt(at(17), false)
    expect(mid.bgA).not.toBe(before.bgA)
    expect(mid.bgA).not.toBe(after.bgA)
    // Halfway in time is halfway in colour: the easing is symmetric.
    expect(mid.blob3).toBe(mix(before.blob3, after.blob3, 0.5))
  })

  it('carries the night across midnight without sliding back to the sunset', () => {
    expect(paletteAt(at(23, 30), false)).toEqual(paletteAt(at(3), false))
    expect(paletteAt(at(0), false).bgA).toBe(paletteAt(at(22, 30), false).bgA)
  })

  it('walks the sun from left to right and high at noon', () => {
    expect(paletteAt(at(6, 10), false).sunX).toBeLessThan(paletteAt(at(13), false).sunX)
    expect(paletteAt(at(13), false).sunX).toBeLessThan(paletteAt(at(19, 30), false).sunX)
    expect(paletteAt(at(13), false).sunY).toBeLessThan(paletteAt(at(6, 10), false).sunY)
  })

  it('lets a long northern day move its anchors past midnight', () => {
    const sun = { sunrise: at(4), sunset: at(22, 30) }
    expect(anchors(sun)[0]).toMatchObject({ phase: 'noche', at: at(1, 30) })
    expect(phaseAt(at(0, 30), sun)).toBe('anochecer')
    expect(phaseAt(at(2), sun)).toBe('noche')
  })

  it('mix stays on its ends and meets in the middle', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})
