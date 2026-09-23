import type { Evidence, Profile, Query } from '../shared/types';

export const money = (amount: number) => new Intl.NumberFormat('ru-RU').format(amount);
export const displayDate = (date: string) => date.split('-').reverse().join('.');

// Fixed, inspectable matching rules. This is text relevance, not an estimate of quality.
const stems: Record<string, string[]> = {
  'корпоратив': ['корпоратив', 'бизнес', 'делов', 'тимбилдинг'],
  'конференция': ['конференц', 'форум', 'делов', 'конгресс'],
  'свадьба': ['свад', 'невест', 'молодож', 'бракосочет'],
  'той': ['той', 'националь', 'казах', 'традици'],
  'юбилей': ['юбиле', 'годовщин'],
  'день рождения': ['день рожден', 'дня рожден', 'дни рожден', 'именин'],
};
export function relevance(text: string, format: string): number {
  const normalized = text.toLowerCase().replaceAll('ё', 'е');
  return (stems[format] ?? [format]).filter(stem => normalized.includes(stem)).length;
}

export function evidenceFor(profile: Profile, query: Query): Evidence[] {
  // Split at sentences / bullets; retain literal source snippets rather than inventing claims.
  const fragments = profile.description.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+|[•\n]+/u)
    .map(text => text.trim()).filter(text => text.length >= 20);
  const evidence = (fragments.length ? fragments : [profile.description]).map((text, index) => ({
    id: `${profile.id}:description:${index}`,
    text: text.length > 260 ? `${text.slice(0, 257).trimEnd()}…` : text,
    relevance: relevance(text.length > 260 ? text.slice(0, 257) : text, query.format),
  }));
  return evidence.sort((a, b) => b.relevance - a.relevance || a.id.localeCompare(b.id, 'en')).slice(0, 6);
}

export function explain(profile: Profile, query: Query, evidence: Evidence): string {
  const details = [`формат «${query.format}»`, `цена от ${money(profile.price)} ₸ при бюджете ${money(query.budget)} ₸`];
  if (query.language) details.push(`язык — ${query.language}`);
  if (query.hours !== undefined) details.push(profile.maxHours === null
    ? 'ограничение часов присутствия не применяется'
    : `до ${profile.maxHours} ч при запросе ${query.hours} ч`);
  // Price is an entry price, never an estimate or a confirmed quote.
  return `На ${displayDate(query.date)} нет отметки о занятости; ${details.join('; ')}. В описании профиля: «${evidence.text.replace(/[.!?]+$/u, '')}»`;
}
