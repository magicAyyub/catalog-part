/**
 * Mapping between catalog brand strings and WinPro `c_marque` ERP codes.
 */
export type WinproAvailability =
  | {
      available: true;
      cMarque: string;
      nomMarque: string;
      cArtPrefix: string;
    }
  | { available: false; reason: string };

export const BRAND_TO_WINPRO: Record<string, WinproAvailability> = {
  TRW:             { available: true, cMarque: 'TRW',  nomMarque: 'Trw',          cArtPrefix: 'TRW' },
  MINTEX:          { available: true, cMarque: 'MINT', nomMarque: 'Mintex',       cArtPrefix: 'MIN' },
  BREMBO:          { available: true, cMarque: 'BREM', nomMarque: 'Brembo',       cArtPrefix: 'BR' },
  VALEO:           { available: true, cMarque: 'VALE', nomMarque: 'Valeo',        cArtPrefix: 'VAL' },
  TEXTAR:          { available: true, cMarque: 'TEXT', nomMarque: 'Textar',       cArtPrefix: 'TEX' },
  DELPHI:          { available: true, cMarque: 'AP',   nomMarque: 'Delphi',       cArtPrefix: 'AP' },
  BOSCH:           { available: true, cMarque: 'BOSC', nomMarque: 'Bosch',        cArtPrefix: 'BCH' },
  FERODO:          { available: true, cMarque: 'FERO', nomMarque: 'Ferodo',       cArtPrefix: 'FER' },
  'FEBI BILSTEIN': { available: true, cMarque: 'FEBI', nomMarque: 'Febi Bilstein', cArtPrefix: 'FEB' },
  LPR:             { available: true, cMarque: 'LPR',  nomMarque: 'Lpr',          cArtPrefix: '' },
  FAHREN:          { available: true, cMarque: 'FAHR', nomMarque: 'Fahren',       cArtPrefix: 'FAHR' },
  NAPA:            { available: true, cMarque: 'NAPA', nomMarque: 'Napa',         cArtPrefix: 'NAPA' },

  NK:  { available: false, reason: 'Marque absente du référentiel WinPro' },
  NPS: { available: false, reason: 'Marque absente du référentiel WinPro' },
  ETF: { available: false, reason: 'Prix maison (ETF EXW) — pas de tarif WinPro' },
};

export function getWinproForBrand(brand: string): WinproAvailability | undefined {
  return BRAND_TO_WINPRO[brand.trim().toUpperCase()];
}

export function getBrandForWinproCode(cMarque: string): string | null {
  const code = cMarque.trim().toUpperCase();
  for (const [brand, entry] of Object.entries(BRAND_TO_WINPRO)) {
    if (entry.available && entry.cMarque === code) return brand;
  }
  return null;
}
