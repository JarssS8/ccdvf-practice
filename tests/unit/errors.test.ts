import { describe, expect, it } from 'vitest'
import { en } from '../../src/i18n/en'
import { ownText } from '../../src/i18n'

describe('error code lookup (audit: ?error=__proto__ blanked the sign-in page)', () => {
  it('returns own string messages only', () => {
    expect(ownText(en.auth.errors, 'INVALID_TOKEN')).toBe(en.auth.errors.INVALID_TOKEN)
    for (const code of ['__proto__', 'constructor', 'hasOwnProperty', 'toString', 'valueOf', 'bogus', '', null, undefined]) {
      expect(ownText(en.auth.errors, code)).toBeUndefined()
    }
  })
})
