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
  { z: 18, symbol: 'Ar', name: '氩', config: '1s²2s²2p⁶3s²3p⁶', electrons: [2, 8, 8] },
  // 第四周期常见元素（玻尔层示意：各层电子数）
  { z: 19, symbol: 'K', name: '钾', config: '1s²2s²2p⁶3s²3p⁶4s¹', electrons: [2, 8, 8, 1] },
  { z: 20, symbol: 'Ca', name: '钙', config: '1s²2s²2p⁶3s²3p⁶4s²', electrons: [2, 8, 8, 2] },
  { z: 21, symbol: 'Sc', name: '钪', config: '[Ar]3d¹4s²', electrons: [2, 8, 9, 2] },
  { z: 22, symbol: 'Ti', name: '钛', config: '[Ar]3d²4s²', electrons: [2, 8, 10, 2] },
  { z: 23, symbol: 'V', name: '钒', config: '[Ar]3d³4s²', electrons: [2, 8, 11, 2] },
  { z: 24, symbol: 'Cr', name: '铬', config: '[Ar]3d⁵4s¹', electrons: [2, 8, 13, 1] },
  { z: 25, symbol: 'Mn', name: '锰', config: '[Ar]3d⁵4s²', electrons: [2, 8, 13, 2] },
  { z: 26, symbol: 'Fe', name: '铁', config: '[Ar]3d⁶4s²', electrons: [2, 8, 14, 2] },
  { z: 27, symbol: 'Co', name: '钴', config: '[Ar]3d⁷4s²', electrons: [2, 8, 15, 2] },
  { z: 28, symbol: 'Ni', name: '镍', config: '[Ar]3d⁸4s²', electrons: [2, 8, 16, 2] },
  { z: 29, symbol: 'Cu', name: '铜', config: '[Ar]3d¹⁰4s¹', electrons: [2, 8, 18, 1] },
  { z: 30, symbol: 'Zn', name: '锌', config: '[Ar]3d¹⁰4s²', electrons: [2, 8, 18, 2] },
  { z: 31, symbol: 'Ga', name: '镓', config: '[Ar]3d¹⁰4s²4p¹', electrons: [2, 8, 18, 3] },
  { z: 32, symbol: 'Ge', name: '锗', config: '[Ar]3d¹⁰4s²4p²', electrons: [2, 8, 18, 4] },
  { z: 33, symbol: 'As', name: '砷', config: '[Ar]3d¹⁰4s²4p³', electrons: [2, 8, 18, 5] },
  { z: 34, symbol: 'Se', name: '硒', config: '[Ar]3d¹⁰4s²4p⁴', electrons: [2, 8, 18, 6] },
  { z: 35, symbol: 'Br', name: '溴', config: '[Ar]3d¹⁰4s²4p⁵', electrons: [2, 8, 18, 7] },
  { z: 36, symbol: 'Kr', name: '氪', config: '[Ar]3d¹⁰4s²4p⁶', electrons: [2, 8, 18, 8] },
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
