export function normalizeSearchText(value: string): string {
  return value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2018\u2019\u201b\u02bb\u02bc\u02be\u02bf\uff07]/g, '');
}
