"use client";
/** Ronde 4 (V10): after deleting an account, nothing of it stays in this browser's offline storage. */
import { useEffect } from "react";
import { forgetAccount, wipeAll } from "@/lib/offline/db";

export function WipeLocalData() {
  useEffect(() => {
    void wipeAll()
      .catch(() => undefined)
      .finally(() => forgetAccount());
  }, []);
  return null;
}
