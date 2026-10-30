// Textos legales en español (versión de referencia). Mantener en sincronía con en.ts y con lo que hace el código.
import { LEGAL_INFO as I } from './info'

export const es: Record<string, string> = {
  aviso: `
## Titular

- **Titular**: ${I.owner} (persona física, proyecto personal)
- **Contacto**: [${I.email}](mailto:${I.email})
- **Sitio web**: ${I.site}
- **Código fuente**: [${I.repo}](${I.repo})

${I.siteName} es un proyecto personal, gratuito y sin ánimo de lucro: no tiene publicidad, no cobra nada y no realiza actividad económica.

## Objeto

Esta web ofrece material de práctica para preparar el examen *Claude Certified Developer – Foundations*: simulacros, ejercicios por dominio, tarjetas de repaso, apuntes y un tutor de IA.

## Sin relación con Anthropic

Es un proyecto **independiente**. No está creado, patrocinado, revisado ni respaldado por Anthropic PBC. «Claude» y «Anthropic» son marcas de sus respectivos titulares y aquí solo se citan para identificar el examen. Las preguntas no son las del examen oficial ni garantizan aprobarlo. Para la información oficial, consulta los canales de Anthropic.

## Propiedad intelectual

- El **código** de la app se publica con licencia MIT en el repositorio indicado.
- Las **preguntas, tarjetas, apuntes y novedades** proceden del repositorio comunitario [Amey-Thakur/CLAUDE-CERTIFICATIONS](https://github.com/Amey-Thakur/CLAUDE-CERTIFICATIONS) (licencia MIT, © ${I.contentYear} Amey Thakur). Las traducciones al español son propias.
- Los **ejemplos y el temario por dominio** proceden de la guía oficial del examen publicada por Anthropic (© Anthropic) y se citan con fines educativos. Si eres titular de algún contenido y quieres que se retire, escribe al email de contacto.

## Responsabilidad

El contenido se ofrece «tal cual», sin garantía de exactitud ni de que esté actualizado. Las preguntas y respuestas generadas por IA pueden contener errores. El titular no responde de los daños derivados del uso de la web, salvo en los casos en que la ley no permita excluir esa responsabilidad.

## Legislación aplicable

Esta web se rige por la legislación española. Las condiciones de uso están en los [términos de uso](#/legal/terminos) y el tratamiento de datos en la [política de privacidad](#/legal/privacidad).
`,

  privacidad: `
Esta política explica qué datos personales trata ${I.siteName} (${I.site}), para qué y con qué derechos cuentas, conforme al Reglamento (UE) 2016/679 (RGPD) y a la Ley Orgánica 3/2018 (LOPDGDD).

## Responsable del tratamiento

- **Responsable**: ${I.owner}
- **Contacto**: [${I.email}](mailto:${I.email})

## Qué datos tratamos

| Datos | Cuándo |
| --- | --- |
| Nombre y email | Al crear la cuenta. |
| Contraseña | Solo si te registras con email. Nunca se guarda en claro: se guarda una huella irreversible (PBKDF2-SHA256 con sal). |
| Identificador de tu cuenta de Google o GitHub, nombre, email y foto de perfil | Solo si entras con Google o GitHub. No se guardan los tokens de acceso de esos servicios. |
| Progreso de estudio: intentos, respuestas, preguntas marcadas, repasos de tarjetas, fecha de tu examen y preguntas que generes con IA | Mientras usas la app. |
| Dirección IP y navegador (user-agent) de cada sesión | Al iniciar sesión. |
| Dirección IP en contadores de intentos | Al iniciar sesión, registrarte o borrar la cuenta, para frenar ataques. |
| Número de usos diarios de la IA | Al usar el tutor o generar preguntas. |
| La pregunta que estás repasando, tu respuesta y los mensajes que escribes al tutor | Solo si usas el tutor IA y lo has aceptado. |

## Para qué y con qué base legal

1. **Prestarte el servicio**: crear y mantener tu cuenta, guardar tu progreso y sincronizarlo entre dispositivos. Base: ejecución de las condiciones de uso que aceptas al registrarte (art. 6.1.b RGPD).
2. **Seguridad y prevención de abusos**: sesiones, límites de intentos y de uso de la IA. Base: interés legítimo en proteger el servicio y a sus usuarios (art. 6.1.f RGPD).
3. **Tutor IA**: enviar la pregunta y tus mensajes al proveedor de IA para obtener la respuesta. Base: tu consentimiento (art. 6.1.a RGPD), que das la primera vez que usas el tutor y puedes retirar en cualquier momento en Ajustes. Retirarlo no afecta a lo tratado antes.

No hay publicidad, analítica ni perfiles, no se venden ni ceden datos y no se toman decisiones automatizadas con efectos sobre ti.

## Quién más trata tus datos

- **Cloudflare, Inc.** aloja la web y la base de datos (Cloudflare Workers y D1). Actúa como encargado del tratamiento. Puede tratar datos en EE. UU.: está adherida al Marco de Privacidad de Datos UE-EE. UU. y su acuerdo de tratamiento incluye cláusulas contractuales tipo.
- **Google** y **GitHub** (Microsoft), solo si eliges entrar con ellos. Te identifican con su propio servicio y nos facilitan nombre, email y foto. Su tratamiento se rige por sus propias políticas.
- **DeepSeek**, proveedor de la IA del tutor y de la generación de preguntas, con servidores en la **República Popular China**. Solo recibe la pregunta del banco, tu respuesta y los mensajes que escribes al tutor. Nunca recibe tu nombre, tu email ni ningún identificador de tu cuenta.

## Transferencia internacional a China

China no cuenta con una decisión de adecuación de la Comisión Europea, de modo que tus datos no tienen allí una protección equivalente a la europea. Entre otros riesgos, las autoridades chinas podrían acceder a ellos y tú podrías tener más difícil ejercer tus derechos. Por eso el tutor solo funciona si das tu **consentimiento explícito**, tras haber sido informado de estos riesgos (art. 49.1.a RGPD). Este mecanismo está pensado para transferencias puntuales: cada envío ocurre únicamente cuando tú preguntas al tutor. **No escribas datos personales en el chat del tutor.** Puedes usar todo lo demás de la app sin aceptar esto.

## Cuánto tiempo se conservan

- **Cuenta y progreso**: hasta que borres la cuenta. Al borrarla se eliminan de inmediato todos tus datos de la base de datos.
- **Sesiones** (con su IP y navegador): caducan a los ${I.sessionDays} días sin uso y se borran en la limpieza diaria.
- **Contadores de intentos por IP**: menos de 48 horas.
- **Contadores de uso de la IA**: 30 días.
- **Mensajes del tutor**: este servicio no los guarda en su servidor. La conversación solo se guarda en tu dispositivo y se borra al cerrar sesión. DeepSeek los conserva según su propia política.
- **Copias de recuperación**: Cloudflare mantiene un historial de recuperación de la base de datos de hasta 30 días. Pasado ese plazo, los datos borrados desaparecen también de él.

## Tus derechos

Puedes ejercer en cualquier momento tus derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad, y retirar tu consentimiento:

- **Desde la app**, en Ajustes: «Descargar mis datos» (acceso y portabilidad, en JSON), «Borrar mi cuenta» (supresión) y «Retirar consentimiento» del tutor IA.
- **Por email**, escribiendo a [${I.email}](mailto:${I.email}) desde la dirección de tu cuenta.

Si crees que no se han respetado tus derechos, puedes reclamar ante la **Agencia Española de Protección de Datos** ([www.aepd.es](https://www.aepd.es)).

## Menores

Para registrarte debes tener al menos **14 años** (art. 7 LOPDGDD).

## Seguridad

La conexión siempre es cifrada (HTTPS). Las contraseñas se guardan como huellas PBKDF2 con sal. La cookie de sesión es HttpOnly y Secure. Cada cuenta solo puede leer y escribir sus propios datos. El código es público y se puede revisar.

## Cambios

Si esta política cambia, se publicará aquí con su fecha. Los cambios importantes se avisarán dentro de la app.
`,

  cookies: `
## Qué se guarda en tu navegador

${I.siteName} solo usa **cookies técnicas** y almacenamiento local imprescindibles para que el servicio funcione. No hay cookies de publicidad, de analítica ni de terceros, y las fuentes tipográficas se sirven desde este mismo dominio.

| Nombre | Tipo | Para qué | Duración |
| --- | --- | --- | --- |
| \`better-auth.session_token\` (con el prefijo \`__Secure-\`) | Cookie propia, HttpOnly | Mantener tu sesión iniciada | ${I.sessionDays} días |
| \`better-auth.*\` (estado y verificación de OAuth) | Cookie propia | Completar con seguridad el inicio de sesión con Google o GitHub | Minutos |
| \`ccdvf_*\` | Almacenamiento local | Idioma, tema, identificador del dispositivo, copia local de tu progreso para usar la app sin conexión, posición en un examen y conversaciones del tutor | Hasta que cierres sesión o borres los datos del navegador |

## Consentimiento

Estas cookies y este almacenamiento están **exentos de consentimiento** (art. 22.2 de la Ley 34/2002, LSSI), porque son estrictamente necesarios para prestar el servicio que pides. Por eso no se muestra ningún banner. Si se añadiera alguna cookie no necesaria, se pediría tu consentimiento antes de usarla.

## Cómo borrarlas

Al **cerrar sesión** se borran la cookie de sesión y los datos locales de tu cuenta. También puedes borrarlo todo desde la configuración de tu navegador. Si bloqueas estas cookies, no podrás iniciar sesión.
`,

  terminos: `
## Qué es

${I.siteName} es un servicio **gratuito** de práctica para el examen *Claude Certified Developer – Foundations*, ofrecido por ${I.owner} como proyecto personal. Al crear una cuenta aceptas estos términos y la [política de privacidad](#/legal/privacidad).

## Tu cuenta

- Debes tener al menos 14 años.
- Usa un email que sea tuyo. Mantén tu contraseña en secreto: eres responsable de lo que se haga con tu cuenta.
- No hay recuperación de contraseña por email. Si la olvidas, puedes entrar con Google o GitHub usando el mismo email. En ese caso, por seguridad, la contraseña anterior se elimina.
- Puedes borrar tu cuenta cuando quieras desde Ajustes.

## Uso aceptable

No está permitido:

- abusar de la IA, intentar saltarse los límites de uso o usar el tutor para cosas ajenas al examen;
- automatizar peticiones, hacer scraping o sobrecargar el servicio;
- intentar acceder a datos de otras personas o a partes no públicas del sistema;
- escribir contenido ilegal u ofensivo, o datos personales de terceros, en el tutor.

Las cuentas que incumplan estas normas pueden suspenderse o borrarse.

## Contenido y IA

- El material procede de fuentes comunitarias y de la guía oficial (detalles en el [aviso legal](#/legal/aviso)). Puede tener errores o quedarse desactualizado.
- Las respuestas del tutor y las preguntas generadas por IA pueden ser incorrectas. Contrástalas siempre con las fuentes oficiales.
- **No es material oficial de Anthropic** ni garantiza aprobar el examen. Las estimaciones de nota son aproximadas.

## Disponibilidad

El servicio se ofrece «tal cual» y sin garantías. Puede cambiar, interrumpirse o cerrarse en cualquier momento. Si se cierra, se avisará con antelación razonable para que puedas descargar tus datos.

## Responsabilidad

En la medida en que la ley lo permita, el titular no responde de los daños indirectos ni de los derivados del uso del contenido. Nada de esto limita los derechos que te reconoce la normativa de consumidores.

## Cambios y ley aplicable

Estos términos pueden actualizarse: la nueva versión se publicará aquí con su fecha. Se rigen por la ley española. Si eres consumidor, serán competentes los juzgados de tu domicilio.
`,
}
