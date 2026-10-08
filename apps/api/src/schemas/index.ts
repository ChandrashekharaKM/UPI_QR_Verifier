import { z } from 'zod';

export const VerifyRequestSchema = z.object({
  payload: z
    .string()
    .min(1, 'Payload cannot be empty')
    .max(2048, 'Payload exceeds maximum allowed length of 2048 characters'),
  optInTelemetry: z.boolean().optional().default(false)
});

export type VerifyRequestBody = z.infer<typeof VerifyRequestSchema>;

export const ReportRequestSchema = z.object({
  vpa: z
    .string()
    .min(3, 'VPA must be at least 3 characters')
    .max(100, 'VPA must not exceed 100 characters')
    .regex(/^.+@.+$/, 'VPA must be in valid format (e.g. username@bank)'),
  reason: z.enum([
    'phishing',
    'fake_support',
    'impersonation',
    'unauthorized_charge',
    'other'
  ]),
  note: z.string().max(500, 'Note cannot exceed 500 characters').optional(),
  deviceId: z.string().max(128).optional()
});

export type ReportRequestBody = z.infer<typeof ReportRequestSchema>;

export const VpaParamsSchema = z.object({
  vpa: z.string().min(1, 'VPA parameter is required')
});

export type VpaParams = z.infer<typeof VpaParamsSchema>;
