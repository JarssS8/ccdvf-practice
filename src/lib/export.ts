import type { Dict, Lang } from '../i18n'
import { localize, type AiQuestion } from './content'
import { attemptTitle, isCorrect } from './engine'
import type { Data } from './store'
import type { Letter } from '../shared/exam'

/** One row per answer, oldest first. Options are written as text: the letters the viewer saw were shuffled. */
export function answersCsv(data: Data, qs: Map<string, AiQuestion>, t: Dict, lang: Lang) {
  // Spanish Excel expects ";" as separator; the BOM keeps accents readable
  const sep = lang === 'es' ? ';' : ','
  const cell = (v: string | number) => {
    const s = String(v)
    return /[";,\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const c = t.settings.csv
  const rows: (string | number)[][] = [[c.date, c.attempt, c.mode, c.domain, c.question_id, c.question, c.your_answer, c.correct_answer, c.correct, c.flagged]]
  const answers = Object.values(data.answers).filter((a) => a.choice.length && data.attempts[a.attemptId]).sort((a, b) => a.updatedAt - b.updatedAt)
  for (const a of answers) {
    const at = data.attempts[a.attemptId]
    const orig = qs.get(a.qid)
    if (!orig) continue
    const q = localize(orig, lang)
    const text = (ls: Letter[]) => ls.map((l) => q.options[l] ?? l).join(' | ')
    rows.push([
      new Date(a.updatedAt).toISOString().slice(0, 16).replace('T', ' '),
      at.id.slice(0, 8), attemptTitle(at, t), t.domains[q.domain] ?? q.domain, q.id, q.question,
      text(a.choice), text(q.answer), isCorrect(q, a.choice) ? c.yes : c.no, a.flagged ? c.yes : c.no,
    ])
  }
  return '﻿' + rows.map((r) => r.map(cell).join(sep)).join('\r\n') + '\r\n'
}
