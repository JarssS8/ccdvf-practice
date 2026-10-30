import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({ basePath: '/api/auth' })

export type Provider = 'google' | 'github'
export const PROVIDERS: { id: Provider; label: string }[] = [{ id: 'google', label: 'Google' }, { id: 'github', label: 'GitHub' }]
