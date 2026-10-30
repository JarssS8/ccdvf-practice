import { describe, expect, it } from 'vitest'
import { resetEmail, resetLang } from '../../worker/email'

const link = (cb: string) => `https://exam.jarsss8.es/api/auth/reset-password/TOKEN?callbackURL=${encodeURIComponent(cb)}`

describe('password reset email', () => {
  it('takes the language from the callback URL', () => {
    expect(resetLang(link('/?lang=es'))).toBe('es')
    expect(resetLang(link('/?lang=en'))).toBe('en')
    expect(resetLang(link('/'))).toBe('en')
    expect(resetLang('not a url')).toBe('en')
  })
  it('contains the link in both parts and escapes the name', () => {
    const url = link('/?lang=es')
    const m = resetEmail('es', '<b>Eve</b>', url, 'https://exam.jarsss8.es')
    expect(m.subject).toMatch(/Restablece/)
    expect(m.text).toContain(url)
    expect(m.html).toContain('&lt;b&gt;Eve&lt;/b&gt;')
    expect(m.html).not.toContain('<b>Eve</b>')
    expect(m.html).toContain(url.replace(/&/g, '&amp;'))
  })
})
