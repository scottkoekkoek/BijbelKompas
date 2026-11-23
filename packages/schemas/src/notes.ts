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
  /** Ronde 3 §3: a draft in the trash (left out of lists, search and offline views) */
  trashed: z.boolean().optional(),
  updatedAt: z.string(),
});
export type NoteSummary = z.infer<typeof NoteSummary>;

/** BK-019: sermon metadata, stored by name (names are reused case-insensitively). */
const shortText = (max: number) => z.string().trim().max(max).nullable();
export const SermonDetails = z
  .object({
    speaker: shortText(120),
    organization: shortText(120),
    series: shortText(120),
    serviceType: shortText(60),
  })
  .strict();
export type SermonDetails = z.infer<typeof SermonDetails>;
export const EMPTY_SERMON: SermonDetails = { speaker: null, organization: null, series: null, serviceType: null };
export const SERVICE_TYPE_SUGGESTIONS = ["Ochtenddienst", "Middagdienst", "Avonddienst", "Doordeweekse dienst"];

export const Note = NoteSummary.extend({ document: NoteDocument, sermon: SermonDetails });
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
    /** start from a template: an own template id or a built-in key such as "ingebouwd:preek" */
    template: z.union([z.uuid(), z.string().regex(/^ingebouwd:[a-z]{1,30}$/)]).optional(),
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
    sermon: SermonDetails.optional(),
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

/** BK-020: own templates. A template is only a starting structure for new notes. */
export const TemplatePartKind = z.enum(["kop", "alinea", "citaat", "bijbelverwijzing", "vraag", "toepassing", "gebed"]);
export type TemplatePartKind = z.infer<typeof TemplatePartKind>;
export const TEMPLATE_PART_LABELS: Record<TemplatePartKind, string> = {
  kop: "Kop",
  alinea: "Alinea",
  citaat: "Citaat",
  bijbelverwijzing: "Bijbelverwijzing",
  vraag: "Vraag",
  toepassing: "Toepassing",
  gebed: "Gebed",
};
export const TemplatePart = z.object({ kind: TemplatePartKind, text: z.string().max(500) }).strict();
export type TemplatePart = z.infer<typeof TemplatePart>;

export const TemplateInput = z
  .object({
    name: z.string().trim().min(1, "Geef het sjabloon een naam").max(100),
    noteType: NoteType,
    description: z.string().trim().max(500),
    parts: z.array(TemplatePart).min(1, "Voeg minstens één onderdeel toe").max(50),
  })
  .strict();
export type TemplateInput = z.infer<typeof TemplateInput>;
export const TemplateUpdate = TemplateInput.partial().extend({ archived: z.boolean().optional() }).strict();
export type TemplateUpdate = z.infer<typeof TemplateUpdate>;

export const NoteTemplate = TemplateInput.extend({
  id: z.string(),
  builtIn: z.boolean(),
  version: z.number().int(),
  archived: z.boolean(),
});
export type NoteTemplate = z.infer<typeof NoteTemplate>;
