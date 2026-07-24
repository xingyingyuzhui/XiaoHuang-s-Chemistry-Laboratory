/**
 * 统一响应格式工具
 */

/**
 * 成功响应
 */
function success(res, data = null, message = 'ok') {
  return res.json({
    success: true,
    message,
    data
  });
}

/**
 * 错误响应
 */
function error(res, message = '服务器错误', status = 500) {
  return res.status(status).json({
    success: false,
    message,
    data: null
  });
}

/**
 * 未找到响应
 */
function notFound(res, message = '资源不存在') {
  return error(res, message, 404);
}

/**
 * 参数错误响应
 */
function badRequest(res, message = '参数错误') {
  return error(res, message, 400);
}

module.exports = {
  success,
  error,
  notFound,
  badRequest
};
