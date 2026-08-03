/**
 * Exadis RPC #5 (searchArticleByVehicule) body 拼装器.
 * FIELD_COUNT = 28 + vehicleSegment.length（与 SAZ 抓包一致）.
 * 索引区按 FIELD_COUNT 查表；未知长度返回 null（由上层打 log 并静默跳过 Exadis）.
 */

import type { VehicleFields } from './rpc4-parser';
import type { ProductCategory } from '../base';

/**
 * 协议头到 category code|（不含 K-Type）.
 * Step 3 探针验证: Exadis 仅按 e00402 / e00082 区分类目, 23117 / FREINAGE 文本不影响过滤,
 * 但为防止服务端校验, 也一起替换成 disc 对应字符串.
 */
function buildBodyPrefix(fieldCount: number, category: ProductCategory): string {
  const familyName =
    category === 'disque' ? 'DISQUES DE FREIN' : 'PLAQUETTES DE FREIN';
  const categoryCode = category === 'disque' ? 'e00082' : 'e00402';
  return (
    `7|0|${fieldCount}|https://ecat.exadis.fr/ecatvl/ecat_vl/|` +
    '8463A5F799A36F7BE558149F0F841377|' +
    'com.groupe_laurent.ecatcommon.client.service.EcatArticleService|searchArticleByVehicule|' +
    'com.groupe_laurent.ecatcommon.shared.SearchArticleCondition/1429286386|' +
    'com.groupe_laurent.ecatcommon.shared.CarteGrise/15624651|' +
    `0002|23117|FREINAGE|${familyName}|` +
    `java.util.ArrayList/4159755760|java.lang.String/2004016611|${categoryCode}|`
  );
}

/** K-Type 之后到车辆段之前（含 TOT、SimpleUserInput、VISUART_TC|） */
const BODY_AFTER_KTYPE_TO_VEHICLE =
  'TOT|' +
  'com.groupe_laurent.ecatcommon.shared.SimpleUserInput/3360893290|' +
  '000001|AF|AC|03881808|03|TRAD|035135||1|20.0|ITE|VISUART_TC|';

/**
 * GWT 索引区后缀（不含车辆段末尾分隔符；拼装时前面会加 `|`）.
 * 键 = 协议头 FIELD_COUNT（= 28 + vehicleSegment.length）.
 * 新车型抓包后在此追加条目。
 */
export const INDEX_SUFFIX_BY_FIELD_COUNT: Record<number, string> = {
  62:
    '1|2|3|4|2|5|6|5|7|0|0|0|0|0|8|9|10|11|1|12|13|0|0|0|14|0|15|0|0|0|0|0|' +
    '16|17|18|0|19|20|0|21|0|22|23|0|1|24|25|26|27|1|0|28|6|29|30|31|32|33|34|35|36|37|0|' +
    '38|39|40|41|41|42|43|44|45|46|46|47|48|48|48|49|50|51|51|50|51|52|53|54|55|56|57|50|' +
    '58|59|60|61|62|', // BJ060PA SAZ
  64:
    '1|2|3|4|2|5|6|5|7|0|0|0|0|0|8|9|10|11|1|12|13|0|0|0|14|0|15|0|0|0|0|0|' +
    '16|17|18|0|19|20|0|21|0|22|23|0|1|24|25|26|27|1|0|28|6|29|30|31|32|33|34|35|36|37|0|' +
    '38|39|40|41|41|42|43|44|45|46|46|47|48|49|48|50|51|52|52|53|54|53|55|56|57|58|59|54|' +
    '60|61|62|63|64|', // EZ494ZA / CG534WF / FR174AL SAZ（templates SEARCH_ARTICLE_BODY）
};

/**
 * 拼装 searchArticleByVehicule 请求体（GWT-RPC 文本）.
 * 不支持的 FIELD_COUNT 时返回 null（不抛错）.
 * category 默认 'plaquette' 保留旧行为.
 */
export function buildRpc5Body(
  vf: VehicleFields,
  category: ProductCategory = 'plaquette'
): string | null {
  const fieldCount = 28 + vf.vehicleSegment.length;
  const indexSuffix = INDEX_SUFFIX_BY_FIELD_COUNT[fieldCount];
  if (!indexSuffix) return null;

  return (
    buildBodyPrefix(fieldCount, category) +
    vf.kType +
    '|' +
    BODY_AFTER_KTYPE_TO_VEHICLE +
    vf.vehicleSegment.join('|') +
    '|' +
    indexSuffix
  );
}
