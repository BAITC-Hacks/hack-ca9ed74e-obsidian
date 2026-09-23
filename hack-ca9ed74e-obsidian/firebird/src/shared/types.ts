export const MIN_DATE = '2026-09-23';
export const MAX_DATE = '2026-12-31';

export interface Profile {
  id: string;
  name: string;
  categories: string[];
  city: string;
  price: number;
  formats: string[];
  languages: string[];
  maxHours: number | null;
  busyDates: string[];
  description: string;
  synthetic: boolean;
  cityImputed: boolean;
  priceImputed: boolean;
}

export interface Query {
  city: string;
  date: string;
  format: string;
  category: string;
  budget: number;
  hours?: number;
  language?: string;
}
export type ExclusionReason = 'busy' | 'budget' | 'format' | 'language' | 'duration';
export interface Evidence { id: string; text: string; relevance: number }
export interface Recommendation {
  profile: Profile;
  explanation: string;
  evidence: Evidence[];
  selectedEvidenceId: string;
  rankReason: string;
}
export interface Suggestion {
  label: string;
  query: Query;
  eligible: number;
}
export interface SearchResult {
  status: 'matched' | 'category_absent' | 'no_match';
  query: Query;
  totalInCategory: number;
  eligibleCount: number;
  excludedCount: number;
  reasons: Record<ExclusionReason, number>;
  recommendations: Recommendation[];
  suggestions: Suggestion[];
  explanationMode: 'local' | 'ai' | 'fallback';
  elapsedMs: number;
}
export interface CatalogMeta {
  count: number;
  syntheticCount: number;
  cities: string[];
  categories: string[];
  formats: string[];
  languages: string[];
  minDate: string;
  maxDate: string;
  aiConfigured: boolean;
}
