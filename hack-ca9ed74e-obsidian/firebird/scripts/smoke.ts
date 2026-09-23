import { loadCatalog } from '../src/server/catalog';
import { match } from '../src/domain/match';
import type { Query } from '../src/shared/types';

type SmokeCase = {
  name: string;
  query: Query;
  status: ReturnType<typeof match>['status'];
  cards: number;
  ids?: string[];
};

const cases: SmokeCase[] = [
  {
    name: 'dense category',
    query: { city: 'Алматы', date: '2026-10-10', format: 'корпоратив', category: 'Ведущий', budget: 1_000_000, hours: 6, language: 'русский' },
    status: 'matched',
    cards: 3,
    ids: ['HK-88430', 'HK-29829', 'HK-27222'],
  },
  {
    name: 'same query, another date',
    query: { city: 'Алматы', date: '2026-10-17', format: 'корпоратив', category: 'Ведущий', budget: 1_000_000, hours: 6, language: 'русский' },
    status: 'matched',
    cards: 3,
    ids: ['HK-35215', 'HK-44733', 'HK-77838'],
  },
  {
    name: 'rare category',
    query: { city: 'Алматы', date: '2026-10-10', format: 'свадьба', category: 'Флорист', budget: 300_000 },
    status: 'matched',
    cards: 1,
    ids: ['HK-39372'],
  },
  {
    name: 'category absent in city',
    query: { city: 'Зарубежье', date: '2026-10-10', format: 'корпоратив', category: 'Фото и видеобудки', budget: 700_000 },
    status: 'category_absent',
    cards: 0,
  },
  {
    name: 'candidates exist but constraints block all',
    query: { city: 'Алматы', date: '2026-10-10', format: 'корпоратив', category: 'Ведущий', budget: 100_000, hours: 6, language: 'русский' },
    status: 'no_match',
    cards: 0,
  },
  {
    name: 'december peak occupancy',
    query: { city: 'Алматы', date: '2026-12-12', format: 'корпоратив', category: 'Ведущий', budget: 1_000_000, hours: 6, language: 'русский' },
    status: 'no_match',
    cards: 0,
  },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const profiles = loadCatalog();
const rows = cases.map(item => {
  const result = match(profiles, item.query);
  const ids = result.recommendations.map(card => card.profile.id);
  assert(result.status === item.status, `${item.name}: expected status ${item.status}, got ${result.status}`);
  assert(result.recommendations.length === item.cards, `${item.name}: expected ${item.cards} cards, got ${result.recommendations.length}`);
  if (item.ids) assert(ids.join(',') === item.ids.join(','), `${item.name}: expected ids ${item.ids.join(',')}, got ${ids.join(',')}`);
  return {
    case: item.name,
    status: result.status,
    cards: result.recommendations.length,
    eligible: result.eligibleCount,
    busy: result.reasons.busy,
    ids: ids.join(',') || '-',
  };
});

console.table(rows);
console.log(`Smoke passed: ${cases.length} сценариев, ${profiles.length} профилей.`);
