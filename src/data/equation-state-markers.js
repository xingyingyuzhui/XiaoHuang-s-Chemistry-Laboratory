/**
 * 配平结果状态符号白名单（课本示意）
 * 权威列表；修改后刷新页面即可。
 * 同步文件：equation-state-markers.json（便于查阅/非代码编辑）
 */
export const STATE_MARKER_LISTS = {
  gas: [
    'H2', 'O2', 'N2', 'Cl2', 'F2', 'Br2', 'I2',
    'CO2', 'CO', 'NO', 'NO2', 'N2O', 'SO2', 'SO3', 'H2S',
    'NH3', 'HCl', 'HF', 'HBr', 'HI',
    'CH4', 'C2H4', 'C2H2', 'PH3', 'O3',
  ],
  ppt: [
    'AgCl', 'AgBr', 'AgI', 'Ag2S', 'Ag2CO3',
    'BaSO4', 'BaCO3', 'Ba3(PO4)2',
    'CaCO3', 'CaSO4', 'CaC2O4', 'MgCO3',
    'PbSO4', 'PbI2', 'PbS',
    'Cu(OH)2', 'Fe(OH)2', 'Fe(OH)3', 'Al(OH)3', 'Zn(OH)2', 'Mg(OH)2', 'Mn(OH)2',
    'CuS', 'FeS', 'ZnS', 'CdS',
  ],
};

export default STATE_MARKER_LISTS;
