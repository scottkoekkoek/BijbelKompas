import { z } from "zod";
import { PassageRef } from "./notes";

/** Sprint 7: collections and research questions (BK-047..BK-051, ADR-008). */
export const CollectionType = z.enum(["dossier", "preekserie", "thema", "studie"]);
export type CollectionType = z.infer<typeof CollectionType>;
export const COLLECTION_TYPE_LABELS: Record<CollectionType, string> = {
  dossier: "Dossier",
  preekserie: "Preekserie",
  thema: "Thema",
  studie: "Bijbelstudie",
};

export const CollectionInput = z
  .object({
    name: z.string().trim().min(1, "Geef de collectie een naam").max(100),
    collectionType: CollectionType.default("dossier"),
    description: z.string().trim().max(1000).default(""),
    parentId: z.uuid().nullable().default(null),
  })
  .strict();
export type CollectionInput = z.infer<typeof CollectionInput>;
export const CollectionUpdate = z
  .object({
    name: z.string().trim().min(1, "Geef de collectie een naam").max(100).optional(),
    collectionType: CollectionType.optional(),
    description: z.string().trim().max(1000).optional(),
    parentId: z.uuid().nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict();
export type CollectionUpdate = z.infer<typeof CollectionUpdate>;

/** Add, remove or reorder the notes of a collection. */
export const CollectionItemsChange = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), noteId: z.uuid() }).strict(),
  z.object({ action: z.literal("remove"), noteId: z.uuid() }).strict(),
  z.object({ action: z.literal("order"), noteIds: z.array(z.uuid()).max(1000) }).strict(),
]);
export type CollectionItemsChange = z.infer<typeof CollectionItemsChange>;

export type Collection = {
  id: string;
  parentId: string | null;
  name: string;
  collectionType: CollectionType;
  description: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  noteCount: number;
};

export const QuestionStatus = z.enum(["open", "in_onderzoek", "beantwoord", "gearchiveerd"]);
export type QuestionStatus = z.infer<typeof QuestionStatus>;
export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  open: "Open",
  in_onderzoek: "In onderzoek",
  beantwoord: "Beantwoord",
  gearchiveerd: "Gearchiveerd",
};

export const QuestionInput = z
  .object({
    title: z.string().trim().min(1, "Schrijf de vraag op").max(200),
    description: z.string().trim().max(5000).default(""),
  })
  .strict();
export type QuestionInput = z.infer<typeof QuestionInput>;
export const QuestionUpdate = z
  .object({
    title: z.string().trim().min(1, "Schrijf de vraag op").max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    status: QuestionStatus.optional(),
    answer: z.string().trim().max(20000).optional(),
  })
  .strict();
export type QuestionUpdate = z.infer<typeof QuestionUpdate>;

/** Link or unlink a note or a passage (BK-050). */
export const QuestionLinkChange = z.discriminatedUnion("action", [
  z.object({ action: z.literal("addNote"), noteId: z.uuid() }).strict(),
  z.object({ action: z.literal("removeNote"), noteId: z.uuid() }).strict(),
  z.object({ action: z.literal("addPassage"), passage: PassageRef, label: z.string().trim().min(1).max(200) }).strict(),
  z.object({ action: z.literal("removePassage"), passageId: z.uuid() }).strict(),
]);
export type QuestionLinkChange = z.infer<typeof QuestionLinkChange>;

export type QuestionPassage = {
  id: string;
  label: string;
  translation: string;
  book: string;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
};
export type Question = {
  id: string;
  title: string;
  description: string;
  status: QuestionStatus;
  answer: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};
