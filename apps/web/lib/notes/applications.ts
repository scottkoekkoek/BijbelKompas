/**
 * Ronde 4 (B4): what you wanted to apply. The blocks under a heading "Toepassing" (the template part
 * of that name) until the next heading. Pure: it reads the derived blocks, never the note itself.
 */
export type BlockRow = { note_id: string; block_id: string; block_type: string; plain_text: string; position: number };
export type Application = { noteId: string; blockId: string; text: string };

const HEADING = /^\s*toepassing(en)?\s*:?\s*$/iu;

export function applicationsFromBlocks(blocks: BlockRow[]): Application[] {
  const out: Application[] = [];
  const byNote = new Map<string, BlockRow[]>();
  for (const b of blocks) byNote.set(b.note_id, [...(byNote.get(b.note_id) ?? []), b]);
  for (const [noteId, list] of byNote) {
    let inside = false;
    for (const b of [...list].sort((x, y) => x.position - y.position)) {
      if (b.block_type === "heading") {
        inside = HEADING.test(b.plain_text);
        continue;
      }
      if (inside && b.plain_text.trim()) out.push({ noteId, blockId: b.block_id, text: b.plain_text.trim().slice(0, 1000) });
    }
  }
  return out;
}
