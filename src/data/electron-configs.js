/**
 * 前18个元素的电子排布数据
 */

export const ELECTRON_ELEMENTS = [
  { z: 1, symbol: 'H', name: '氢', config: '1s¹', electrons: [1] },
  { z: 2, symbol: 'He', name: '氦', config: '1s²', electrons: [2] },
  { z: 3, symbol: 'Li', name: '锂', config: '1s²2s¹', electrons: [2, 1] },
  { z: 4, symbol: 'Be', name: '铍', config: '1s²2s²', electrons: [2, 2] },
  { z: 5, symbol: 'B', name: '硼', config: '1s²2s²2p¹', electrons: [2, 3] },
  { z: 6, symbol: 'C', name: '碳', config: '1s²2s²2p²', electrons: [2, 4] },
  { z: 7, symbol: 'N', name: '氮', config: '1s²2s²2p³', electrons: [2, 5] },
  { z: 8, symbol: 'O', name: '氧', config: '1s²2s²2p⁴', electrons: [2, 6] },
  { z: 9, symbol: 'F', name: '氟', config: '1s²2s²2p⁵', electrons: [2, 7] },
  { z: 10, symbol: 'Ne', name: '氖', config: '1s²2s²2p⁶', electrons: [2, 8] },
  { z: 11, symbol: 'Na', name: '钠', config: '1s²2s²2p⁶3s¹', electrons: [2, 8, 1] },
  { z: 12, symbol: 'Mg', name: '镁', config: '1s²2s²2p⁶3s²', electrons: [2, 8, 2] },
  { z: 13, symbol: 'Al', name: '铝', config: '1s²2s²2p⁶3s²3p¹', electrons: [2, 8, 3] },
  { z: 14, symbol: 'Si', name: '硅', config: '1s²2s²2p⁶3s²3p²', electrons: [2, 8, 4] },
  { z: 15, symbol: 'P', name: '磷', config: '1s²2s²2p⁶3s²3p³', electrons: [2, 8, 5] },
  { z: 16, symbol: 'S', name: '硫', config: '1s²2s²2p⁶3s²3p⁴', electrons: [2, 8, 6] },
  { z: 17, symbol: 'Cl', name: '氯', config: '1s²2s²2p⁶3s²3p⁵', electrons: [2, 8, 7] },
  { z: 18, symbol: 'Ar', name: '氩', config: '1s²2s²2p⁶3s²3p⁶', electrons: [2, 8, 8] }
];

/**
 * 电子层名称
 */
export const SHELL_NAMES = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];

/**
 * 轨道类型颜色
 */
export const ORBITAL_COLORS = {
  's': '#3b82f6',  // 蓝色
  'p': '#10b981',  // 绿色
  'd': '#f59e0b',  // 橙色
  'f': '#ef4444'   // 红色
};
