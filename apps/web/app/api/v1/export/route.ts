// GET /api/v1/export — a zip with all of the owner's data (BK-054): JSON + Markdown.
import { authenticated, errorResponse, logError, newRequestId } from "@/lib/api";
import { collectExport, packExport } from "@/lib/export/build";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  try {
    const data = await collectExport(auth.supabase);
    const zip = packExport(data);
    const stamp = data.exportedAt.slice(0, 10);
    // log only counts, never content (spec: monitoring without private text)
    console.info(JSON.stringify({ level: "info", route: "GET /export", requestId, notes: data.notes.length, bytes: zip.byteLength }));
    return new Response(zip as unknown as BodyInit, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="bijbelkompas-export-${stamp}.zip"`,
        "cache-control": "no-store",
        "x-request-id": requestId,
      },
    });
  } catch (err) {
    logError(requestId, "GET /export", err as { code?: string });
    return errorResponse("INTERNAL", "De export is mislukt. Probeer het later opnieuw.", requestId);
  }
}
