"use server";
// Ronde 4 (C2): start, keep up or stop a reading plan. One plan per account (RLS).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localDate } from "@/lib/notes/preekmodus";
import { createClient } from "@/lib/supabase/server";

const done = () => {
  revalidatePath("/leesplan");
  revalidatePath("/dashboard");
};

export async function startPlan(formData: FormData): Promise<void> {
  const key = z.enum(["nt90", "psalmen-spreuken"]).safeParse(formData.get("plan"));
  if (!key.success) return;
  const supabase = await createClient();
  await supabase.rpc("reading_plan_start", { p_plan: key.data, p_today: localDate(new Date()) });
  done();
}

/** "Gelezen": the next portion is done (also when you are catching up). */
export async function markPlanDay(formData: FormData): Promise<void> {
  const day = z.coerce.number().int().min(1).max(400).safeParse(formData.get("day"));
  if (!day.success) return;
  const supabase = await createClient();
  // only moves forward from exactly the day shown, so a double tap counts once
  await supabase.from("reading_plans").update({ days_done: day.data, updated_at: new Date().toISOString() }).eq("days_done", day.data - 1);
  done();
}

export async function stopPlan(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("reading_plan_stop");
  done();
}
