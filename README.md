# CCDV-F Practice

Práctica para **Claude Certified Developer – Foundations**: mocks cronometrados, drills por dominio, flashcards con repetición espaciada, tutor IA y progreso sincronizado entre dispositivos.

Producción: https://exam.jarsss8.es (dominio propio en Cloudflare; la URL de workers.dev está desactivada)

## Cómo está hecho

Un único **Cloudflare Worker con static assets**: sirve la SPA (Vite + React) y la API `/api/*`. El progreso vive en **D1**. No hay más servicios.

```
practice-app/
├─ scripts/sync-content.mjs   importa preguntas, flashcards, apuntes y novedades del repo → src/content/*.json
├─ src/                       la app (local-first: localStorage + cola de cambios que se sube a D1)
│  ├─ shared/exam.ts          datos oficiales del examen (53 ítems, 120 min, corte 720 en 100–1000, pesos)
│  └─ lib/engine.ts           selección de preguntas, barajado, puntuación y estimación
├─ worker/index.ts            API: login, sync, tutor y generación con DeepSeek
└─ migrations/                esquema D1
```

### Decisiones que importan para no engañarte

- **Opciones barajadas en cada intento.** Las claves del banco siguen patrones fijos (`BCDA…`, `ABCD…`) y la correcta es la opción más larga en 74 de 80 preguntas. Sin barajar se aprueba por patrón.
- **La estimación solo usa primeros intentos** de preguntas del banco (no IA), agrupando las casi duplicadas, y se reponderan por el peso de cada dominio. Se muestra como rango al 95 %. La conversión a la escala 100–1000 es lineal y aproximada: la real no es pública.
- **Preguntas IA con filtros**: cita literal de tus apuntes, opciones de longitud parecida, un segundo modelo responde sin ver la clave y debe coincidir, y deduplicado. No cuentan para la estimación y se pueden reportar.
- **Varios dispositivos**: cada respuesta lleva marca de tiempo y gana la más reciente. Un intento solo acepta respuestas del dispositivo que lo tiene abierto («Continuar aquí» lo traspasa). El reloj es de pared: cerrar la app no lo para.

## Tareas habituales

```bash
npm install
npm run sync          # tras `git pull` en el repo padre: reimporta el contenido
npm run deploy        # build + publicar
```

**Activar la IA** (DeepSeek):

```bash
npx wrangler secret put DEEPSEEK_API_KEY
```

Modelos y límite diario en `wrangler.jsonc` (`DEEPSEEK_MODEL`, `DEEPSEEK_CHECK_MODEL`, `AI_DAILY_LIMIT`).

**Cambiar la frase de acceso**: `npx wrangler secret put APP_PASSPHRASE`. Para expulsar todas las sesiones, usa Ajustes → «Cerrar en todos los dispositivos».

**Desarrollo local**: crea `.dev.vars` con `APP_PASSPHRASE=…` y `SESSION_SECRET=…`, aplica `npx wrangler d1 migrations apply ccdvf-practice --local` y lanza `npm run dev:worker` (http://localhost:8787).

**Nuevas migraciones**: añade `migrations/000N_*.sql` y ejecuta `npm run db:migrate`.

## Contenido

Las preguntas, flashcards, apuntes y novedades de `src/content/` vienen de [Amey-Thakur/CLAUDE-CERTIFICATIONS](https://github.com/Amey-Thakur/CLAUDE-CERTIFICATIONS) (licencia MIT, © 2026 Amey Thakur). `npm run sync` espera esta carpeta dentro de un clon de ese repo; si no está, el build usa el contenido ya importado.
