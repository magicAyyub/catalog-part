/** Découpe les insertions groupées, SQLite plafonnant le nombre de paramètres par requête. */
export function* chunked<T>(rows: T[], size = 100): Generator<T[]> {
    for (let i = 0; i < rows.length; i += size) {
        yield rows.slice(i, i + size);
    }
}
