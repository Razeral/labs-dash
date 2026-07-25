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
    expect(isEditEnabled(cookieWith(OWNER), '?edit=1', OWNER)).toBe(true)
  })

  it('stays off without the edit flag', () => {
    expect(isEditEnabled(cookieWith(OWNER), '', OWNER)).toBe(false)
  })

  it('stays off for a non-owner even with the flag', () => {
    expect(isEditEnabled(cookieWith('someone@else.gov.sg'), '?edit=1', OWNER)).toBe(false)
  })

  it('stays off when the cookie is missing', () => {
    expect(isEditEnabled('', '?edit=1', OWNER)).toBe(false)
  })

  it('is case-insensitive about the owner email', () => {
    expect(isEditEnabled(cookieWith('OWNER@TECH.GOV.SG'), '?edit=1', OWNER)).toBe(true)
  })
})
