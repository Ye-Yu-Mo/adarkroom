/** Shared Zod validation schemas.
 *  Used by server auth handlers. Exported for testing.
 *  @module shared/validation
 */

import { z } from 'zod';

export const registerSchema = z.object({
  device_id: z.string().min(1).max(64),
  display_name: z.string().min(1).max(24),
});

export const loginSchema = z.object({
  device_id: z.string().min(1).max(64),
});
