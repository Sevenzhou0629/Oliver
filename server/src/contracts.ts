import { z } from "zod";
export const Cycle = z.enum([
  "month",
  "quarter",
  "half_year",
  "calendar_year",
  "card_anniversary_year",
]);
export const Definition = z.object({
  id: z.string(),
  productId: z.string(),
  title: z.string().max(200),
  allowanceMinor: z.number().int().min(0).max(10000000),
  cycle: Cycle,
  timezone: z.string().default("America/Los_Angeles"),
  sharedWithAU: z.boolean(),
  enrollmentRequired: z.boolean(),
  verificationStatus: z.literal("mock_only"),
});
export type Definition = z.infer<typeof Definition>;
export const BenefitConfirmation = z.object({
  confirmed: z.boolean(),
  amountMinor: z.number().int().min(0).max(1000000),
});
