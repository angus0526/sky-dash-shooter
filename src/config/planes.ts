export type PlaneId = 'default' | 'ricochet' | 'homing';

export interface PlaneConfig {
  id: PlaneId;
  name: string;
  shipTexture: string;
  weaponLabel: string;
  unlockBossKills: number;
}

export const PLANES: PlaneConfig[] = [
  { id: 'default', name: '標準機', shipTexture: 'ship', weaponLabel: '一般彈頭／雷射／核爆', unlockBossKills: 0 },
  { id: 'ricochet', name: '彈跳者', shipTexture: 'ship_ricochet', weaponLabel: '反彈貫穿雷射／彩色核爆彈', unlockBossKills: 1 },
  { id: 'homing', name: '獵殺者', shipTexture: 'ship_homing', weaponLabel: '追蹤爆裂飛彈／彩色核爆彈', unlockBossKills: 3 }
];

export function getPlane(id: PlaneId): PlaneConfig {
  return PLANES.find((p) => p.id === id) ?? PLANES[0];
}
