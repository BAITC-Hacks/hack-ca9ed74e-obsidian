import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { MAX_DATE, MIN_DATE, type CatalogMeta, type Profile } from '../shared/types';

const list = (value: string) => [...new Set(value.split('|').map(x => x.trim()).filter(Boolean))];
function flag(value: string): boolean {
  if (value === 'True') return true;
  if (value === 'False') return false;
  throw new Error(`Некорректный флаг CSV: ${value}`);
}
export function loadCatalog(path = fileURLToPath(new URL('../../data/catalog.csv', import.meta.url))): Profile[] {
  const rows = parse(readFileSync(path, 'utf8'), { columns: true, bom: true, skip_empty_lines: true }) as Record<string, string>[];
  const ids = new Set<string>();
  return rows.map(row => {
    const required = ['id', 'anon_name', 'categories', 'city', 'price_from_kzt', 'event_formats', 'languages', 'description'];
    if (required.some(key => !row[key]?.trim()) || ids.has(row.id)) throw new Error(`Некорректная запись CSV: ${row.id}`);
    ids.add(row.id);
    const price = Number(row.price_from_kzt);
    const maxHours = row.max_hours?.trim() ? Number(row.max_hours) : null;
    const busyDates = list(row.busy_dates ?? '');
    if (!Number.isFinite(price) || price <= 0 || (maxHours !== null && (!Number.isFinite(maxHours) || maxHours <= 0))) {
      throw new Error(`Некорректная цена или длительность: ${row.id}`);
    }
    if (busyDates.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < MIN_DATE || date > MAX_DATE ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) throw new Error(`Некорректный календарь: ${row.id}`);
    return {
      id: row.id, name: row.anon_name, categories: list(row.categories), city: row.city,
      price, formats: list(row.event_formats), languages: list(row.languages), maxHours, busyDates,
      description: row.description.trim(), synthetic: flag(row.synthetic),
      cityImputed: flag(row.city_imputed), priceImputed: flag(row.price_imputed),
    };
  });
}
export function catalogMeta(profiles: Profile[], aiConfigured: boolean): CatalogMeta {
  const unique = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'ru'));
  return {
    count: profiles.length, syntheticCount: profiles.filter(x => x.synthetic).length,
    cities: unique(profiles.map(x => x.city)), categories: unique(profiles.flatMap(x => x.categories)),
    formats: unique(profiles.flatMap(x => x.formats)), languages: unique(profiles.flatMap(x => x.languages)),
    minDate: MIN_DATE, maxDate: MAX_DATE, aiConfigured,
  };
}
