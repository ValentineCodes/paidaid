"use client";

import { useState } from "react";

import { createClient } from "../../../lib/supabase/client";

type Props = {
  initialPhone: string | null;
};

/** Optional phone for call links in conversations — only visible to chat partners. */
export function PrivateContactForm({ initialPhone }: Props) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "err">(
    "idle",
  );
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setMsg(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus("err");
      setMsg("Not signed in");
      return;
    }
    const trimmed = phone.trim();
    const payload =
      trimmed === ""
        ? { user_id: user.id, phone: null as string | null }
        : { user_id: user.id, phone: trimmed };
    const { error } = await supabase
      .from("profile_private_contact")
      .upsert(payload, { onConflict: "user_id" });
    if (error) {
      setStatus("err");
      setMsg(error.message);
      return;
    }
    setStatus("ok");
    setMsg("Saved.");
  }

  return (
    <form
      onSubmit={(e) => void save(e)}
      className="flex max-w-lg flex-col gap-3"
    >
      <div>
        <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
          Contact (private)
        </h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Optional phone number. Only visible to people you are messaging in a
          request or engagement chat — not on public listings.
        </p>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
          Phone
        </span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 …"
          autoComplete="tel"
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
        />
      </label>
      {msg && (
        <p
          className={
            status === "err"
              ? "text-sm text-red-700 dark:text-red-300"
              : "text-sm text-emerald-800 dark:text-emerald-200"
          }
        >
          {msg}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "saving"}
        className="w-fit rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900"
      >
        {status === "saving" ? "Saving…" : "Save contact"}
      </button>
    </form>
  );
}
