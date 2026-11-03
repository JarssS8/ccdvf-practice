// The study repo's guide pages as the app uses them (src/content/guide.json, written by scripts/sync-content.mjs),
// and the translatable texts in them. Spanish lives in src/content/es/guide.json as { key: { text, src } },
// `src` being the hash of the English text it was translated from (same scheme as the rest of the content).

export interface Confusion { id: string; title: string; body: string }
export interface Course { id: string; title: string; summary: string; url: string; section: string; certs: string[]; extra?: boolean }
export interface Video { id: string; section: string; title: string; summary?: string; url: string; certs: string[] }
export interface Guide {
  confusions: Confusion[]
  courses: Course[]
  prepPaths: Record<string, string>
  strategy: { emphasis: Record<string, string>; weeks: { title: string; body: string }[]; examWeek: string[]; during: string[] }
  videos: Video[]
}

/** Every translatable English text of the guide, by a stable key. Course and video titles are product names and stay in English. */
export function guideEntries(g: Guide): [string, string][] {
  const out: [string, string][] = []
  for (const c of g.confusions) out.push([`confusion:${c.id}:title`, c.title], [`confusion:${c.id}:body`, c.body])
  for (const c of g.courses) out.push([`course:${c.id}`, c.summary])
  for (const [cert, text] of Object.entries(g.strategy.emphasis)) out.push([`emphasis:${cert}`, text])
  g.strategy.weeks.forEach((w, i) => out.push([`week:${i}:title`, w.title], [`week:${i}:body`, w.body]))
  g.strategy.examWeek.forEach((x, i) => out.push([`examWeek:${i}`, x]))
  g.strategy.during.forEach((x, i) => out.push([`during:${i}`, x]))
  for (const v of g.videos) if (v.summary) out.push([`video:${v.id}`, v.summary])
  return out
}
