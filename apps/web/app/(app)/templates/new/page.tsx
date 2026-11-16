import type { Metadata } from "next";
import Link from "next/link";
import { TemplateForm } from "@/components/notes/TemplateForm";
import { getTemplate } from "@/lib/notes/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Nieuw sjabloon" };

type Props = { searchParams: Promise<{ van?: string }> };

/** New template, empty or as a copy (?van=<id> or a built-in key). */
export default async function NewTemplatePage({ searchParams }: Props) {
  const from = (await searchParams).van;
  const supabase = await createClient();
  const source = from && /^(ingebouwd:[a-z]{1,30}|[0-9a-f-]{36})$/.test(from) ? await getTemplate(supabase, from) : null;

  return (
    <>
      <p className="crumb">
        <Link href="/templates">Sjablonen</Link>
      </p>
      <h1>{source ? `Kopie van ${source.name}` : "Nieuw sjabloon"}</h1>
      <TemplateForm
        initial={
          source
            ? { name: `${source.name} (kopie)`.slice(0, 100), noteType: source.noteType, description: source.description, parts: source.parts }
            : { name: "", noteType: "preek", description: "", parts: [{ kind: "kop", text: "" }] }
        }
      />
    </>
  );
}
