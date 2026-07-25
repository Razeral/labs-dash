import '@testing-library/jest-dom'

// jsdom does not implement IntersectionObserver. App.tsx uses it to add a
// reveal class as tier sections scroll into view; stub it so that effect is a
// no-op under test instead of throwing.
class IntersectionObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// @ts-expect-error jsdom has no IntersectionObserver typing to satisfy here
globalThis.IntersectionObserver = IntersectionObserverStub
