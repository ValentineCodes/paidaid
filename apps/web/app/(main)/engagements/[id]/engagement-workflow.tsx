"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "../../../../lib/supabase/client";
import { DELIVERY_ATTACHMENTS_BUCKET } from "../../../../lib/constants/storage";
import {
  extensionForDeliveryMime,
  validateDeliveryProofFiles,
} from "../../../../lib/delivery/allowed-delivery-attachment";
import type { Database } from "../../../../lib/database.types";

type DeliveryRow = Database["public"]["Tables"]["deliveries"]["Row"];
type DeliveryAttRow =
  Database["public"]["Tables"]["delivery_attachments"]["Row"];
type IssueRow = Database["public"]["Tables"]["engagement_issues"]["Row"];
type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"];

const ISSUE_CATEGORIES: { value: string; label: string }[] = [
  { value: "no_show", label: "Provider no-show" },
  { value: "work_not_done", label: "Work not performed" },
  { value: "incomplete_work", label: "Incomplete work" },
  { value: "delivery_disagreement", label: "Disagreement about delivery" },
  { value: "other", label: "Other" },
];

type Props = {
  engagementId: string;
  conversationId: string | null;
  isProvider: boolean;
  isRequester: boolean;
  engagementStatus: Database["public"]["Enums"]["engagement_status"];
  autoCompleteDeadlineAt: string | null;
  autoCompletedAt: string | null;
  completedAt: string | null;
  delivery: DeliveryRow | null;
  deliveryAttachments: DeliveryAttRow[];
  issues: IssueRow[];
  existingReview: ReviewRow | null;
  hasLivePhoto: boolean;
};

function DeliveryMediaLink({ path, mime }: { path: string; mime: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.storage
      .from(DELIVERY_ATTACHMENTS_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled) {
          setUrl(data?.signedUrl ?? null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, path]);

  if (!url) {
    return <span className="text-stone-500">Loading… ({mime})</span>;
  }
  if (mime.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className="max-h-40 rounded border border-stone-200 dark:border-stone-600"
        />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-sm underline"
    >
      Play video ({mime})
    </a>
  );
}

export function EngagementWorkflow({
  engagementId,
  conversationId,
  isProvider,
  isRequester,
  engagementStatus,
  autoCompleteDeadlineAt,
  autoCompletedAt,
  completedAt,
  delivery,
  deliveryAttachments,
  issues,
  existingReview,
  hasLivePhoto,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [desc, setDesc] = useState(delivery?.description ?? "");
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [postToChat, setPostToChat] = useState(true);

  const [revisionNote, setRevisionNote] = useState("");

  const [issueCategory, setIssueCategory] = useState("other");
  const [issueBody, setIssueBody] = useState("");

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useEffect(() => {
    const ch = supabase
      .channel(`eng-workflow:${engagementId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deliveries",
          filter: `engagement_id=eq.${engagementId}`,
        },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "engagements",
          filter: `id=eq.${engagementId}`,
        },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "engagement_issues",
          filter: `engagement_id=eq.${engagementId}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, engagementId, refresh]);

  async function runSubmitDelivery() {
    if (!hasLivePhoto) {
      setError("Live profile photo is required.");
      return;
    }
    if (!desc.trim()) {
      setError("Describe what you completed.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data: rows, error: rpcErr } = await supabase.rpc(
      "submit_delivery",
      {
        p_engagement_id: engagementId,
        p_description: desc.trim(),
        p_post_to_chat: postToChat && conversationId !== null,
      },
    );
    if (rpcErr || !rows?.length) {
      setError(rpcErr?.message ?? "Could not submit delivery");
      setBusy(false);
      return;
    }
    const row = rows[0] as {
      delivery_id: string;
      chat_message_id: string | null;
    };
    const deliveryId = row.delivery_id;

    if (proofFiles.length > 0) {
      const val = validateDeliveryProofFiles(proofFiles);
      if (!val.ok) {
        setError(val.error);
        setBusy(false);
        return;
      }
      const paths: string[] = [];
      const mimes: string[] = [];
      const sizes: number[] = [];
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Not signed in");
        setBusy(false);
        return;
      }
      for (const f of proofFiles) {
        const ext = extensionForDeliveryMime(f.type);
        const path = `${user.id}/${engagementId}/${deliveryId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(DELIVERY_ATTACHMENTS_BUCKET)
          .upload(path, f, { contentType: f.type, upsert: false });
        if (upErr) {
          setError(`Upload failed: ${upErr.message}`);
          setBusy(false);
          return;
        }
        paths.push(path);
        mimes.push(f.type);
        sizes.push(f.size);
      }
      const { error: addErr } = await supabase.rpc("add_delivery_attachments", {
        p_delivery_id: deliveryId,
        p_paths: paths,
        p_mime_types: mimes,
        p_byte_sizes: sizes,
      });
      if (addErr) {
        setError(`Delivery saved but proof upload failed: ${addErr.message}`);
        setBusy(false);
        refresh();
        return;
      }
    }
    setProofFiles([]);
    setBusy(false);
    refresh();
  }

  async function runReview(action: "approve" | "revision") {
    setBusy(true);
    setError(null);
    const { error: rpcErr } = await supabase.rpc("review_delivery", {
      p_engagement_id: engagementId,
      p_action: action,
      p_revision_note:
        action === "revision" ? revisionNote.trim() || undefined : undefined,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      setBusy(false);
      return;
    }
    setRevisionNote("");
    setBusy(false);
    refresh();
  }

  async function runReportIssue() {
    if (!issueBody.trim()) {
      setError("Describe the issue.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: rpcErr } = await supabase.rpc("report_engagement_issue", {
      p_engagement_id: engagementId,
      p_category: issueCategory,
      p_body: issueBody.trim(),
    });
    if (rpcErr) {
      setError(rpcErr.message);
      setBusy(false);
      return;
    }
    setIssueBody("");
    setBusy(false);
    refresh();
  }

  async function runResolveIssue(issueId: string) {
    setBusy(true);
    setError(null);
    const { error: rpcErr } = await supabase.rpc("resolve_engagement_issue", {
      p_issue_id: issueId,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      setBusy(false);
      return;
    }
    setBusy(false);
    refresh();
  }

  async function runSubmitReview() {
    setBusy(true);
    setError(null);
    const { error: rpcErr } = await supabase.rpc("submit_review", {
      p_engagement_id: engagementId,
      p_rating: rating,
      p_comment: comment.trim() || undefined,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      setBusy(false);
      return;
    }
    setBusy(false);
    refresh();
  }

  const openIssues = issues.filter((i) => i.status === "open");
  const deliveryStatus = delivery?.status ?? null;

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
        <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
          Completion &amp; delivery
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Budgets are indicative only — there is no payment settlement in V1.
        </p>

        {engagementStatus === "active" && deliveryStatus && (
          <div className="mt-3 space-y-1 text-sm">
            <p>
              <span className="text-stone-500">Delivery status:</span>{" "}
              <span className="font-medium capitalize">
                {deliveryStatus.replace(/_/g, " ")}
              </span>
            </p>
            {delivery?.submitted_at && (
              <p className="text-stone-600 dark:text-stone-400">
                Submitted: {new Date(delivery.submitted_at).toLocaleString()}
              </p>
            )}
            {autoCompleteDeadlineAt &&
              deliveryStatus === "pending_review" &&
              openIssues.length === 0 && (
                <p className="text-amber-800 dark:text-amber-200">
                  Auto-completes if not approved by{" "}
                  {new Date(autoCompleteDeadlineAt).toLocaleString()} (unless an
                  open issue blocks it).
                </p>
              )}
            {openIssues.length > 0 && deliveryStatus === "pending_review" && (
              <p className="text-amber-800 dark:text-amber-200">
                Auto-completion is paused while {openIssues.length} issue(s) are
                open.
              </p>
            )}
          </div>
        )}

        {engagementStatus === "completed" && (
          <div className="mt-3 text-sm text-stone-600 dark:text-stone-400">
            <p>
              Engagement completed
              {autoCompletedAt
                ? " automatically (72h)"
                : completedAt
                  ? " after approval"
                  : ""}
              .
            </p>
            {completedAt && <p>{new Date(completedAt).toLocaleString()}</p>}
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>
        )}
      </section>

      {/* Provider: submit / resubmit */}
      {isProvider && engagementStatus === "active" && (
        <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            I&apos;m done — submit delivery
          </h2>
          {!hasLivePhoto && (
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
              Add a live profile photo under Account before submitting.
            </p>
          )}
          {(deliveryStatus === null ||
            deliveryStatus === "revision_requested") && (
            <div className="mt-4 flex flex-col gap-3">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                What did you complete?
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                  placeholder="Describe the work completed…"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={postToChat}
                  onChange={(e) => setPostToChat(e.target.checked)}
                  disabled={!conversationId}
                />
                Also post summary to chat
                {!conversationId && (
                  <span className="text-stone-500">(no conversation)</span>
                )}
              </label>
              <div>
                <p className="text-sm font-medium text-stone-700 dark:text-stone-300">
                  Proof (optional)
                </p>
                <p className="text-xs text-stone-500">
                  Images or video — max 10 files, 25 MB each.
                </p>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                  className="mt-1 max-w-full text-sm"
                  onChange={(e) => {
                    const list = e.target.files ? [...e.target.files] : [];
                    setProofFiles(list.slice(0, 10));
                  }}
                />
              </div>
              <button
                type="button"
                disabled={busy || !hasLivePhoto}
                onClick={() => void runSubmitDelivery()}
                className="w-fit rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
              >
                {busy ? "Submitting…" : "Submit for review"}
              </button>
            </div>
          )}
          {deliveryStatus === "pending_review" && (
            <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
              Waiting for the requester to approve or request changes.
            </p>
          )}
        </section>
      )}

      {/* Requester: review */}
      {isRequester &&
        engagementStatus === "active" &&
        deliveryStatus === "pending_review" && (
          <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
            <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
              Review delivery
            </h2>
            {delivery && (
              <div className="mt-3 rounded-lg bg-stone-50 p-3 text-sm dark:bg-stone-900/60">
                <p className="whitespace-pre-wrap">{delivery.description}</p>
                {deliveryAttachments.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {deliveryAttachments.map((a) => (
                      <li key={a.id}>
                        <DeliveryMediaLink
                          path={a.storage_path}
                          mime={a.mime_type}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void runReview("approve")}
                className="rounded-lg bg-green-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-green-700"
              >
                Approve &amp; complete
              </button>
            </div>
            <div className="mt-4">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                Request changes (optional path)
                <textarea
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="What should be redone or clarified?"
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
                />
              </label>
              <button
                type="button"
                disabled={busy || !revisionNote.trim()}
                onClick={() => void runReview("revision")}
                className="mt-2 rounded-lg border border-stone-400 px-4 py-2 text-sm dark:border-stone-600"
              >
                Request revision
              </button>
            </div>
          </section>
        )}

      {/* Show delivery copy to provider when pending or revision */}
      {isProvider &&
        engagementStatus === "active" &&
        delivery &&
        deliveryStatus === "pending_review" && (
          <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
            <h2 className="text-sm font-medium text-stone-900 dark:text-stone-100">
              Your submission
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">
              {delivery.description}
            </p>
            {deliveryAttachments.length > 0 && (
              <ul className="mt-3 space-y-2">
                {deliveryAttachments.map((a) => (
                  <li key={a.id}>
                    <DeliveryMediaLink
                      path={a.storage_path}
                      mime={a.mime_type}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

      {/* Issues */}
      {engagementStatus === "active" && (
        <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            Report an issue
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            There is no cancel button in V1 — use issues for problems with this
            engagement. Open issues pause automatic completion.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <select
              value={issueCategory}
              onChange={(e) => setIssueCategory(e.target.value)}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
            >
              {ISSUE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <textarea
              value={issueBody}
              onChange={(e) => setIssueBody(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Describe what went wrong…"
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
            />
            <button
              type="button"
              disabled={busy || !issueBody.trim()}
              onClick={() => void runReportIssue()}
              className="w-fit rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
            >
              Submit issue
            </button>
          </div>

          {issues.length > 0 && (
            <ul className="mt-6 space-y-3 border-t border-stone-200 pt-4 dark:border-stone-700">
              {issues.map((iss) => (
                <li
                  key={iss.id}
                  className="rounded border border-stone-200 px-3 py-2 text-sm dark:border-stone-700"
                >
                  <p className="font-medium capitalize">
                    {iss.category.replace(/_/g, " ")} · {iss.status}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-stone-700 dark:text-stone-300">
                    {iss.body}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {new Date(iss.created_at).toLocaleString()}
                    {iss.resolved_at
                      ? ` · Resolved ${new Date(iss.resolved_at).toLocaleString()}`
                      : ""}
                  </p>
                  {iss.status === "open" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runResolveIssue(iss.id)}
                      className="mt-2 text-sm underline"
                    >
                      Mark resolved
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Review after complete */}
      {engagementStatus === "completed" && isRequester && !existingReview && (
        <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            Rate the provider
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            <label className="text-sm">
              Rating (1–5)
              <input
                type="number"
                min={1}
                max={5}
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="ml-2 w-16 rounded border border-stone-300 px-2 py-1 dark:border-stone-600"
              />
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Optional comment…"
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950"
            />
            <button
              type="button"
              disabled={busy || rating < 1 || rating > 5}
              onClick={() => void runSubmitReview()}
              className="w-fit rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
            >
              Submit review
            </button>
          </div>
        </section>
      )}

      {existingReview && (
        <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            Review
          </h2>
          <p className="mt-2 text-sm">
            {existingReview.rating}★
            {existingReview.comment && (
              <span className="mt-1 block whitespace-pre-wrap text-stone-700 dark:text-stone-300">
                {existingReview.comment}
              </span>
            )}
          </p>
        </section>
      )}
    </div>
  );
}
