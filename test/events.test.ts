import { describe, it, expect } from 'vitest'
import { BrowserEventEmitter, ElectronEvent } from '../src/shared/events.js'

describe('BrowserEventEmitter', () => {
  it('on/emit works', () => {
    const ee = new BrowserEventEmitter()
    const received: unknown[] = []
    ee.on('test', (...args) => received.push(args))
    ee.emit('test', 'a', 'b')
    expect(received).toEqual([['a', 'b']])
  })

  it('once fires only once', () => {
    const ee = new BrowserEventEmitter()
    let count = 0
    ee.once('test', () => count++)
    ee.emit('test')
    ee.emit('test')
    expect(count).toBe(1)
  })

  it('off removes listener', () => {
    const ee = new BrowserEventEmitter()
    let count = 0
    const listener = () => count++
    ee.on('test', listener)
    ee.off('test', listener)
    ee.emit('test')
    expect(count).toBe(0)
  })

  it('removeAllListeners clears specific event', () => {
    const ee = new BrowserEventEmitter()
    ee.on('a', () => {})
    ee.on('b', () => {})
    ee.removeAllListeners('a')
    expect(ee.listenerCount('a')).toBe(0)
    expect(ee.listenerCount('b')).toBe(1)
  })

  it('removeAllListeners with no arg clears everything', () => {
    const ee = new BrowserEventEmitter()
    ee.on('a', () => {})
    ee.on('b', () => {})
    ee.removeAllListeners()
    expect(ee.listenerCount('a')).toBe(0)
    expect(ee.listenerCount('b')).toBe(0)
  })

  it('emit returns false when no listeners', () => {
    const ee = new BrowserEventEmitter()
    expect(ee.emit('nothing')).toBe(false)
  })

  it('emit returns true when listeners exist', () => {
    const ee = new BrowserEventEmitter()
    ee.on('test', () => {})
    expect(ee.emit('test')).toBe(true)
  })
})

describe('ElectronEvent', () => {
  it('supports preventDefault', () => {
    const event = new ElectronEvent()
    expect(event.defaultPrevented).toBe(false)
    event.preventDefault()
    expect(event.defaultPrevented).toBe(true)
  })

  it('supports returnValue', () => {
    const event = new ElectronEvent()
    event.returnValue = 'test'
    expect(event.returnValue).toBe('test')
  })
})
