/**
 * Exadis RPC #4 (searchVehiculeByImmatOrVin) 响应解析器.
 * 将 51–55 项左右的字符串表转为结构化字段，供 RPC #5 body 拼装（Phase Exadis-Dynamic Step 1）.
 */

export interface VehicleFields {
  /** 本车 K-Type：9 位数字串（如 "000130100"） */
  kType: string;
  /** 归一化车牌（大写、去空格/连字符），用于校验 */
  plate: string;
  /** 写入 RPC #5 的车辆字段段（顺序与抓包一致） */
  vehicleSegment: string[];
}

function normalizePlateKey(p: string): string {
  return p.trim().toUpperCase().replace(/[\s-]/g, '');
}

/**
 * @param stringTable extractStringTable(RPC #4 响应) 的结果（非 null）
 * @param expectedPlate 用户查询车牌，用于校验表中是否命中
 */
export function parseRpc4StringTable(
  stringTable: string[],
  expectedPlate: string
): VehicleFields {
  if (stringTable.length < 50) {
    throw new Error(`RPC #4 string table too short: ${stringTable.length} (expected 50+)`);
  }

  const plateKey = normalizePlateKey(expectedPlate);
  const plateHit = stringTable.some((s) => normalizePlateKey(s) === plateKey);
  if (!plateHit) {
    throw new Error(`RPC #4 response does not contain plate ${plateKey}`);
  }

  let vehicleStart = -1;
  for (let i = 0; i < stringTable.length; i++) {
    if (stringTable[i]?.includes('com.groupe_laurent.ecatcommon.shared.CarteGrise/')) {
      vehicleStart = i + 1;
      break;
    }
  }
  if (vehicleStart < 0) {
    vehicleStart = 8;
  }

  let vehicleEnd = -1;
  for (let i = vehicleStart; i < stringTable.length; i++) {
    if (stringTable[i] === 'java.lang.String/2004016611') {
      vehicleEnd = i;
      break;
    }
  }
  if (vehicleEnd < 0) {
    throw new Error('RPC #4 vehicle segment end not found (no java.lang.String/2004016611 marker)');
  }

  const vehicleSegment = stringTable.slice(vehicleStart, vehicleEnd);
  if (vehicleSegment.length < 28) {
    throw new Error(`RPC #4 vehicle segment suspiciously short: ${vehicleSegment.length}`);
  }

  let kType: string | null = null;
  for (let i = vehicleEnd; i < stringTable.length; i++) {
    const s = stringTable[i] ?? '';
    if (/^\d{9}$/.test(s)) {
      kType = s;
      break;
    }
  }
  if (!kType) {
    throw new Error('RPC #4: K-Type (9 digits) not found in string table');
  }

  return {
    kType,
    plate: plateKey,
    vehicleSegment,
  };
}
