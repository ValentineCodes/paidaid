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
    <div>
      <span className="text-[9px] font-bold tracking-[1.2px] text-[var(--muted)]">
        CONTACT
      </span>
      <h3 className="mt-1 font-['Manrope'] text-lg font-semibold text-[var(--ink)]">
        Private phone
      </h3>
      <p className="mb-4 text-[12px] leading-relaxed text-[var(--muted)]">
        Optional — only visible to people you message in a task conversation.
      </p>
      <form onSubmit={(e) => void save(e)} className="form-fields">
        <label>
          Phone
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 …"
            autoComplete="tel"
          />
        </label>
        {msg ? (
          <p
            className={
              status === "err"
                ? "text-[12px] text-red-700"
                : "text-[12px] text-emerald-800"
            }
          >
            {msg}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={status === "saving"}
          className="primary !w-fit"
        >
          {status === "saving" ? "Saving…" : "Save contact"}
        </button>
      </form>
    </div>
  );
}
