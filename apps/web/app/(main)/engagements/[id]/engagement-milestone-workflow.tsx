"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import { AppToast } from "../../../../components/app-toast";
import { DeliveryProofGrid, ProofFileTile } from "../../../../components/engagement/delivery-proof";
import { FigmaIcon } from "../../../../components/figma-icons";
import {
  MilestoneEngagementTimeline,
  type EngagementMilestoneStep,
} from "../../../../components/milestones/milestone-engagement-timeline";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { DELIVERY_ATTACHMENTS_BUCKET } from "../../../../lib/constants/storage";
import {
  extensionForDeliveryMime,
  MAX_DELIVERY_ATTACHMENTS,
  validateDeliveryProofFiles,
} from "../../../../lib/delivery/allowed-delivery-attachment";
import { postMilestoneDeliveryToChat } from "../../../../lib/engagement/post-milestone-chat";
import { createClient } from "../../../../lib/supabase/client";
import {
  reviewMilestoneDelivery,
  type MilestoneActionState,
} from "../milestone-workflow-actions";
import { NearSessionProvider } from "../../../../wallet/near-session-provider";
import { useNearWalletAccountId } from "../../../../wallet/use-near-wallet-account";
import { usePaidAidNearWallet } from "../../../../wallet/paidaid-near-wallet-context";
import {
  formatNearTransactionError,
  isUserRejectedTransaction,
} from "../../../../wallet/near-transaction-errors";
import {
  loadMilestoneReleaseContext,
  releaseMilestoneForEngagement,
} from "../../../../lib/engagement/release-milestone-client";

const reviewInitial: MilestoneActionState = { error: null };

type MilestoneDeliveryPreview = {
  deliveryId: string;
  description: string;
  attachments: {
    id: string;
    storage_path: string;
    mime_type: string;
  }[];
};

type MilestoneRow = EngagementMilestoneStep & {
  latestDelivery: MilestoneDeliveryPreview | null;
};

type Props = {
  engagementId: string;
  conversationId: string | null;
  assetSymbol: string;
  assetDecimals: number;
  milestones: MilestoneRow[];
  isProvider: boolean;
  isRequester: boolean;
  paymentFunded: boolean;
  milestoneReleaseQueue: {
    onChainMilestonesReleased: number;
    nextReleasePosition: number;
    releasableMilestoneId: string | null;
  } | null;
};

export function EngagementMilestoneWorkflow(props: Props) {
  return (
    <NearSessionProvider>
      <EngagementMilestoneWorkflowInner {...props} />
    </NearSessionProvider>
  );
}

function EngagementMilestoneWorkflowInner({
  engagementId,
  conversationId,
  assetSymbol,
  assetDecimals,
  milestones,
  isProvider,
  isRequester,
  paymentFunded,
  milestoneReleaseQueue,
}: Props) {
  const router = useRouter();
  const { getTransactionSigner } = usePaidAidNearWallet();
  const walletAccountId = useNearWalletAccountId();

  const [submitTarget, setSubmitTarget] = useState<MilestoneRow | null>(null);
  const [reviewTarget, setReviewTarget] = useState<MilestoneRow | null>(null);
  const [releaseBusyId, setReleaseBusyId] = useState<string | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [errorToastOpen, setErrorToastOpen] = useState(false);
  const [errorToastMessage, setErrorToastMessage] = useState("");

  const [reviewState, reviewAction, reviewPending] = useActionState(
    reviewMilestoneDelivery,
    reviewInitial,
  );

  useEffect(() => {
    if (reviewState.success) {
      setReviewTarget(null);
      router.refresh();
    }
  }, [reviewState.success, router]);

  async function onReleaseClick(milestoneId: string) {
    setReleaseError(null);
    if (!walletAccountId) {
      setReleaseError("Link your NEAR wallet to release payment.");
      return;
    }
    setReleaseBusyId(milestoneId);
    try {
      const ctx = await loadMilestoneReleaseContext(milestoneId);
      if (!ctx.ok) {
        setReleaseError(ctx.error);
        return;
      }
      const signer = await getTransactionSigner();
      const released = await releaseMilestoneForEngagement(
        milestoneId,
        signer,
        ctx.context,
      );
      if (!released.ok) {
        setReleaseError(released.error);
        return;
      }
      router.refresh();
    } catch (e) {
      const message = formatNearTransactionError(e);
      if (isUserRejectedTransaction(e)) {
        setReleaseError(null);
        setErrorToastMessage(message);
        setErrorToastOpen(true);
      } else {
        setReleaseError(message);
      }
    } finally {
      setReleaseBusyId(null);
    }
  }

  return (
    <section className="detail-section" aria-label="Milestones">
      <AppToast
        message={errorToastMessage}
        visible={errorToastOpen}
        onClose={() => setErrorToastOpen(false)}
        variant="error"
      />
      <MilestoneEngagementTimeline
        milestones={milestones}
        assetSymbol={assetSymbol}
        assetDecimals={assetDecimals}
        isProvider={isProvider}
        isRequester={isRequester}
        paymentFunded={paymentFunded}
        onSubmitClick={(m) =>
          setSubmitTarget(milestones.find((x) => x.id === m.id) ?? null)
        }
        onReviewClick={(m) =>
          setReviewTarget(milestones.find((x) => x.id === m.id) ?? null)
        }
        onReleaseClick={(id) => void onReleaseClick(id)}
        releaseBusyId={releaseBusyId}
        releasableMilestoneId={milestoneReleaseQueue?.releasableMilestoneId ?? null}
        nextReleasePosition={milestoneReleaseQueue?.nextReleasePosition ?? 1}
      />
      {releaseError ? (
        <p className="engagement-workflow-error mt-3" role="alert">
          {releaseError}
        </p>
      ) : null}

      <MilestoneSubmitDialog
        open={submitTarget != null}
        milestone={submitTarget}
        engagementId={engagementId}
        conversationId={conversationId}
        onClose={() => setSubmitTarget(null)}
        onSuccess={() => {
          setSubmitTarget(null);
          router.refresh();
        }}
      />

      <MilestoneReviewDialog
        open={reviewTarget != null}
        milestone={reviewTarget}
        engagementId={engagementId}
        reviewAction={reviewAction}
        reviewError={reviewState.error}
        reviewPending={reviewPending}
        onClose={() => setReviewTarget(null)}
      />
    </section>
  );
}

function MilestoneSubmitDialog({
  open,
  milestone,
  engagementId,
  conversationId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  milestone: MilestoneRow | null;
  engagementId: string;
  conversationId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [desc, setDesc] = useState("");
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDesc("");
      setProofFiles([]);
      setError(null);
      setBusy(false);
    }
  }, [open, milestone?.id]);

  if (!milestone) {
    return null;
  }

  async function submit() {
    if (!milestone) {
      return;
    }
  const m = milestone;
    setError(null);
    const trimmed = desc.trim();
    if (!trimmed && proofFiles.length === 0) {
      setError("Add a message and/or at least one file.");
      return;
    }
    const val = proofFiles.length
      ? validateDeliveryProofFiles(proofFiles)
      : { ok: true as const };
    if (!val.ok) {
      setError(val.error);
      return;
    }

    setBusy(true);
    try {
      const { data: deliveryId, error: rpcErr } = await supabase.rpc(
        "submit_milestone_delivery",
        {
          p_milestone_id: m.id,
          p_description: trimmed,
        },
      );
      if (rpcErr || !deliveryId) {
        setError(rpcErr?.message ?? "Could not submit milestone");
        return;
      }

      if (proofFiles.length > 0) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setError("Not signed in");
          return;
        }
        const paths: string[] = [];
        const mimes: string[] = [];
        const sizes: number[] = [];
        for (const f of proofFiles) {
          const ext = extensionForDeliveryMime(f.type);
          const path = `${user.id}/${engagementId}/${deliveryId}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from(DELIVERY_ATTACHMENTS_BUCKET)
            .upload(path, f, { contentType: f.type, upsert: false });
          if (upErr) {
            setError(`Upload failed: ${upErr.message}`);
            return;
          }
          paths.push(path);
          mimes.push(f.type);
          sizes.push(f.size);
        }
        const { error: addErr } = await supabase.rpc(
          "add_milestone_delivery_attachments",
          {
            p_milestone_delivery_id: deliveryId,
            p_paths: paths,
            p_mime_types: mimes,
            p_byte_sizes: sizes,
          },
        );
        if (addErr) {
          setError(`Saved but proof upload failed: ${addErr.message}`);
          onSuccess();
          return;
        }
      }

      if (conversationId) {
        const chat = await postMilestoneDeliveryToChat(
          supabase,
          conversationId,
          m.position,
          trimmed,
          proofFiles,
        );
        if (!chat.ok) {
          setError(`Submitted but chat failed: ${chat.error}`);
          onSuccess();
          return;
        }
      }

      onSuccess();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent
        unstyled
        showCloseButton={false}
        overlayClassName="overlay modal-overlay"
        className="create-modal milestone-submit-modal !w-[min(520px,calc(100%-36px))]"
        aria-describedby="milestone-submit-desc"
      >
        <DialogTitle className="sr-only">
          Submit milestone {milestone.position}
        </DialogTitle>
        <div className="modal-head">
          <h2 className="font-heading m-0 text-[22px] leading-tight text-[var(--ink)]">
            Milestone {milestone.position}
          </h2>
          <DialogClose
            render={
              <button
                type="button"
                aria-label="Close"
                disabled={busy}
                className="disabled:opacity-40"
              />
            }
          >
            <FigmaIcon name="close" size={18} />
          </DialogClose>
        </div>
        <p className="m-0 mt-1 text-[15px] font-semibold text-[var(--ink)]">
          {milestone.title}
        </p>
        <p
          id="milestone-submit-desc"
          className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]"
        >
          Your message is posted to chat with a [Milestone {milestone.position}]
          label. Photos and video are optional.
        </p>
        <div className="form-fields mt-4">
          <label htmlFor="milestone_submit_message">
            Message
            <textarea
              id="milestone_submit_message"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={4}
              maxLength={4000}
              disabled={busy}
              placeholder="What you completed for this step…"
            />
          </label>
          <div className="engagement-delivery-proof">
            <p className="engagement-delivery-proof__hint">
              Photos or video — up to {MAX_DELIVERY_ATTACHMENTS} files, 25 MB each.
            </p>
            <div className="engagement-delivery-proof__row">
              <label className="engagement-file-picker">
                <span className="engagement-file-picker__stack">
                  <FigmaIcon name="attach" size={16} />
                  <span className="engagement-file-picker__caption">Add files</span>
                </span>
                <input
                  type="file"
                  multiple
                  disabled={busy}
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
              {proofFiles.map((f, index) => (
                <ProofFileTile
                  key={`${f.name}-${f.size}-${index}`}
                  file={f}
                  onRemove={() =>
                    setProofFiles((prev) => prev.filter((_, i) => i !== index))
                  }
                />
              ))}
            </div>
          </div>
          {error ? (
            <p className="engagement-workflow-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="primary-wide"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "Submitting…" : "Submit for review"}
            {!busy ? <FigmaIcon name="checks" size={17} /> : null}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MilestoneReviewRejectButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const busy = disabled || pending;
  return (
    <button type="submit" className="secondary compact" disabled={busy}>
      {pending ? "Rejecting…" : "Reject"}
    </button>
  );
}

function MilestoneReviewApproveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const busy = disabled || pending;
  return (
    <button type="submit" className="primary compact" disabled={busy}>
      {pending ? "Approving…" : "Approve"}
      {!busy ? <FigmaIcon name="checks" size={17} /> : null}
    </button>
  );
}

function MilestoneReviewDialog({
  open,
  milestone,
  engagementId,
  reviewAction,
  reviewError,
  reviewPending,
  onClose,
}: {
  open: boolean;
  milestone: MilestoneRow | null;
  engagementId: string;
  reviewAction: (payload: FormData) => void;
  reviewError: string | null;
  reviewPending: boolean;
  onClose: () => void;
}) {
  if (!milestone) {
    return null;
  }

  const delivery = milestone.latestDelivery;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !reviewPending) {
          onClose();
        }
      }}
    >
      <DialogContent
        unstyled
        showCloseButton={false}
        overlayClassName="overlay modal-overlay"
        className="create-modal !w-[min(520px,calc(100%-36px))]"
      >
        <DialogTitle className="sr-only">
          Review milestone {milestone.position}
        </DialogTitle>
        <div className="modal-head">
          <h2 className="font-heading m-0 text-[22px] leading-tight text-[var(--ink)]">
            Review milestone {milestone.position}
          </h2>
          <DialogClose
            render={
              <button
                type="button"
                aria-label="Close"
                className="disabled:opacity-40"
                disabled={reviewPending}
              />
            }
          >
            <FigmaIcon name="close" size={18} />
          </DialogClose>
        </div>
        <p className="m-0 mt-1 text-[15px] font-semibold text-[var(--ink)]">
          {milestone.title}
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
          Use chat if you need changes before approving. Deliverables are posted
          there.
        </p>
        {delivery ? (
          <div className="engagement-submission-preview engagement-milestone-item__preview mt-4">
            {delivery.description.trim() ? (
              <p className="engagement-submission-preview__notes">
                {delivery.description}
              </p>
            ) : null}
            <DeliveryProofGrid attachments={delivery.attachments} />
          </div>
        ) : null}
        {reviewPending ? (
          <div
            className="engagement-approve-progress mt-4"
            role="status"
            aria-live="polite"
          >
            <span className="engagement-approve-progress__dot" aria-hidden />
            <span className="engagement-approve-progress__label">
              Saving your review…
            </span>
          </div>
        ) : null}
        <div
          className="milestone-review-modal__actions mt-4"
          aria-busy={reviewPending}
        >
          <form action={reviewAction} className="milestone-review-modal__form">
            <input type="hidden" name="milestone_id" value={milestone.id} />
            <input type="hidden" name="engagement_id" value={engagementId} />
            <input type="hidden" name="review_action" value="reject" />
            <MilestoneReviewRejectButton disabled={reviewPending} />
          </form>
          <form action={reviewAction} className="milestone-review-modal__form">
            <input type="hidden" name="milestone_id" value={milestone.id} />
            <input type="hidden" name="engagement_id" value={engagementId} />
            <input type="hidden" name="review_action" value="approve" />
            <MilestoneReviewApproveButton disabled={reviewPending} />
          </form>
        </div>
        {reviewError ? (
          <p className="engagement-workflow-error mt-2" role="alert">
            {reviewError}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
