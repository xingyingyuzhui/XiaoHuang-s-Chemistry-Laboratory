const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseModelJson,
  normalizeQuizQuestions,
} = require('../server/services/ai/response-parser');

test('AI response parser accepts fenced JSON with a trailing comma', () => {
  assert.deepEqual(
    parseModelJson('```json\n{"topic":"水",}\n```'),
    { topic: '水' },
  );
});

test('quiz question normalizer drops invalid answers instead of silently treating them as A', () => {
  const questions = normalizeQuizQuestions(
    [
      { stem: '有效题', options: ['A', 'B', 'C', 'D'], answer: 'B' },
      { stem: '无效题', options: ['A', 'B', 'C', 'D'], answer: 'Z' },
    ],
    5,
  );

  assert.deepEqual(questions, [
    {
      id: 'q1',
      stem: '有效题',
      options: ['A', 'B', 'C', 'D'],
      answer: 1,
      knowledge: '',
      hint: '',
      explain: '',
    },
  ]);
});
