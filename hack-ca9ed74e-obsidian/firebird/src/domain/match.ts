import { MAX_DATE, type Profile, type Query, type ExclusionReason, type SearchResult, type Suggestion } from '../shared/types';
import { querySchema } from '../shared/schema';
import { evidenceFor, explain, money, displayDate } from './explanations';

export function exclusionReasons(profile: Profile, query: Query): ExclusionReason[] {
  const reasons: ExclusionReason[] = [];
  if (profile.busyDates.includes(query.date)) reasons.push('busy');
  if (profile.price > query.budget) reasons.push('budget');
  if (!profile.formats.includes(query.format)) reasons.push('format');
  if (query.language && !profile.languages.includes(query.language)) reasons.push('language');
  if (query.hours !== undefined && profile.maxHours !== null && profile.maxHours < query.hours) reasons.push('duration');
  return reasons;
}

function suggest(base: Profile[], query: Query): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const add = (changed: Query, label: string) => {
    const eligible = base.filter(profile => exclusionReasons(profile, changed).length === 0).length;
    if (eligible) suggestions.push({ query: changed, label, eligible });
  };
  // These are counterfactual checks against the same city/category, not promises.
  const budgetCandidates = base.filter(p => exclusionReasons(p, query).every(reason => reason === 'budget'));
  if (budgetCandidates.length) {
    const price = Math.min(...budgetCandidates.map(p => p.price));
    if (price > query.budget) add({ ...query, budget: price }, `Бюджет ${money(price)} ₸`);
  }
  for (let offset = 1; offset <= 14; offset++) {
    const date = new Date(`${query.date}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    const next = date.toISOString().slice(0, 10);
    if (next > MAX_DATE) break;
    if (base.some(p => exclusionReasons(p, { ...query, date: next }).length === 0)) {
      add({ ...query, date: next }, `Дата ${displayDate(next)}`);
      break;
    }
  }
  if (query.language) {
    const { language: _language, ...withoutLanguage } = query;
    add(withoutLanguage, 'Без требования к языку');
  }
  if (query.hours !== undefined) {
    const { hours: _hours, ...withoutHours } = query;
    add(withoutHours, 'Без требования к длительности');
  }
  return suggestions.slice(0, 3);
}

export function match(profiles: Profile[], input: Query): SearchResult {
  const query = querySchema.parse(input);
  const base = profiles.filter(profile => profile.city === query.city && profile.categories.includes(query.category));
  const reasons: SearchResult['reasons'] = { busy: 0, budget: 0, format: 0, language: 0, duration: 0 };
  const eligible = base.filter(profile => {
    const excluded = exclusionReasons(profile, query);
    excluded.forEach(reason => reasons[reason]++);
    return excluded.length === 0;
  }).map(profile => {
    const evidence = evidenceFor(profile, query);
    return { profile, evidence, score: evidence[0].relevance };
  });
  eligible.sort((a, b) => b.score - a.score || a.profile.price - b.profile.price ||
    (a.profile.id < b.profile.id ? -1 : a.profile.id > b.profile.id ? 1 : 0));
  return {
    status: !base.length ? 'category_absent' : eligible.length ? 'matched' : 'no_match',
    query, totalInCategory: base.length, eligibleCount: eligible.length,
    excludedCount: base.length - eligible.length, reasons,
    recommendations: eligible.slice(0, 3).map(({ profile, evidence, score }) => ({
      profile, evidence, selectedEvidenceId: evidence[0].id,
      explanation: explain(profile, query, evidence[0]),
      rankReason: score ? 'В описании есть сведения, связанные с форматом мероприятия' : 'Соответствует условиям; при равенстве учитывается стартовая цена',
    })),
    suggestions: base.length && !eligible.length ? suggest(base, query) : [],
    explanationMode: 'local', elapsedMs: 0,
  };
}
