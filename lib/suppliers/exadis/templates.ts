/**
 * Corps de requête GWT-RPC du portail Exadis.
 *
 * Ce sont des captures, à recopier au caractère près : la moindre modification
 * casse leur désérialiseur. Seules la connexion et `searchVehiculeByImmatOrVin`
 * sont ici, rien qui touche au catalogue produit.
 *
 * Les empreintes et les permutations sont recalculées par GWT à chaque
 * recompilation de leur application : c'est ce qui cassera en premier.
 */

export const EXADIS_URLS = {
    PORTAL_SVC: "https://ecat.exadis.fr/ecat_portail/portalSvc",
    ECAT_BASE: "https://ecat.exadis.fr/ecatvl/ecat_vl",
    SSO_EXCHANGE: "https://ecat.exadis.fr/ecatvl/",
} as const;

export const EXADIS_PERMUTATIONS = {
    PORTAL: "D9497CB739403FA04BDD6D3D630F0906",
    ECATVL: "402ECE0627A88A9A0DE00BD167C3A445",
} as const;

export const EXADIS_USER_AGENT =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Connexion au portail. Les gabarits reçoivent les identifiants du compte. */
export const LOGIN_BODY_TPL =
    "7|0|9|https://ecat.exadis.fr/ecat_portail/|661025E88E90422414BFA4EC53D1F8BC|com.groupe_laurent.ecat.portal.client.service.PortalService|login|java.lang.String/2004016611|Z|{USERNAME}|{PASSWORD}|03|1|2|3|4|4|5|5|5|6|7|8|9|0|";

/** Le serveur exige ces deux appels avant toute recherche. */
export const GET_CURRENT_USER_BODY =
    "7|0|6|https://ecat.exadis.fr/ecatvl/ecat_vl/|F3C88E3B1179BDC94FBE38E65D340156|com.groupe_laurent.ecatcommon.client.service.EcatAuthService|getCurrentUser|java.lang.String/2004016611|VL|1|2|3|4|1|5|6|";

export const GET_LOGIN_INIT_PARAM_BODY =
    "7|0|4|https://ecat.exadis.fr/ecatvl/ecat_vl/|81AB518830E61AD128E0F990EE767FE2|com.groupe_laurent.ecatvl.client.service.EcatService|getLoginInitParam|1|2|3|4|0|";

/** Recherche véhicule. Le corps embarque l'identité du compte Jumbo Pneus. */
export const SEARCH_VEHICULE_BODY_TPL =
    "7|0|50|https://ecat.exadis.fr/ecatvl/ecat_vl/|0B019B598FAAD06A3A5191FEC657C177|com.groupe_laurent.ecatcommon.client.service.EcatVehiculeServiceCommon|searchVehiculeByImmatOrVin|com.groupe_laurent.ecatcommon.shared.Utilisateur/1726546371|java.lang.String/2004016611|com.groupe_laurent.ecatcommon.shared.CompteMovex/531075687|000001|com.groupe_laurent.ecatcommon.shared.Adresse/172915142|141-151 AVENUE LOUIS ROCHE||92230|GENNEVILLIERS|AF|EXADIS GENNEVILLIERS|03881808|AC|DGN|03|SOCIETE EXADIS|TRAD|com.groupe_laurent.ecatcommon.shared.PanierParamM3/191159227|java.util.HashMap/1797211028|java.util.ArrayList/4159755760|com.groupe_laurent.ecatcommon.shared.PanierCutoff/4177800765|11h30|18h00|java.util.Date/3385151746|BAT|MODELE1|STD|20|com.groupe_laurent.ecatcommon.shared.DroitUtilisateur/3722113642|com.groupe_laurent.ecatcommon.shared.DroitHerites/3386924943|VISUART_TC|com.groupe_laurent.ecatcommon.shared.DroitModules/4211911751|java.util.HashSet/3273092938|000000000000000000000000000000|com.groupe_laurent.ecatcommon.shared.DroitParamModules/1155484440|com.groupe_laurent.ecatcommon.shared.AaaQuota/3177543380|contact@jumbopneus.fr|UNION|035135|JUMBOPNEUS|M. PATRICK BAZIN|JUMBO PNEUS|0141470713|20.0|ITE|{PLATE}|1|2|3|4|2|5|6|5|0|0|0|0|0|7|8|0|9|10|11|11|12|13|14|15|8|16|0|17|11|16|18|19|20|21|22|23|0|24|2|25|26|1|11|1|25|27|3|11|4|28|CQMhA|28|DpdaA|0|11|0|12|1|1|23|0|23|0|29|0|1|1|30|31|15|0|11|0|0|32|0|0|33|34|0|0|0|0|0|0|1|0|0|1|0|0|0|0|0|0|0|0|0|1|0|35|36|0|0|0|0|0|0|37|0|1|1|0|0|1|1|0|0|1|0|0|0|0|0|0|0|0|0|0|0|0|0|0|38|39|0|40|0|28|ZQUpdWA|0|99999|0|0|41|0|0|0|42|43|11|1|0|0|44|1|45|11|0|11|46|1|47|48|49|0|50|";
