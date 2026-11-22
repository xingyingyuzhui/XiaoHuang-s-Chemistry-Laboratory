/**
 * 3D 晶体与晶胞结构库统一出口（5 大类共 21 种典型晶体）
 */

import { CRYSTALS_PART1 } from './crystals-part1.js';
import { CRYSTALS_PART2 } from './crystals-part2.js';

export const CRYSTAL_CATEGORIES = [
  { id: 'metallic', label: '金属晶体' },
  { id: 'ionic', label: '离子晶体' },
  { id: 'covalent', label: '共价晶体' },
  { id: 'molecular', label: '分子晶体' },
  { id: 'mixed', label: '混合型晶体' },
];

export const CRYSTALS = [...CRYSTALS_PART1, ...CRYSTALS_PART2];

const CRYSTAL_MAP = new Map(CRYSTALS.map((c) => [c.id, c]));

export function getCrystalById(id) {
  return CRYSTAL_MAP.get(id) || null;
}
