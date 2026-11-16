import { z } from "zod";
import { BookCode, TranslationCode } from "./bible";

export const NoteType = z.enum(["preek", "overdenking", "bijbelstudie", "gebed", "vrij"]);
export type NoteType = z.infer<typeof NoteType>;
export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  preek: "Preek",
  overdenking: "Overdenking",
  bijbelstudie: "Bijbelstudie",
  gebed: "Gebed",
  vrij: "Vrije notitie",
};

export const NoteStatus = z.enum(["concept", "afgerond"]);
export type NoteStatus = z.infer<typeof NoteStatus>;

export const RevisionReason = z.enum(["afronden", "handmatig", "pauze", "herstel"]);
export type RevisionReason = z.infer<typeof RevisionReason>;
export const REVISION_REASON_LABELS: Record<RevisionReason, string> = {
  afronden: "Afgerond",
  handmatig: "Handmatig opgeslagen",
  pauze: "Na een schrijfpauze",
  herstel: "Oude versie teruggezet",
};

/** A Bible reference in a translation's own numbering. */
export const PassageRef = z
  .object({
    translation: TranslationCode,
    book: BookCode,
    startChapter: z.number().int().min(1).max(150),
    startVerse: z.number().int().min(1).max(999),
    endChapter: z.number().int().min(1).max(150),
    endVerse: z.number().int().min(1).max(999),
  })
  .refine((r) => r.endChapter > r.startChapter || (r.endChapter === r.startChapter && r.endVerse >= r.startVerse), {
    message: "Het einde van de verwijzing ligt vóór het begin",
  });
export type PassageRef = z.infer<typeof PassageRef>;

/** TipTap/ProseMirror JSON. Deep validation happens in the app (lib/notes/document). */
export const NoteDocument = z
  .object({ type: z.literal("doc"), content: z.array(z.record(z.string(), z.unknown())).max(5000) })
  .loose();
export type NoteDocument = z.infer<typeof NoteDocument>;

const isoDate = z.iso.date().nullable();

export const NoteSummary = z.object({
  id: z.uuid(),
  title: z.string(),
  noteType: NoteType,
  status: NoteStatus,
  eventDate: isoDate,
  documentVersion: z.number().int(),
  currentRevision: z.number().int(),
  archived: z.boolean(),
  updatedAt: z.string(),
});
export type NoteSummary = z.infer<typeof NoteSummary>;

export const Note = NoteSummary.extend({ document: NoteDocument });
export type Note = z.infer<typeof Note>;

export const CreateNoteInput = z
  .object({
    title: z.string().max(200).optional(),
    noteType: NoteType.optional(),
    eventDate: isoDate.optional(),
    /** start with a Bible reference block (from the reader) */
    reference: PassageRef.optional(),
    /** start from an existing document (conflict copy) */
    document: NoteDocument.optional(),
  })
  .strict();
export type CreateNoteInput = z.infer<typeof CreateNoteInput>;

export const SaveNoteInput = z
  .object({
    baseVersion: z.number().int().min(1),
    title: z.string().max(200),
    noteType: NoteType,
    eventDate: isoDate,
    document: NoteDocument,
    reason: RevisionReason.exclude(["herstel"]).optional(),
    status: NoteStatus.optional(),
  })
  .strict();
export type SaveNoteInput = z.infer<typeof SaveNoteInput>;

export const RevisionSummary = z.object({
  revisionNumber: z.number().int(),
  reason: RevisionReason,
  title: z.string(),
  status: NoteStatus,
  createdAt: z.string(),
});
export type RevisionSummary = z.infer<typeof RevisionSummary>;
