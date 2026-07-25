import { describe, it, expect } from 'vitest'
import { readEmailFromCookie, isEditEnabled } from './auth'

const OWNER = 'owner@tech.gov.sg'

const fakeIdToken = (email: string) => {
  const payload = btoa(JSON.stringify({ email })).replace(/=+$/, '')
  return `header.${payload}.signature`
}

// Realistic fixture: Cognito username is the email, so it contains dots.
// This is how the cookie actually appears in production.
const cookieWith = (email: string) =>
  `foo=bar; CognitoIdentityServiceProvider.5abc123def456.${email}.idToken=${fakeIdToken(email)}; baz=qux`

describe('readEmailFromCookie', () => {
  it('extracts the email claim from the id token', () => {
    expect(readEmailFromCookie(cookieWith(OWNER))).toBe(OWNER)
  })

  it('returns null when no id token cookie is present', () => {
    expect(readEmailFromCookie('foo=bar')).toBeNull()
  })

  it('returns null on a malformed token', () => {
    expect(readEmailFromCookie('CognitoIdentityServiceProvider.a.b.idToken=garbage')).toBeNull()
  })

  it('returns null on an empty cookie string', () => {
    expect(readEmailFromCookie('')).toBeNull()
  })

  it('extracts email when the username (cookie key segment) contains dots', () => {
    // Regression guard: the old regex required dot-free username, but real Cognito
    // usernames are email addresses (with dots). This test ensures the implementation
    // works with the actual cookie structure.
    const realCookie = `foo=bar; CognitoIdentityServiceProvider.abc123.alice.bob@example.com.idToken=${fakeIdToken(OWNER)}; baz=qux`
    expect(readEmailFromCookie(realCookie)).toBe(OWNER)
  })

  it('handles token values with base64 padding (= characters)', () => {
    // Some payloads encode to base64 with = padding. The cookie value parser
    // must rejoin on = to preserve the full token.
    const payload = btoa(JSON.stringify({ email: OWNER }))
    const token = `header.${payload}.signature`
    const paddedCookie = `CognitoIdentityServiceProvider.abc123.${OWNER}.idToken=${token}`
    expect(readEmailFromCookie(paddedCookie)).toBe(OWNER)
  })

  it('decodes base64url characters (- and _) in the payload', () => {
    // Base64url uses - and _ instead of + and /. Ensure they are properly
    // translated before decoding.
    // Construct a payload that will encode with - or _ by crafting the JSON.
    const payloadObj = { email: OWNER, sub: 'user-with_special.chars' }
    const payload = btoa(JSON.stringify(payloadObj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const token = `header.${payload}.signature`
    const cookie = `CognitoIdentityServiceProvider.abc123.${OWNER}.idToken=${token}`
    expect(readEmailFromCookie(cookie)).toBe(OWNER)
  })
})

describe('isEditEnabled', () => {
  it('enables for the owner with the edit flag', () => {
    expect(isEditEnabled(cookieWith(OWNER), '?edit=1', '', OWNER)).toBe(true)
  })

  it('stays off without the edit flag', () => {
    expect(isEditEnabled(cookieWith(OWNER), '', '', OWNER)).toBe(false)
  })

  it('stays off for a non-owner even with the flag', () => {
    expect(isEditEnabled(cookieWith('someone@else.gov.sg'), '?edit=1', '', OWNER)).toBe(false)
  })

  it('stays off when the cookie is missing', () => {
    expect(isEditEnabled('', '?edit=1', '', OWNER)).toBe(false)
  })

  it('is case-insensitive about the owner email', () => {
    expect(isEditEnabled(cookieWith('OWNER@TECH.GOV.SG'), '?edit=1', '', OWNER)).toBe(true)
  })

  it('never enables edit when ownerEmail is empty (deploy-slip guard)', () => {
    // If VITE_OWNER_EMAIL is not set at build time, ownerEmail becomes ''.
    // This must never allow edit mode, even with a valid cookie and edit flag.
    expect(isEditEnabled(cookieWith(OWNER), '?edit=1', '', '')).toBe(false)
  })

  it('never enables edit when decoded email is empty', () => {
    // A cookie with an empty email claim must never enable edit mode.
    // This also covers the case where both email and ownerEmail are empty.
    const emptyEmailCookie = `CognitoIdentityServiceProvider.abc123.${OWNER}.idToken=${fakeIdToken('')}`
    expect(isEditEnabled(emptyEmailCookie, '?edit=1', '', '')).toBe(false)
  })

  it('enables for the owner via the #edit fragment', () => {
    // The documented trigger. A fragment survives the cognito-at-edge login redirect;
    // a query string does not.
    expect(isEditEnabled(cookieWith(OWNER), '', '#edit', OWNER)).toBe(true)
  })

  it('stays off for an unrelated fragment', () => {
    expect(isEditEnabled(cookieWith(OWNER), '', '#something', OWNER)).toBe(false)
  })

  it('stays off on the path cognito-at-edge produces when ?edit=1 survives a login', () => {
    // REGRESSION: arriving at /?edit=1 unauthenticated lands on the literal path
    // `/%3Fedit%3D1` after login -- search and hash are both empty, so edit must be off.
    // This is the live bug that made drag-and-drop appear broken.
    expect(isEditEnabled(cookieWith(OWNER), '', '', OWNER)).toBe(false)
  })

  it('never enables edit when the decoded email is empty and an owner is configured', () => {
    // Isolating test for the `if (!email) return false` guard.
    // With a non-empty ownerEmail, an empty decoded email must fail.
    expect(isEditEnabled(cookieWith(''), '?edit=1', '', OWNER)).toBe(false)
  })
})
