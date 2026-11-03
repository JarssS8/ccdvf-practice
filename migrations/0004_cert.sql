-- Four certifications instead of one. Every attempt stored so far was a Developer – Foundations attempt.
-- Apply BEFORE deploying the Worker that writes this column (the old Worker ignores it).

ALTER TABLE attempts ADD COLUMN cert TEXT NOT NULL DEFAULT 'developer-foundations';
