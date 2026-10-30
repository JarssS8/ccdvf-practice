// Password-reset email in the language the request came from (the app passes it in the callback URL).

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const COPY = {
  es: {
    subject: 'Restablece tu contraseña · CCDV-F Practice',
    hello: (n: string) => `Hola${n ? `, ${n}` : ''}:`,
    body: 'Hemos recibido una petición para restablecer la contraseña de tu cuenta en CCDV-F Practice. Pulsa el botón para elegir una nueva. El enlace caduca en 1 hora y solo funciona una vez.',
    button: 'Elegir contraseña nueva',
    ignore: 'Si no lo has pedido tú, ignora este email: tu contraseña no cambia. Al restablecerla se cierran todas tus sesiones abiertas.',
    footer: 'Proyecto independiente, sin relación con Anthropic.',
  },
  en: {
    subject: 'Reset your password · CCDV-F Practice',
    hello: (n: string) => `Hi${n ? ` ${n}` : ''},`,
    body: 'We received a request to reset the password of your CCDV-F Practice account. Use the button to choose a new one. The link expires in 1 hour and works only once.',
    button: 'Choose a new password',
    ignore: "If you didn't ask for this, ignore this email: your password stays the same. Resetting it signs you out everywhere.",
    footer: 'Independent project, not affiliated with Anthropic.',
  },
}

/** Language requested by the app: `?lang=` inside the reset link's callbackURL. */
export function resetLang(url: string): 'es' | 'en' {
  try {
    const cb = new URL(url).searchParams.get('callbackURL') ?? ''
    return new URL(cb, 'https://x').searchParams.get('lang') === 'es' ? 'es' : 'en'
  } catch { return 'en' }
}

export function resetEmail(lang: 'es' | 'en', name: string, url: string, site: string) {
  const c = COPY[lang]
  const text = `${c.hello(name)}\n\n${c.body}\n\n${url}\n\n${c.ignore}\n\n— CCDV-F Practice · ${site}\n${c.footer}\n`
  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;background:#ECE9E1;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:#14161A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:22px"><tr><td style="padding:28px">
<p style="margin:0 0 16px;font-weight:700;font-size:18px">CCDV-F Practice</p>
<p style="margin:0 0 12px;font-size:16px">${esc(c.hello(name))}</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5">${esc(c.body)}</p>
<p style="margin:0 0 24px"><a href="${esc(url)}" style="display:inline-block;background:#2B4EFF;color:#FFFFFF;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:999px">${esc(c.button)}</a></p>
<p style="margin:0 0 12px;font-size:13px;color:#5C5F66;line-height:1.5">${esc(c.ignore)}</p>
<p style="margin:0;font-size:12px;color:#5C5F66;word-break:break-all">${esc(url)}</p>
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#5C5F66">${esc(site)} · ${esc(c.footer)}</p>
</td></tr></table></body></html>`
  return { subject: c.subject, text, html }
}
