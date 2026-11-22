'use strict';

const { ensureQuizSchema } = require('./migrations');

/**
 * Delegates quiz_sessions / quiz_items / quiz_wrong_book schema ownership
 * (including quiz_sessions.source_type) to the centralized migrations module.
 */
module.exports = { ensureQuizSchema };
