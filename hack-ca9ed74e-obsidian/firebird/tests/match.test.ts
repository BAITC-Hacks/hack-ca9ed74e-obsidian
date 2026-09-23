import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../src/server/catalog';
import { exclusionReasons, match } from '../src/domain/match';
import { querySchema } from '../src/shared/schema';
import type { Profile, Query } from '../src/shared/types';

const profiles = loadCatalog();
export const demo: Query = { city: 'Алматы', category: 'Ведущий', format: 'корпоратив', date: '2026-10-10', budget: 1_000_000, hours: 6, language: 'русский' };

describe('original organizer catalog', () => {
  it('loads all records and preserves provenance and nullable durations', () => {
    expect(profiles).toHaveLength(66);
    expect(new Set(profiles.map(p => p.id)).size).toBe(66);
    expect(profiles.filter(p => p.synthetic)).toHaveLength(13);
    expect(profiles.filter(p => p.maxHours === null)).toHaveLength(9);
    expect(profiles.filter(p => p.priceImputed)).toHaveLength(18);
  });
  it('ranks 4 eligible October candidates into exactly 3 cards', () => {
    const result = match(profiles, demo);
    expect(result.status).toBe('matched');
    expect(result.totalInCategory).toBe(10);
    expect(result.eligibleCount).toBe(4);
    expect(result.recommendations).toHaveLength(3);
    for (const card of result.recommendations) {
      expect(['HK-88430', 'HK-77838', 'HK-27222', 'HK-29829']).toContain(card.profile.id);
      expect(exclusionReasons(card.profile, demo)).toEqual([]);
      expect(card.explanation).toContain('от');
      expect(card.profile.description).toContain(card.evidence[0].text.replace(/…$/, ''));
    }
    expect(new Set(result.recommendations.map(c => c.explanation)).size).toBe(3);
  });
  it('is deterministic, including when catalog row order changes', () => {
    const result = match(profiles, demo);
    expect(match(profiles, demo)).toEqual(result);
    expect(match([...profiles].reverse(), demo)).toEqual(result);
  });
  it('changes candidates when only the date changes', () => {
    const second = match(profiles, { ...demo, date: '2026-10-17' });
    expect(second.recommendations.map(c => c.profile.id).sort()).toEqual(['HK-35215', 'HK-44733', 'HK-77838']);
    expect(second.recommendations.map(c => c.profile.id)).not.toEqual(match(profiles, demo).recommendations.map(c => c.profile.id));
    expect(second.recommendations.every(c => c.explanation.includes('17.10.2026'))).toBe(true);
  });
  it('returns one florist and explains why fewer than three', () => {
    const result = match(profiles, { city: 'Алматы', category: 'Флорист', format: 'свадьба', date: '2026-10-10', budget: 300_000, hours: 24 });
    expect(result.totalInCategory).toBe(2);
    expect(result.recommendations.map(c => c.profile.id)).toEqual(['HK-39372']);
    expect(result.reasons.busy).toBe(1);
    expect(result.reasons.duration).toBe(0);
  });
  it('distinguishes category absence from restrictive conditions', () => {
    expect(match(profiles, { ...demo, city: 'Астана', category: 'Декоратор' }).status).toBe('category_absent');
    const blocked = match(profiles, { ...demo, budget: 100_000 });
    expect(blocked.status).toBe('no_match');
    expect(blocked.reasons.budget).toBe(10);
    expect(blocked.suggestions.some(s => s.query.budget === 500_000)).toBe(true);
  });
  it('handles December occupancy without relaxing the query', () => {
    const result = match(profiles, { ...demo, date: '2026-12-12' });
    expect(result.status).toBe('no_match');
    expect(result.reasons.busy).toBe(9);
    expect(result.query.date).toBe('2026-12-12');
    for (const suggestion of result.suggestions) {
      expect(match(profiles, suggestion.query).eligibleCount).toBe(suggestion.eligible);
      expect(suggestion.eligible).toBeGreaterThan(0);
    }
  });
  it('applies the same calendar to venues without duplicating multi-category profiles', () => {
    const query = { ...demo, category: 'Банкетный зал', budget: 10_000_000 };
    const result = match(profiles, query);
    expect(result.totalInCategory).toBe(7);
    expect(new Set(result.recommendations.map(c => c.profile.id)).size).toBe(result.recommendations.length);
    expect(result.recommendations.every(c => !c.profile.busyDates.includes(query.date))).toBe(true);
  });
  it('never returns a busy or otherwise ineligible candidate over the 100-day calendar', () => {
    for (let offset = 0; offset < 100; offset++) {
      const date = new Date('2026-09-23T00:00:00Z'); date.setUTCDate(date.getUTCDate() + offset);
      const query = { ...demo, date: date.toISOString().slice(0, 10) };
      const result = match(profiles, query);
      expect(result.recommendations.length).toBeLessThanOrEqual(3);
      expect(result.excludedCount + result.eligibleCount).toBe(result.totalInCategory);
      for (const card of result.recommendations) expect(exclusionReasons(card.profile, query)).toEqual([]);
    }
  });
});

describe('boundary conditions', () => {
  const base: Profile = { ...profiles[0], id: 'test', categories: ['Ведущий'], formats: ['корпоратив'], city: 'Алматы', price: 500_000, maxHours: 6, languages: ['русский'], busyDates: [], description: 'Проводим корпоративные мероприятия и деловые встречи.' };
  it('includes exact budget and duration limits, rejects excess and wrong language', () => {
    expect(exclusionReasons(base, { ...demo, budget: 500_000, hours: 6 })).toEqual([]);
    expect(exclusionReasons(base, { ...demo, budget: 499_999, hours: 6.5, language: 'казахский' })).toEqual(['budget', 'language', 'duration']);
  });
  it('does not let description override structured formats', () => {
    const kiki = profiles.find(p => p.id === 'HK-35215')!;
    expect(kiki.description).toContain('конференции');
    expect(exclusionReasons(kiki, { ...demo, format: 'конференция' })).toContain('format');
  });
  it('breaks ties using id, not row order', () => {
    const result = match([{ ...base, id: 'B' }, { ...base, id: 'A' }], demo);
    expect(result.recommendations.map(c => c.profile.id)).toEqual(['A', 'B']);
  });
  it.each(['2026-02-30', '2026-09-22', '2027-01-01', 'not-a-date'])('rejects invalid or unknown date %s', date => {
    expect(querySchema.safeParse({ ...demo, date }).success).toBe(false);
  });
  it.each([0, -1, NaN, Infinity, 10.5])('rejects invalid budget %s', budget => {
    expect(querySchema.safeParse({ ...demo, budget }).success).toBe(false);
  });
});
