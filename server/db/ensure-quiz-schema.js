'use strict';

const { run } = require('./sqlite');

/**
 * Own quiz_sessions / quiz_items / quiz_wrong_book DDL (CREATE + source_type migrate).
 * Idempotent; safe to call from any route that reads or writes quiz tables.
 */
function ensureQuizSchema() {
  try {
    run(`CREATE TABLE IF NOT EXISTS quiz_sessions (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      grades TEXT DEFAULT '[]',
      difficulty TEXT DEFAULT '',
      topics TEXT DEFAULT '[]',
      reveal TEXT DEFAULT 'immediate',
      total INTEGER DEFAULT 0,
      correct INTEGER DEFAULT 0,
      answered INTEGER DEFAULT 0,
      summary TEXT DEFAULT '',
      source_type TEXT DEFAULT ''
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      stem TEXT NOT NULL,
      options TEXT NOT NULL,
      answer INTEGER NOT NULL,
      knowledge TEXT DEFAULT '',
      hint TEXT DEFAULT '',
      explain_bank TEXT DEFAULT '',
      chosen INTEGER,
      used_hint INTEGER DEFAULT 0,
      used_explain INTEGER DEFAULT 0,
      is_correct INTEGER DEFAULT 0
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_wrong_book (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      stem TEXT NOT NULL,
      options TEXT NOT NULL,
      answer INTEGER NOT NULL,
      knowledge TEXT DEFAULT '',
      hint TEXT DEFAULT '',
      explain_bank TEXT DEFAULT '',
      last_chosen INTEGER,
      last_session_id TEXT,
      dismissed INTEGER DEFAULT 0
    )`);
    try {
      run(`ALTER TABLE quiz_sessions ADD COLUMN source_type TEXT DEFAULT ''`);
    } catch {
      /* column already present */
    }
  } catch (e) {
    console.warn('ensureQuizSchema', e.message);
  }
}

module.exports = { ensureQuizSchema };
