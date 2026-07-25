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
      // All app clients share one Cognito pool and one signed-in user, so any ID token
      // found carries the same email claim. Taking the first match is safe.
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

// `#edit` is the documented trigger, and the reason is the auth round-trip rather than taste.
// cognito-at-edge builds its post-login redirect as
//   redirectPath = request.uri + encodeURIComponent('?' + request.querystring)
// and (with CSRF off, which is how labs-auth configures it) uses that string verbatim as the
// `state`, then as the `location` on the way back. So arriving at `/?edit=1` unauthenticated
// lands you on the literal PATH `/%3Fedit%3D1` after login: `location.search` is empty, edit
// mode is off, and the path 404s from S3. A fragment is never sent to the server and browsers
// carry it across redirects, so it survives the login untouched.
//
// `?edit=1` is still honoured for an already-authenticated session, where no redirect occurs.
const editRequested = (search: string, hash: string): boolean =>
  new URLSearchParams(search).has('edit') || hash.replace(/^#/, '') === 'edit'

export const isEditEnabled = (
  cookie: string,
  search: string,
  hash: string,
  ownerEmail: string
): boolean => {
  if (!editRequested(search, hash)) return false
  // Redundant with the email check below, but kept explicitly to make an unset
  // VITE_OWNER_EMAIL (deploy slip) fail closed by construction.
  if (!ownerEmail) return false
  const email = readEmailFromCookie(cookie)
  if (!email) return false
  return email.toLowerCase() === ownerEmail.toLowerCase()
}
