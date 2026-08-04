import { z } from 'zod';

export const searchProviderSchema = z.enum(['volcengine', 'bocha']);
export type SearchProviderName = z.infer<typeof searchProviderSchema>;
