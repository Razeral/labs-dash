const decodeSegment = (segment: string): unknown => {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)))
}

const findIdToken = (cookie: string): string | null => {
  // Split on `;` to find individual cookies. Use robust key/value parsing:
  // if a cookie value contains `=` (e.g. base64 padding), rejoin with `=` to preserve it.
  for (const part of cookie.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k.startsWith('CognitoIdentityServiceProvider.') && k.endsWith('.idToken')) {
      return v.join('=')
    }
  }
  return null
}

export const readEmailFromCookie = (cookie: string): string | null => {
  const token = findIdToken(cookie)
  if (!token) return null
  const parts = token.split('.')
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
  // Multiple ID tokens may coexist if the same user has multiple client sessions,
  // but they all carry the same email claim, so taking the first match is safe.
  return email !== null && email.toLowerCase() === ownerEmail.toLowerCase()
}
