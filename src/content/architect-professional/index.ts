// One certification's study content, loaded on demand (src/lib/content.ts). Written by hand: `npm run sync` only rewrites the JSON.
import questions from './questions.json'
import flashcards from './flashcards.json'
import notes from './notes.json'
import questionsEs from './es/questions.json'
import flashcardsEs from './es/flashcards.json'
import notesEs from './es/notes.json'

export default { questions, flashcards, notes, es: { questions: questionsEs, flashcards: flashcardsEs, notes: notesEs } }
