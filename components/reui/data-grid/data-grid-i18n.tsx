export interface DataGridI18nLabels {
  /* The column header menu. */
  sortAscending: string
  sortDescending: string
  pinColumnStart: string
  pinColumnEnd: string
  moveColumnStart: string
  moveColumnEnd: string
  columnsMenu: string
  unpinColumn: (title: string) => string
  toggleColumns: string
  /* Row and cell affordances. */
  rowCreate: string
  pinRow: string
  unpinRow: string
  selectRow: string
  selectAll: string
  expandRow: string
  collapseRow: string
  dragToReorder: string
  dragToReorderRow: string
  reorderingUnavailable: string
  /* Grid states. */
  loading: string
  empty: string
  allRowsLoaded: string
  /* Pagination. */
  rowsPerPage: string
  paginationInfo: (info: { from: number; to: number; count: number }) => string
  previousPage: string
  nextPage: string
  goToPage: (page: number) => string
  paginationEllipsis: string
  /* The faceted column filter. */
  filterSelectedCount: (count: number) => string
  filterNoResults: string
  filterClear: string
}

export interface DataGridI18nConfig {
  labels: DataGridI18nLabels
}

export type DataGridI18nOverrides = {
  labels?: Partial<DataGridI18nLabels>
}

const DEFAULT_DATA_GRID_LABELS: DataGridI18nLabels = {
  sortAscending: "Croissant",
  sortDescending: "Décroissant",
  pinColumnStart: "Épingler à gauche",
  pinColumnEnd: "Épingler à droite",
  moveColumnStart: "Déplacer à gauche",
  moveColumnEnd: "Déplacer à droite",
  columnsMenu: "Colonnes",
  unpinColumn: (title) => `Désépingler la colonne ${title}`,
  toggleColumns: "Afficher/Masquer les colonnes",
  rowCreate: "Ajouter une ligne",
  pinRow: "Épingler la ligne",
  unpinRow: "Désépingler la ligne",
  selectRow: "Sélectionner la ligne",
  selectAll: "Tout sélectionner",
  expandRow: "Développer la ligne",
  collapseRow: "Réduire la ligne",
  dragToReorder: "Glisser pour réordonner",
  dragToReorderRow: "Glisser pour réordonner la ligne",
  reorderingUnavailable: "Réordonnancement indisponible",
  loading: "Chargement…",
  empty: "Aucune donnée disponible",
  allRowsLoaded: "Tous les enregistrements sont chargés",
  rowsPerPage: "Lignes par page",
  paginationInfo: ({ from, to, count }) => `${from} – ${to} sur ${count}`,
  previousPage: "Page précédente",
  nextPage: "Page suivante",
  goToPage: (page) => `Aller à la page ${page}`,
  paginationEllipsis: "...",
  filterSelectedCount: (count) => `${count} sélectionné(s)`,
  filterNoResults: "Aucun résultat trouvé.",
  filterClear: "Effacer les filtres",
}

const DEFAULT_DATA_GRID_I18N: DataGridI18nConfig = Object.freeze({
  labels: Object.freeze(DEFAULT_DATA_GRID_LABELS),
})

/**
 * A shallow merge per section, deliberately: a deep merge would leak a
 * default back into a function-valued label the consumer replaced. With no
 * overrides the frozen default is returned as-is, so the merge is free to
 * run on every render without producing a new identity.
 */
export function mergeDataGridI18n(
  overrides?: DataGridI18nOverrides
): DataGridI18nConfig {
  if (!overrides?.labels) return DEFAULT_DATA_GRID_I18N
  return {
    labels: { ...DEFAULT_DATA_GRID_LABELS, ...overrides.labels },
  }
}