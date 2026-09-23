import { z } from 'zod';
import { MIN_DATE, MAX_DATE } from './types';

export const querySchema = z.object({
  city: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(100),
  format: z.string().trim().min(1).max(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => {
    const parsed = new Date(`${date}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
      && date >= MIN_DATE && date <= MAX_DATE;
  }, 'Дата должна быть в календаре 23.09–31.12.2026'),
  budget: z.number().finite().int().min(1).max(1_000_000_000),
  hours: z.number().finite().min(0.5).max(24).optional(),
  language: z.string().trim().min(1).max(60).optional(),
}).strict();
