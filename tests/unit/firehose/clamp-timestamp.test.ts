import { describe, it, expect } from 'vitest'
import { clampCreatedAt } from '../../../src/firehose/clamp-timestamp.js'

describe('clampCreatedAt', () => {
  const now = new Date('2026-02-19T12:00:00.000Z')

  it('returns client timestamp when within acceptable range', () => {
    const clientTime = new Date('2026-02-19T11:30:00.000Z') // 30 min ago
    expect(clampCreatedAt(clientTime, now)).toEqual(clientTime)
  })

  it('returns client timestamp when slightly in the future (< 5 min)', () => {
    const clientTime = new Date('2026-02-19T12:03:00.000Z') // 3 min ahead
    expect(clampCreatedAt(clientTime, now)).toEqual(clientTime)
  })

  it('clamps future timestamps (> 5 min ahead) to now', () => {
    const clientTime = new Date('2026-02-19T12:10:00.000Z') // 10 min ahead
    expect(clampCreatedAt(clientTime, now)).toEqual(now)
  })

  it('clamps far-future timestamps to now', () => {
    const clientTime = new Date('2027-01-01T00:00:00.000Z') // next year
    expect(clampCreatedAt(clientTime, now)).toEqual(now)
  })

  it('clamps very old timestamps (> 1 hour ago) to max past', () => {
    const clientTime = new Date('2026-02-19T10:00:00.000Z') // 2 hours ago
    const maxPast = new Date('2026-02-19T11:00:00.000Z') // 1 hour ago
    expect(clampCreatedAt(clientTime, now)).toEqual(maxPast)
  })

  it('clamps extremely old timestamps to max past', () => {
    const clientTime = new Date('2020-01-01T00:00:00.000Z') // years ago
    const maxPast = new Date('2026-02-19T11:00:00.000Z')
    expect(clampCreatedAt(clientTime, now)).toEqual(maxPast)
  })

  it('returns client timestamp at exactly 5 min future boundary', () => {
    const clientTime = new Date('2026-02-19T12:05:00.000Z') // exactly 5 min
    expect(clampCreatedAt(clientTime, now)).toEqual(clientTime)
  })

  it('returns client timestamp at exactly 1 hour past boundary', () => {
    const clientTime = new Date('2026-02-19T11:00:00.000Z') // exactly 1 hour ago
    expect(clampCreatedAt(clientTime, now)).toEqual(clientTime)
  })

  it('returns client timestamp at exactly now', () => {
    expect(clampCreatedAt(now, now)).toEqual(now)
  })
})
