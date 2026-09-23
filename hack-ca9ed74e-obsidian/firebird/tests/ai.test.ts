import { describe, expect, it, vi } from 'vitest';
import { enhanceExplanations, type AIConfig } from '../src/server/ai';
import { match } from '../src/domain/match';
import { loadCatalog } from '../src/server/catalog';

const query = { city: 'Алматы', category: 'Ведущий', format: 'корпоратив', date: '2026-10-10', budget: 1_000_000, hours: 6, language: 'русский' };
const result = match(loadCatalog(), query);
const config: AIConfig = { endpoint: 'https://test.invalid/chat', key: 'test-only', model: 'test', timeoutMs: 500 };
const reply = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));

describe('AI evidence contract', () => {
  it('requires no external request without credentials', async () => {
    const fetcher = vi.fn();
    expect(await enhanceExplanations(result, null, fetcher)).toEqual(result);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('accepts only offered evidence, preserves order and caches validated selections', async () => {
    const selections = result.recommendations.map(c => ({ id: c.profile.id, evidence_id: c.evidence.at(-1)!.id }));
    const fetcher = vi.fn().mockResolvedValue(reply({ selections }));
    const enhanced = await enhanceExplanations(result, config, fetcher);
    expect(enhanced.explanationMode).toBe('ai');
    expect(enhanced.recommendations.map(c => c.profile.id)).toEqual(result.recommendations.map(c => c.profile.id));
    expect(enhanced.recommendations[0].selectedEvidenceId).toBe(selections[0].evidence_id);
    expect(await enhanceExplanations(result, config, fetcher)).toEqual(enhanced);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['unknown-id', 'duplicate', 'incomplete', 'invalid-json', 'network'])('falls back safely for %s', async kind => {
    const selections = result.recommendations.map(c => ({ id: c.profile.id, evidence_id: c.evidence[0].id }));
    if (kind === 'unknown-id') selections[0].evidence_id = 'invented';
    if (kind === 'duplicate') selections[1] = selections[0];
    if (kind === 'incomplete') selections.pop();
    const fetcher = kind === 'network' ? vi.fn().mockRejectedValue(new Error('offline'))
      : vi.fn().mockResolvedValue(kind === 'invalid-json' ? new Response('oops') : reply({ selections }));
    const fallback = await enhanceExplanations(result, { ...config, model: kind }, fetcher);
    expect(fallback.explanationMode).toBe('fallback');
    expect(fallback.recommendations).toEqual(result.recommendations);
  });
});
