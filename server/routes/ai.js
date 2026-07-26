/**
 * AI 路由组合根：保持 /api/ai 前缀与既有接口路径不变。
 * 具体领域接口分别维护在 ai/ 子目录。
 */

const express = require('express');

const router = express.Router();
router.use(require('./ai/molecules'));
router.use(require('./ai/quiz'));
router.use(require('./ai/chemistry'));

module.exports = router;
