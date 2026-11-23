import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'

export const auth = createAuthClient({
  baseURL: window.location.origin,
  plugins: [inferAdditionalFields({ user: { role: { type: 'string', input: false } } })],
})
