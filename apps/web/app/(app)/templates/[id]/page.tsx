import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { TemplateForm } from "@/components/notes/TemplateForm";
import { getTemplate } from "@/lib/notes/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sjabloon bewerken" };

type Props = { params: Promise<{ id: string }> };

export default async function EditTemplatePage({ params }: Props) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  const t = await getTemplate(supabase, id.data);
  if (!t) notFound();

  return (
    <>
      <p className="crumb">
        <Link href="/templates">Sjablonen</Link>
      </p>
      <h1>{t.name}</h1>
      {t.archived && <p className="alert ok">Dit sjabloon staat in het archief en wordt niet aangeboden bij Nieuwe notitie.</p>}
      <TemplateForm id={t.id} archived={t.archived} initial={{ name: t.name, noteType: t.noteType, description: t.description, parts: t.parts }} />
      <p>
        <Link href={`/templates/new?van=${t.id}`}>Kopiëren als nieuw sjabloon</Link>
      </p>
    </>
  );
}
