import { z } from "zod";
import { NoteDocument, NoteStatus, NoteSummary, NoteType, RevisionReason, SermonDetails } from "./notes";

/** Sprint 5 (BK-025..BK-028): device operations. Every operation id is applied at most once. */
export const SyncOperation = z
  .object({
    operationId: z.uuid(),
    type: z.enum(["create", "save"]),
    noteId: z.uuid(),
    baseVersion: z.number().int().min(1).nullable(),
    title: z.string().max(200),
    noteType: NoteType,
    eventDate: z.iso.date().nullable(),
    document: NoteDocument,
    sermon: SermonDetails.optional(),
    reason: RevisionReason.exclude(["herstel"]).optional(),
    status: NoteStatus.optional(),
  })
  .strict()
  .refine((o) => o.type === "create" || o.baseVersion !== null, { message: "baseVersion is nodig bij opslaan" });
export type SyncOperation = z.infer<typeof SyncOperation>;

export const SyncPushInput = z
  .object({ deviceId: z.uuid(), operations: z.array(SyncOperation).min(1).max(20) })
  .strict();
export type SyncPushInput = z.infer<typeof SyncPushInput>;

export const SyncResultStatus = z.enum(["accepted", "duplicate", "conflict", "rejected", "retryable"]);
export type SyncResultStatus = z.infer<typeof SyncResultStatus>;

export const SyncResult = z.object({
  operationId: z.string(),
  status: SyncResultStatus,
  /** for a duplicate: what happened the first time */
  original: z.enum(["accepted", "conflict", "rejected"]).optional(),
  message: z.string().optional(),
  note: NoteSummary.nullable().optional(),
});
export type SyncResult = z.infer<typeof SyncResult>;

export const SyncPushResponse = z.object({ results: z.array(SyncResult) });
export type SyncPushResponse = z.infer<typeof SyncPushResponse>;

export const SyncPullResponse = z.object({
  notes: z.array(NoteSummary),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type SyncPullResponse = z.infer<typeof SyncPullResponse>;

export const DeviceInput = z.object({ deviceId: z.uuid(), label: z.string().trim().max(100) }).strict();
