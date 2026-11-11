/**
 * 3D 球棍模型的主题画风（材质 / 描边 / 键着色 / 地面阴影），与 2D 原子舞台保持同一套语言：
 *   default    光亮烤漆（环境光反射 + 清漆）
 *   reagent    哑光陶瓷
 *   stationery 卡通着色 + 墨线描边（教材插图）
 *   blackboard 粉笔色卡通着色 + 浅色描边
 *   pixel      方块原子（体素）+ 硬边平面着色 + 深色描边
 */
import * as THREE from 'three';

/** 卡通着色的三阶灰度梯度贴图 */
let toonRamp = null;
function getToonRamp() {
  if (toonRamp) return toonRamp;
  const data = new Uint8Array([90, 170, 255]);
  toonRamp = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  toonRamp.minFilter = THREE.NearestFilter;
  toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.generateMipmaps = false;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/** 粉笔色：往白色拉，碳原子改成浅灰 */
function chalk(hex, el) {
  if (el === 'C') return new THREE.Color(0xc9d1c8);
  return new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.35);
}

export function currentThemeId() {
  return document.documentElement.getAttribute('data-theme') || 'default';
}

/**
 * @param {string} themeId
 * @returns {{
 *   id: string,
 *   atomGeometry: (r: number) => THREE.BufferGeometry,
 *   bondGeometry: (len: number) => THREE.BufferGeometry,
 *   atomMaterial: (hex: number, el: string) => THREE.Material,
 *   bondMaterial: (hex: number, el: string) => THREE.Material,
 *   bondRadius: number,
 *   twoToneBonds: boolean,
 *   neutralBond: number,
 *   outline: { color: THREE.Color, width: number } | null,
 *   environment: boolean,
 *   ambient: number,
 *   shadow: { opacity: number, hard: boolean } | null,
 * }}
 */
export function getViewerStyle(themeId) {
  const id = themeId || 'default';
  const ink = new THREE.Color(cssVar('--ink', '#1e293b'));
  const sphere = (segW, segH) => (r) => new THREE.SphereGeometry(r, segW, segH);
  const cyl = (radial) => (r) => (len) => new THREE.CylinderGeometry(r, r, len, radial);

  if (id === 'pixel') {
    const bondRadius = 0.085;
    return {
      id,
      atomGeometry: (r) => new THREE.BoxGeometry(r * 1.3, r * 1.3, r * 1.3),
      bondGeometry: cyl(4)(bondRadius),
      atomMaterial: (hex) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true }),
      bondMaterial: (hex) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true }),
      bondRadius,
      twoToneBonds: true,
      neutralBond: 0x636e72,
      outline: { color: new THREE.Color(0x2d3436), width: 0.045 },
      environment: false,
      ambient: 0.85,
      shadow: { opacity: 0.16, hard: true },
    };
  }
  if (id === 'stationery') {
    const bondRadius = 0.08;
    return {
      id,
      atomGeometry: sphere(32, 24),
      bondGeometry: cyl(14)(bondRadius),
      atomMaterial: (hex) => new THREE.MeshToonMaterial({ color: hex, gradientMap: getToonRamp() }),
      bondMaterial: (hex) => new THREE.MeshToonMaterial({ color: hex, gradientMap: getToonRamp() }),
      bondRadius,
      twoToneBonds: true,
      neutralBond: 0x8a8f99,
      outline: { color: ink, width: 0.035 },
      environment: false,
      ambient: 0.75,
      shadow: { opacity: 0.22, hard: false },
    };
  }
  if (id === 'blackboard') {
    const bondRadius = 0.075;
    return {
      id,
      atomGeometry: sphere(28, 20),
      bondGeometry: cyl(12)(bondRadius),
      atomMaterial: (hex, el) => new THREE.MeshToonMaterial({ color: chalk(hex, el), gradientMap: getToonRamp() }),
      bondMaterial: (hex, el) => new THREE.MeshToonMaterial({ color: chalk(hex, el), gradientMap: getToonRamp() }),
      bondRadius,
      twoToneBonds: true,
      neutralBond: 0xd8e2d6,
      outline: { color: new THREE.Color(0xf4f1e6), width: 0.025 },
      environment: false,
      ambient: 0.9,
      shadow: null,
    };
  }
  if (id === 'reagent') {
    const bondRadius = 0.085;
    return {
      id,
      atomGeometry: sphere(36, 28),
      bondGeometry: cyl(18)(bondRadius),
      atomMaterial: (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.72, metalness: 0.0 }),
      bondMaterial: (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.72, metalness: 0.0 }),
      bondRadius,
      twoToneBonds: true,
      neutralBond: 0xa79e94,
      outline: null,
      environment: true,
      ambient: 0.35,
      shadow: { opacity: 0.28, hard: false },
    };
  }
  // default
  const bondRadius = 0.09;
  return {
    id,
    atomGeometry: sphere(40, 32),
    bondGeometry: cyl(20)(bondRadius),
    atomMaterial: (hex) =>
      new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.28, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
    bondMaterial: (hex) => new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.35, metalness: 0.05, clearcoat: 0.4 }),
    bondRadius,
    twoToneBonds: true,
    neutralBond: 0x94a3b8,
    outline: null,
    environment: true,
    ambient: 0.3,
    shadow: { opacity: 0.3, hard: false },
  };
}

/** 地面软阴影贴图（径向渐变）；像素主题用硬边 */
const shadowTextures = {};
export function getShadowTexture(hard) {
  const key = hard ? 'hard' : 'soft';
  if (shadowTextures[key]) return shadowTextures[key];
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (hard) {
    g.fillStyle = 'rgba(0,0,0,1)';
    g.beginPath();
    g.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2);
    g.fill();
  } else {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.45, 'rgba(0,0,0,0.45)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  if (hard) {
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
  }
  shadowTextures[key] = tex;
  return tex;
}
