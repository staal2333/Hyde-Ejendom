// ============================================================
// Shared Zod schemas for API input validation (H2)
// ============================================================

import { z } from "zod";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Quick email format check (no Zod dependency) */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export const emailSchema = z
  .string()
  .min(1, "Email is required")
  .email("Invalid email format");

export const createPropertySchema = z.object({
  address: z.string().min(3, "En gyldig adresse er påkrævet (min. 3 tegn)"),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  startResearch: z.boolean().optional(),
  outdoorScore: z.number().min(0).max(10).optional().nullable(),
  dailyTraffic: z.number().min(0).optional().nullable(),
  trafficSource: z.string().optional().nullable(),
  outdoorNotes: z.string().optional().nullable(),
  source: z.enum(["manual", "discovery"]).optional(),
});

export const sendEmailSchema = z.object({
  propertyId: z.string().min(1, "propertyId is required").optional(),
  propertyIds: z.array(z.string()).optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  to: z.string().email("Invalid recipient email").optional(),
  attachmentUrl: z.string().url().optional().nullable(),
  attachmentFile: z
    .object({
      filename: z.string(),
      content: z.string(),
    })
    .optional()
    .nullable(),
});

export const stagedPropertyCreateSchema = z.object({
  name: z.string().min(1, "name is required"),
  address: z.string().min(1, "address is required"),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  outdoorScore: z.number().min(0).max(10).optional(),
  outdoorNotes: z.string().optional(),
  dailyTraffic: z.number().min(0).optional(),
  trafficSource: z.string().optional(),
  source: z.enum(["manual", "discovery", "street_agent"]).optional(),
});

export const leadDiscoverSchema = z.object({
  source: z.literal("meta").optional().default("meta"),
  query: z.string().min(1, "query is required"),
  country: z.string().length(2).optional().default("DK"),
  limit: z.number().min(1).max(100).optional().default(30),
  platform: z.enum(["all", "instagram"]).optional().default("all"),
});

export const leadCompaniesSchema = z.object({
  cvrs: z.array(z.string()).optional().default([]),
  names: z.array(z.string()).optional().default([]),
});

/**
 * Parse request body with a Zod schema.
 * Returns { data } on success, { error, detail } on validation failure.
 */
export function parseBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown,
): { ok: true; data: T } | { ok: false; error: string; detail: string } {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return { ok: false, error: "Validation error", detail: issues };
}
