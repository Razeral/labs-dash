const ID_TOKEN_PATTERN = /CognitoIdentityServiceProvider\.[^.]+\.[^.]+\.idToken=([^;]+)/

const decodeSegment = (segment: string): unknown => {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)))
}

export const readEmailFromCookie = (cookie: string): string | null => {
  const match = cookie.match(ID_TOKEN_PATTERN)
  if (!match) return null
  const parts = match[1].split('.')
  if (parts.length !== 3) return null
  try {
    const payload = decodeSegment(parts[1]) as { email?: unknown }
    return typeof payload.email === 'string' ? payload.email : null
  } catch {
    return null
  }
}

export const isEditEnabled = (cookie: string, search: string, ownerEmail: string): boolean => {
  if (!new URLSearchParams(search).has('edit')) return false
  const email = readEmailFromCookie(cookie)
  return Boolean(email) && email!.toLowerCase() === ownerEmail.toLowerCase()
}
