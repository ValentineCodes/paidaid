"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FigmaIcon } from "../../../../components/figma-icons";
import { createClient } from "../../../../lib/supabase/client";
import { NearSessionProvider } from "../../../../wallet/near-session-provider";
import { useNearWalletAccountId } from "../../../../wallet/use-near-wallet-account";
import { usePaidAidNearWallet } from "../../../../wallet/paidaid-near-wallet-context";
import { useOpenNearWalletConnect } from "../../../../wallet/use-open-near-wallet-connect";
import { formatWalletConnectionError } from "../../../../wallet/errors";
import {
  loadEngagementSettlementView,
  releaseEscrowForEngagement,
} from "../../../../lib/engagement/release-escrow-client";
import {
  CONVERSATION_ATTACHMENTS_BUCKET,
  DELIVERY_ATTACHMENTS_BUCKET,
} from "../../../../lib/constants/storage";
import { extensionForAttachmentMime } from "../../../../lib/chat/allowed-attachment";
import {
  MAX_DELIVERY_ATTACHMENTS,
  extensionForDeliveryMime,
  validateDeliveryProofFiles,
} from "../../../../lib/delivery/allowed-delivery-attachment";
import type { Database } from "../../../../lib/database.types";

type DeliveryRow = Database["public"]["Tables"]["deliveries"]["Row"];
type DeliveryAttRow =
  Database["public"]["Tables"]["delivery_attachments"]["Row"];
type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"];

type Props = {
  engagementId: string;
  conversationId: string | null;
  isProvider: boolean;
  isRequester: boolean;
  engagementStatus: Database["public"]["Enums"]["engagement_status"];
  delivery: DeliveryRow | null;
  deliveryAttachments: DeliveryAttRow[];
  existingReview: ReviewRow | null;
  paymentFunded: boolean;
  linkedRequesterNearAccountId: string | null;
};

function ProofFileTile({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = file.type.startsWith("image/");

  useEffect(() => {
    if (!isImage) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <li className="engagement-proof-tile" title={file.name}>
      <button
        type="button"
        className="engagement-proof-tile__remove"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
      >
        <FigmaIcon name="close" size={12} />
      </button>
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob preview
        <img src={previewUrl} alt="" />
      ) : (
        <span className="engagement-proof-tile__video" aria-hidden>
          <FigmaIcon name="camera" size={22} />
        </span>
      )}
    </li>
  );
}

function DeliveryAttachmentTile({ path, mime }: { path: string; mime: string }) {
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

  return (
    <li className="engagement-proof-tile">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="engagement-proof-tile__link"
          aria-label={mime.startsWith("image/") ? "View image proof" : "Open video proof"}
        >
          {mime.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" />
          ) : (
            <span className="engagement-proof-tile__video" aria-hidden>
              <FigmaIcon name="camera" size={22} />
            </span>
          )}
        </a>
      ) : (
        <span className="engagement-proof-tile__video" aria-hidden>
          <FigmaIcon name="camera" size={22} />
        </span>
      )}
    </li>
  );
}

const STAR_RATING_LABELS = [
  "Poor",
  "Fair",
  "Good",
  "Great",
  "Excellent",
] as const;

function EngagementStarRating({
  value,
  onChange,
  disabled,
  readOnly,
}: {
  value: number;
  onChange?: (rating: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const stars = (
    <>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        const starClass = on
          ? "engagement-star-rating__star engagement-star-rating__star--on"
          : "engagement-star-rating__star";
        if (readOnly) {
          return (
            <span
              key={n}
              className={starClass}
              aria-hidden={!on}
            >
              <FigmaIcon name="star" size={20} />
            </span>
          );
        }
        return (
          <button
            key={n}
            type="button"
            className={starClass}
            disabled={disabled}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            aria-pressed={value === n}
            onClick={() => onChange?.(n)}
          >
            <FigmaIcon name="star" size={20} />
          </button>
        );
      })}
    </>
  );

  return (
    <div
      className={
        readOnly
          ? "engagement-star-rating engagement-star-rating--readonly"
          : "engagement-star-rating"
      }
    >
      <div
        className="engagement-star-rating__row"
        role={readOnly ? "img" : "group"}
        aria-label={
          readOnly ? `${value} out of 5 stars` : "Rate from 1 to 5 stars"
        }
      >
        {stars}
      </div>
      {!readOnly ? (
        <p className="engagement-star-rating__hint" aria-live="polite">
          {STAR_RATING_LABELS[value - 1] ?? "—"}
        </p>
      ) : null}
    </div>
  );
}

function EngagementWorkflowInner({
  engagementId,
  conversationId,
  isProvider,
  isRequester,
  engagementStatus,
  delivery,
  deliveryAttachments,
  existingReview,
  paymentFunded,
  linkedRequesterNearAccountId,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { getTransactionSigner, getSessionAccountId } = usePaidAidNearWallet();
  const openConnect = useOpenNearWalletConnect();
  const { accountId: signedAccountId, syncFromSelectorStore } =
    useNearWalletAccountId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [approveStep, setApproveStep] = useState<string | null>(null);
  const [postReleaseLoading, setPostReleaseLoading] = useState(false);

  const walletMatchesLink =
    !linkedRequesterNearAccountId ||
    !signedAccountId ||
    signedAccountId.toLowerCase() ===
      linkedRequesterNearAccountId.toLowerCase();

  const [desc, setDesc] = useState(delivery?.description ?? "");
  const [proofFiles, setProofFiles] = useState<File[]>([]);

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (postReleaseLoading && engagementStatus === "completed") {
      setPostReleaseLoading(false);
    }
  }, [postReleaseLoading, engagementStatus]);

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
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [supabase, engagementId, refresh]);

  async function runSubmitDelivery() {
    setBusy(true);
    setError(null);
    const { data: rows, error: rpcErr } = await supabase.rpc(
      "submit_delivery",
      {
        p_engagement_id: engagementId,
        p_description: desc.trim(),
        p_post_to_chat: false,
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

    if (conversationId) {
      const caption = desc.trim();
      const shouldPostChat =
        proofFiles.length > 0 || caption.length > 0;
      if (!shouldPostChat) {
        setProofFiles([]);
        setBusy(false);
        refresh();
        return;
      }
      const chatBody = caption;
      const {
        data: { user: chatUser },
      } = await supabase.auth.getUser();
      if (!chatUser) {
        setError("Not signed in");
        setBusy(false);
        return;
      }
      const { data: mid, error: msgErr } = await supabase.rpc("send_message", {
        p_conversation_id: conversationId,
        p_kind: "text",
        p_body: chatBody,
      });
      if (msgErr || !mid) {
        setError(
          msgErr?.message ??
            "Delivery saved but could not be posted to chat.",
        );
        setBusy(false);
        refresh();
        return;
      }
      if (proofFiles.length > 0) {
        const chatPaths: string[] = [];
        const chatMimes: string[] = [];
        const chatSizes: number[] = [];
        for (const f of proofFiles) {
          const ext = extensionForAttachmentMime(f.type);
          const path = `${chatUser.id}/${conversationId}/${mid}/${crypto.randomUUID()}.${ext}`;
          const { error: chatUpErr } = await supabase.storage
            .from(CONVERSATION_ATTACHMENTS_BUCKET)
            .upload(path, f, { contentType: f.type, upsert: false });
          if (chatUpErr) {
            setError(
              `Delivery saved but chat upload failed: ${chatUpErr.message}`,
            );
            setBusy(false);
            refresh();
            return;
          }
          chatPaths.push(path);
          chatMimes.push(f.type);
          chatSizes.push(f.size);
        }
        const { error: chatAttachErr } = await supabase.rpc(
          "add_message_attachments",
          {
            p_message_id: mid as string,
            p_paths: chatPaths,
            p_mime_types: chatMimes,
            p_byte_sizes: chatSizes,
          },
        );
        if (chatAttachErr) {
          setError(
            `Delivery saved but chat attachments failed: ${chatAttachErr.message}`,
          );
          setBusy(false);
          refresh();
          return;
        }
      }
    }

    setProofFiles([]);
    setBusy(false);
    refresh();
  }

  const connectWallet = useCallback(async () => {
    setError(null);
    await openConnect();
    await syncFromSelectorStore();
  }, [openConnect, syncFromSelectorStore]);

  async function runApproveAndRelease() {
    if (!paymentFunded) {
      setError("Fund escrow before approving delivery.");
      return;
    }
    setBusy(true);
    setError(null);
    setApproveStep(null);
    try {
      let activeAccountId = signedAccountId;

      if (!activeAccountId) {
        setApproveStep("Connect your linked NEAR wallet to approve and pay.");
        await connectWallet();
        activeAccountId = getSessionAccountId();
      }
      if (
        !activeAccountId ||
        (linkedRequesterNearAccountId &&
          activeAccountId.toLowerCase() !==
            linkedRequesterNearAccountId.toLowerCase())
      ) {
        throw new Error(
          `Connected wallet must be ${linkedRequesterNearAccountId}.`,
        );
      }

      setApproveStep("Recording approval…");
      const { error: rpcErr } = await supabase.rpc("review_delivery", {
        p_engagement_id: engagementId,
        p_action: "approve",
      });
      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      setApproveStep(
        "Releasing payment — confirm in your wallet, then we verify on-chain…",
      );
      const signer = await getTransactionSigner();
      const loaded = await loadEngagementSettlementView(engagementId);
      if (!loaded.ok) {
        throw new Error(loaded.error);
      }
      const settlement = loaded.settlement;
      const released = await releaseEscrowForEngagement(
        engagementId,
        signer,
        settlement,
        { requesterNearAccountId: linkedRequesterNearAccountId },
      );
      if (!released.ok) {
        throw new Error(released.error);
      }

      setApproveStep("Finishing up — your rating form will appear shortly…");
      setPostReleaseLoading(true);
      refresh();
    } catch (e) {
      setPostReleaseLoading(false);
      setError(e instanceof Error ? e.message : "Approval failed.");
    } finally {
      setBusy(false);
      setApproveStep(null);
    }
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

  const deliveryStatus = delivery?.status ?? null;
  const deliveryHasVisibleContent =
    Boolean(delivery?.description?.trim()) || deliveryAttachments.length > 0;

  const showDeliveryForm =
    deliveryStatus === null || deliveryStatus === "revision_requested";

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p className="engagement-workflow-error" role="alert">
          {error}
        </p>
      ) : null}

      {/* Provider: submit / resubmit */}
      {isProvider && engagementStatus === "active" && (
        <section className="engagement-delivery-card">
          {showDeliveryForm ? (
            <>
              <p className="engagement-delivery-card__eyebrow">Your delivery</p>
              <h3>
                {deliveryStatus === "revision_requested"
                  ? "Submit your revision"
                  : "Mark work complete"}
              </h3>
              <p className="engagement-delivery-card__lead">
                {deliveryStatus === "revision_requested"
                  ? "The requester asked for changes. Update your notes or proof, then send again."
                  : "Proofs are optional and appear in chat."}
              </p>
              {deliveryStatus === "revision_requested" ? (
                <div
                  className="engagement-callout engagement-callout--warning"
                  role="note"
                >
                  <strong>Revision requested</strong>
                  <p>Your last submission needs updates before approval.</p>
                </div>
              ) : null}
              <div className="form-fields">
                <label htmlFor="delivery_notes">
                  Caption
                  <textarea
                    id="delivery_notes"
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    rows={4}
                    maxLength={4000}
                    placeholder="Describe what you completed — shown in chat with your files…"
                  />
                </label>
                <div className="engagement-delivery-proof">
                  <p className="engagement-delivery-proof__hint">
                    Photos or video — up to 10 files, 25 MB each. Shown in chat
                    under your caption.
                  </p>
                  <label className="engagement-file-picker">
                    <FigmaIcon name="attach" size={18} />
                    {proofFiles.length > 0
                      ? `${proofFiles.length} file${proofFiles.length === 1 ? "" : "s"} selected`
                      : "Add files"}
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                      onChange={(e) => {
                        const list = e.target.files ? [...e.target.files] : [];
                        setProofFiles((prev) =>
                          [...prev, ...list].slice(0, MAX_DELIVERY_ATTACHMENTS),
                        );
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {proofFiles.length > 0 ? (
                    <ul className="engagement-proof-grid">
                      {proofFiles.map((f, index) => (
                        <ProofFileTile
                          key={`${f.name}-${f.size}-${f.lastModified}-${index}`}
                          file={f}
                          onRemove={() =>
                            setProofFiles((prev) =>
                              prev.filter((_, i) => i !== index),
                            )
                          }
                        />
                      ))}
                    </ul>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runSubmitDelivery()}
                  className="primary-wide"
                >
                  {busy ? "Submitting…" : "Submit for review"}
                  {!busy ? <FigmaIcon name="checks" size={17} /> : null}
                </button>
              </div>
            </>
          ) : null}
          {deliveryStatus === "pending_review" ? (
            <>
              <div
                className="engagement-callout engagement-callout--info"
                role="status"
              >
                <strong>Under review</strong>
                <p>Waiting for the requester to approve your submission.</p>
              </div>
              {delivery && deliveryHasVisibleContent ? (
                <div className="engagement-submission-preview">
                  <p className="engagement-delivery-card__eyebrow">
                    Your submission
                  </p>
                  {delivery.description?.trim() ? (
                    <p className="engagement-submission-preview__notes">
                      {delivery.description}
                    </p>
                  ) : null}
                  {deliveryAttachments.length > 0 ? (
                    <ul className="engagement-proof-grid">
                      {deliveryAttachments.map((a) => (
                        <DeliveryAttachmentTile
                          key={a.id}
                          path={a.storage_path}
                          mime={a.mime_type}
                        />
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
          {deliveryStatus === "approved" && engagementStatus === "active" ? (
            postReleaseLoading ? (
              <p className="engagement-delivery-status flex items-center gap-2.5">
                <span
                  className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--deep)]"
                  aria-hidden
                />
                Verifying release and preparing your review…
              </p>
            ) : (
              <p className="engagement-delivery-status">
                Delivery approved — awaiting on-chain payment release to complete
                the engagement.
              </p>
            )
          ) : null}
        </section>
      )}

      {isRequester && postReleaseLoading && engagementStatus !== "completed" && (
        <section className="engagement-approve-actions" aria-busy="true">
          <p className="engagement-delivery-status flex items-center gap-2.5">
            <span
              className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--deep)]"
              aria-hidden
            />
            {approveStep ?? "Verifying release and preparing your review…"}
          </p>
        </section>
      )}

      {isRequester &&
        paymentFunded &&
        engagementStatus === "active" &&
        deliveryStatus === "pending_review" &&
        !postReleaseLoading && (
          <section className="engagement-approve-actions">
            {approveStep ? (
              <p className="engagement-delivery-status flex items-center gap-2.5">
                {busy ? (
                  <span
                    className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--deep)]"
                    aria-hidden
                  />
                ) : null}
                {approveStep}
              </p>
            ) : null}
            {!signedAccountId ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void connectWallet().catch((e) =>
                    setError(formatWalletConnectionError(e)),
                  )
                }
                className="secondary w-fit"
              >
                Connect
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void runApproveAndRelease()}
              className="primary-wide"
            >
              {busy ? (
                <>
                  <span
                    className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-current"
                    aria-hidden
                  />
                  Working…
                </>
              ) : (
                <>
                  Approve and release payment
                  <FigmaIcon name="arrow" size={17} />
                </>
              )}
            </button>
          </section>
        )}

      {/* Review after complete */}
      {engagementStatus === "completed" && isRequester && !existingReview && (
        <section className="engagement-delivery-card engagement-review-card">
          <p className="engagement-delivery-card__eyebrow">Feedback</p>
          <h3>Rate your provider</h3>
          <p className="engagement-delivery-card__lead">
            How did the work go? Your rating helps others choose with confidence.
          </p>
          <EngagementStarRating
            value={rating}
            onChange={setRating}
            disabled={busy}
          />
          <div className="form-fields engagement-review-card__form">
            <label htmlFor="review_comment">
              Comment
              <textarea
                id="review_comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="What stood out? Optional."
                disabled={busy}
              />
            </label>
            <button
              type="button"
              disabled={busy || rating < 1 || rating > 5}
              onClick={() => void runSubmitReview()}
              className="primary-wide"
            >
              {busy ? "Submitting…" : "Submit review"}
              {!busy ? <FigmaIcon name="star" size={17} /> : null}
            </button>
          </div>
        </section>
      )}

      {existingReview ? (
        <section className="engagement-delivery-card engagement-review-card engagement-review-card--submitted">
          <p className="engagement-delivery-card__eyebrow">Your review</p>
          <h3>Thanks for the feedback</h3>
          <EngagementStarRating
            value={existingReview.rating}
            readOnly
          />
          {existingReview.comment?.trim() ? (
            <p className="engagement-review-card__comment">
              {existingReview.comment}
            </p>
          ) : (
            <p className="engagement-review-card__meta">No written comment.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

export function EngagementWorkflow(props: Props) {
  return (
    <NearSessionProvider>
      <EngagementWorkflowInner {...props} />
    </NearSessionProvider>
  );
}
