-- 小黄的化学实验室数据库初始化脚本

-- 分子表
CREATE TABLE IF NOT EXISTS molecules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  formula TEXT NOT NULL,
  desc TEXT DEFAULT '',
  atoms JSON NOT NULL,
  bonds JSON NOT NULL,
  physics JSON DEFAULT '{}',
  chemistry JSON DEFAULT '{}',
  custom INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 分子排序表
CREATE TABLE IF NOT EXISTS molecule_order (
  molecule_id TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY (molecule_id) REFERENCES molecules(id) ON DELETE CASCADE
);

-- 设置表
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSON NOT NULL
);

-- 化学小知识库（默认种子 + AI 成功后的积累）
CREATE TABLE IF NOT EXISTS chem_tips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'seed',
  created_at INTEGER NOT NULL
);

-- AI 小知识调用时间戳（用于 1 小时内次数限制）
CREATE TABLE IF NOT EXISTS ai_tip_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  called_at INTEGER NOT NULL
);

-- 智能出题：练习场次
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  grades TEXT DEFAULT '[]',
  difficulty TEXT DEFAULT '',
  topics TEXT DEFAULT '[]',
  reveal TEXT DEFAULT 'immediate',
  total INTEGER DEFAULT 0,
  correct INTEGER DEFAULT 0,
  answered INTEGER DEFAULT 0,
  summary TEXT DEFAULT ''
);

-- 场次内题目快照
CREATE TABLE IF NOT EXISTS quiz_items (
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
);

-- 错题本（使用过 AI 解答的题目入本；消除后 dismissed=1）
CREATE TABLE IF NOT EXISTS quiz_wrong_book (
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
);

-- AI 提示 / 解答 限流（各 kind 独立计数）
CREATE TABLE IF NOT EXISTS ai_quiz_assist_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  called_at INTEGER NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_molecules_custom ON molecules(custom);
CREATE INDEX IF NOT EXISTS idx_ai_quiz_assist_kind_at ON ai_quiz_assist_calls(kind, called_at);
CREATE INDEX IF NOT EXISTS idx_molecule_order_sort ON molecule_order(sort_order);
CREATE INDEX IF NOT EXISTS idx_chem_tips_source ON chem_tips(source);
CREATE INDEX IF NOT EXISTS idx_ai_tip_calls_at ON ai_tip_calls(called_at);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_created ON quiz_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_quiz_items_session ON quiz_items(session_id);
CREATE INDEX IF NOT EXISTS idx_quiz_wrong_dismissed ON quiz_wrong_book(dismissed);
