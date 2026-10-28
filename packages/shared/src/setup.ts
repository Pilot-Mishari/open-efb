import { z } from "zod";

/**
 * One row of the first-launch setup wizard: what the integration is, whether it works today, and
 * what (if anything) the user has to do. The four statuses are the only vocabulary the wizard and
 * the Settings screen use, so every screen words them the same way:
 * - "connected":   verified working right now (a real check ran, not a guess).
 * - "needs_setup": required for a feature the user probably wants, and not configured yet.
 * - "optional":    available, works without configuration, or configured but idle.
 * - "unavailable": cannot work on this machine / with this account, with the reason stated.
 */
export const SetupStatusKindSchema = z.enum(["connected", "needs_setup", "optional", "unavailable"]);
export type SetupStatusKind = z.infer<typeof SetupStatusKindSchema>;

export const SetupItemSchema = z.object({
  /** Stable id used by tests and the UI ("simbrief", "gsx", "simulator", "fsuipc", "charts", ...). */
  id: z.string(),
  title: z.string(),
  status: SetupStatusKindSchema,
  /** One or two honest sentences: what was observed, or exactly what to do next. */
  detail: z.string(),
  /** The action the wizard offers for this row, e.g. "save", "test", "open". Null when none applies. */
  action: z.string().nullable(),
});
export type SetupItem = z.infer<typeof SetupItemSchema>;

export const SetupStatusSchema = z.object({
  items: z.array(SetupItemSchema),
  /** True until the user finishes or dismisses the wizard; persisted in settings. */
  completed: z.boolean(),
});
export type SetupStatus = z.infer<typeof SetupStatusSchema>;
