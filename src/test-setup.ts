import '@testing-library/jest-dom'
import { vi } from 'vitest'

// jsdom does not implement IntersectionObserver. App.tsx uses it to add a
// reveal class as tier sections scroll into view. This fake records
// observe/unobserve/disconnect calls via vi.fn() and exposes each instance's
// callback so a test can invoke it directly with a synthetic entry — it is
// still a fake (no real intersection geometry), just an inspectable one.
type IntersectionCallback = (entries: IntersectionObserverEntry[]) => void

export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []

  callback: IntersectionCallback
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()

  constructor(callback: IntersectionCallback) {
    this.callback = callback
    FakeIntersectionObserver.instances.push(this)
  }
}

// @ts-expect-error the fake only implements the subset of IntersectionObserver App.tsx uses
globalThis.IntersectionObserver = FakeIntersectionObserver
