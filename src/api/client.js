/**
 * API 客户端封装
 * 统一管理所有后端 API 调用
 */

const API_BASE = '/api';

/**
 * 通用请求方法
 */
async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${url}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) {
      throw new Error(
        '无法连接本地服务。若用桌面版请重启应用；若用便携 exe 请勿关闭黑色控制台，并用控制台里的 http://127.0.0.1:端口 打开；不要用本地文件方式打开网页',
      );
    }
    throw new Error(msg || '网络请求失败（请确认后端已启动）');
  }

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // 后端旧进程常返回 HTML「Cannot POST /api/...」
    const snippet = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    throw new Error(
      snippet || `请求失败: ${response.status}（接口可能未部署，请重启后端）`,
    );
  }

  if (!response.ok || !data?.success) {
    const err = new Error(data?.message || `请求失败: ${response.status}`);
    err.status = response.status;
    err.payload = data?.data || null;
    // 限流：拼上重置时间（后端 message 已含，此处保证前端可单独读）
    if (data?.data?.resetLabel && !String(err.message).includes('重置')) {
      err.message = `${err.message}（约 ${data.data.resetLabel} 后重置）`;
    }
    throw err;
  }

  return data.data;
}

/**
 * 分子相关 API
 */
export const moleculeApi = {
  /**
   * 获取排序后的分子列表
   */
  async getList() {
    return request('/molecules');
  },

  /**
   * 获取单个分子
   */
  async getById(id) {
    return request(`/molecules/${id}`);
  },

  /**
   * 新增分子
   */
  async add(molecule) {
    return request('/molecules', {
      method: 'POST',
      body: JSON.stringify(molecule)
    });
  },

  /**
   * 删除分子
   */
  async delete(id) {
    return request(`/molecules/${id}`, {
      method: 'DELETE'
    });
  },

  /**
   * 更新排序
   */
  async reorder(order) {
    return request('/molecules/order', {
      method: 'PUT',
      body: JSON.stringify({ order })
    });
  }
};

/**
 * 化学反应 API
 */
export const reactionApi = {
  async getList(moleculeId) {
    const q = moleculeId
      ? `?moleculeId=${encodeURIComponent(moleculeId)}`
      : '';
    return request(`/reactions${q}`);
  },

  async getById(id) {
    return request(`/reactions/${id}`);
  },

  async add(payload) {
    return request('/reactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async remove(id) {
    return request(`/reactions/${id}`, { method: 'DELETE' });
  },
};

/**
 * 设置相关 API
 */
export const settingsApi = {
  /**
   * 获取设置
   */
  async get() {
    return request('/settings');
  },

  /**
   * 更新设置
   */
  async update(settings) {
    return request('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }
};

/**
 * 课堂点名名单
 */
export const studentApi = {
  async getList() {
    return request('/students');
  },
  async add(name) {
    return request('/students', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },
  async importNames(names, mode = 'append') {
    return request('/students/import', {
      method: 'POST',
      body: JSON.stringify({ names, mode }),
    });
  },
  async update(id, name) {
    return request(`/students/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  },
  async remove(id) {
    return request(`/students/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};

/**
 * AI 相关 API
 */
export const aiApi = {
  /**
   * 生成分子
   */
  async generate(prompt) {
    return request('/ai/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt })
    });
  },

  /** 生成化学反应（预览，不落库） */
  async reaction(payload) {
    return request('/ai/reaction', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** 摩尔分步化学计量 */
  async stoich(payload) {
    return request('/ai/stoich', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** AI 建议配平（前端仍做本地校验） */
  async balance(payload) {
    return request('/ai/balance', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * 化学小知识（一两句）
   */
  async tip() {
    return request('/ai/tip', {
      method: 'POST',
      body: JSON.stringify({})
    });
  },

  /** 智能出题 */
  async quizGenerate(payload) {
    return request('/ai/quiz/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async quizHint(payload) {
    return request('/ai/quiz/hint', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async quizExplain(payload) {
    return request('/ai/quiz/explain', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async quizSummary(payload) {
    return request('/ai/quiz/summary', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** 历史练习 AI 评分 0～10 */
  async quizScore(payload) {
    return request('/ai/quiz/score', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

/**
 * 练习历史 / 错题本
 */
export const quizApi = {
  async stats() {
    return request('/quiz/stats');
  },
  async saveSession(payload) {
    return request('/quiz/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async wrongBook() {
    return request('/quiz/wrong-book');
  },
  /** 错题本重练作答；做对自动出本 */
  async attemptWrong(id, chosen) {
    return request(`/quiz/wrong-book/${encodeURIComponent(id)}/attempt`, {
      method: 'POST',
      body: JSON.stringify({ chosen }),
    });
  },
  async saveSummary(id, summary) {
    return request(`/quiz/sessions/${encodeURIComponent(id)}/summary`, {
      method: 'PATCH',
      body: JSON.stringify({ summary }),
    });
  },
};
