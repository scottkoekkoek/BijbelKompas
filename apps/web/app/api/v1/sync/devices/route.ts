// POST /api/v1/sync/devices — register this browser as a device of the signed-in owner.
import { DeviceInput } from "@bk/schemas";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { registerDevice } from "@/lib/sync/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const parsed = DeviceInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("INVALID_INPUT", "Ongeldig apparaat.", requestId);
  try {
    await registerDevice(auth.supabase, parsed.data.deviceId, parsed.data.label);
    const prefs = await auth.supabase.from("user_preferences").select("offline_recent_limit").eq("user_id", auth.user.id).maybeSingle();
    return json({ ok: true, userId: auth.user.id, recentLimit: prefs.data?.offline_recent_limit ?? 30 }, requestId);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "42501") return errorResponse("FORBIDDEN", "Dit apparaat hoort bij een ander account.", requestId);
    logError(requestId, "POST /sync/devices", err as { code?: string });
    return errorResponse("INTERNAL", "Registreren is mislukt.", requestId);
  }
}
