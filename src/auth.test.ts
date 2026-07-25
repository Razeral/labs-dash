import { describe, it, expect } from 'vitest'
import { readEmailFromCookie, isEditEnabled } from './auth'

const OWNER = 'owner@tech.gov.sg'

const fakeIdToken = (email: string) => {
  const payload = btoa(JSON.stringify({ email })).replace(/=+$/, '')
  return `header.${payload}.signature`
}

const cookieWith = (email: string) =>
  `foo=bar; CognitoIdentityServiceProvider.abc123.someone.idToken=${fakeIdToken(email)}; baz=qux`

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
