"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { defaultRpcUrlForNetwork, parseNearNetworkId } from "@paidaid/shared";
import { AppToast } from "../../../../components/app-toast";
import { FigmaIcon } from "../../../../components/figma-icons";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
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
  checkEngagementReleasePreflight,
  type EngagementReleasePreflightResult,
} from "../engagement-settlement-actions";
import { sendNep141StorageDeposit } from "../../../../wallet/send-nep141-storage-deposit";
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
import type { EngagementSettlementView } from "../../../../lib/engagement/settlement-types";
import type { Database } from "../../../../lib/database.types";
import {
  formatNearTransactionError,
  isUserRejectedTransaction,
} from "../../../../wallet/near-transaction-errors";
import { EngagementReviewSection } from "./engagement-review-section";

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
  linkedProviderNearAccountId: string | null;
};

function settlementNeedsRelease(
  status: EngagementSettlementView["settlementStatus"],
): boolean {
  return status === "eligible" || status === "release_failed";
}

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
    <div className="engagement-proof-tile" title={file.name}>
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
    </div>
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
  linkedProviderNearAccountId,
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
  const [approveFlowActive, setApproveFlowActive] = useState(false);
  const [successToastOpen, setSuccessToastOpen] = useState(false);
  const [successToastMessage, setSuccessToastMessage] = useState("");
  const [errorToastOpen, setErrorToastOpen] = useState(false);
  const [errorToastMessage, setErrorToastMessage] = useState("");

  const walletMatchesLink =
    !linkedRequesterNearAccountId ||
    !signedAccountId ||
    signedAccountId.toLowerCase() ===
      linkedRequesterNearAccountId.toLowerCase();
  const providerWalletMatchesLink =
    !linkedProviderNearAccountId ||
    !signedAccountId ||
    signedAccountId.toLowerCase() ===
      linkedProviderNearAccountId.toLowerCase();
  const [registerPrompt, setRegisterPrompt] = useState<Extract<
    EngagementReleasePreflightResult,
    { ok: false }
  > | null>(null);
  const networkId = parseNearNetworkId(process.env.NEXT_PUBLIC_NEAR_NETWORK_ID);
  const nearConfig = useMemo(
    () => ({
      networkId,
      rpcUrl:
        process.env.NEXT_PUBLIC_NEAR_RPC_URL?.trim() ||
        defaultRpcUrlForNetwork(networkId),
    }),
    [networkId],
  );

  const [desc, setDesc] = useState(delivery?.description ?? "");
  const [proofFiles, setProofFiles] = useState<File[]>([]);


  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (approveFlowActive && engagementStatus === "completed") {
      setApproveFlowActive(false);
      setBusy(false);
      setApproveStep(null);
      setSuccessToastMessage(
        "Payment released. You can rate your provider now.",
      );
      setSuccessToastOpen(true);
    }
  }, [approveFlowActive, engagementStatus]);

  useEffect(() => {
    if (!approveFlowActive || engagementStatus === "completed") {
      return;
    }
    const id = window.setInterval(() => refresh(), 2500);
    return () => window.clearInterval(id);
  }, [approveFlowActive, engagementStatus, refresh]);

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

  async function registerThenSubmit() {
    if (
      !registerPrompt ||
      registerPrompt.ok ||
      !registerPrompt.storageDepositYocto ||
      !registerPrompt.tokenContractId
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!signedAccountId) {
        await openConnect();
        await syncFromSelectorStore();
        throw new Error("Connect your linked NEAR wallet, then register.");
      }
      if (!providerWalletMatchesLink) {
        throw new Error(
          `Connected wallet must be ${linkedProviderNearAccountId}.`,
        );
      }
      const signer = await getTransactionSigner();
      const deposited = await sendNep141StorageDeposit(
        signer,
        nearConfig,
        registerPrompt.tokenContractId,
        BigInt(registerPrompt.storageDepositYocto),
      );
      if (!deposited.ok) {
        throw new Error(deposited.error);
      }
      setRegisterPrompt(null);
      await runSubmitDelivery();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed.");
      setBusy(false);
    }
  }

  async function beginSubmitDelivery() {
    setError(null);
    setBusy(true);
    try {
      const preflight = await checkEngagementReleasePreflight(engagementId);
      if (!preflight.ok && preflight.code === "provider_not_registered") {
        setRegisterPrompt(preflight);
        setBusy(false);
        return;
      }
    } catch {
      // Delivery can still be submitted if the registration check is unavailable.
    }
    await runSubmitDelivery();
  }

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
    setApproveFlowActive(true);
    setBusy(true);
    setError(null);
    setApproveStep("Preparing approval…");
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

      const loadedBefore = await loadEngagementSettlementView(engagementId);
      const skipReview =
        loadedBefore.ok &&
        settlementNeedsRelease(loadedBefore.settlement.settlementStatus);

      if (!skipReview) {
        setApproveStep("Recording approval…");
        const { error: rpcErr } = await supabase.rpc("review_delivery", {
          p_engagement_id: engagementId,
          p_action: "approve",
        });
        if (rpcErr) {
          throw new Error(rpcErr.message);
        }
      }

      setApproveStep(
        "Releasing payment — confirm in your NEAR wallet…",
      );
      const signer = await getTransactionSigner();
      const loaded = await loadEngagementSettlementView(engagementId);
      if (!loaded.ok) {
        throw new Error(loaded.error);
      }
      const settlement = loaded.settlement;
      setApproveStep("Waiting for wallet approval (release escrow)…");
      const released = await releaseEscrowForEngagement(
        engagementId,
        signer,
        settlement,
        { requesterNearAccountId: linkedRequesterNearAccountId },
      );
      if (!released.ok) {
        throw new Error(released.error);
      }

      setApproveStep(
        "Verifying payment release and preparing your review…",
      );
      refresh();
    } catch (e) {
      setApproveFlowActive(false);
      setApproveStep(null);
      setBusy(false);
      const raw = e instanceof Error ? e.message : "Approval failed.";
      if (isUserRejectedTransaction(e)) {
        setError(null);
        setErrorToastMessage(formatNearTransactionError(e));
        setErrorToastOpen(true);
      } else {
        setError(raw);
      }
      refresh();
    }
  }

  const deliveryStatus = delivery?.status ?? null;

  const deliveryHasVisibleContent =
    Boolean(delivery?.description?.trim()) || deliveryAttachments.length > 0;

  const showDeliveryForm =
    deliveryStatus === null || deliveryStatus === "revision_requested";

  return (
    <div className="flex flex-col gap-4">
      <AppToast
        message={successToastMessage}
        visible={successToastOpen}
        onClose={() => setSuccessToastOpen(false)}
        variant="success"
      />
      <AppToast
        message={errorToastMessage}
        visible={errorToastOpen}
        onClose={() => setErrorToastOpen(false)}
        variant="error"
      />
      <Dialog
        open={registerPrompt != null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setRegisterPrompt(null);
          }
        }}
      >
        <DialogContent
          unstyled
          showCloseButton={false}
          overlayClassName="overlay modal-overlay"
          className="create-modal !w-[min(440px,calc(100%-36px))]"
          aria-describedby="provider-register-desc"
        >
          <DialogTitle className="sr-only">Register to receive payment</DialogTitle>
          <div className="modal-head">
            <h2 className="font-heading m-0 text-[22px] leading-tight text-[var(--ink)]">
              Register to receive payment
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
          <p
            id="provider-register-desc"
            className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]"
          >
            You will not be able to receive{" "}
            {registerPrompt?.assetSymbol ?? "this token"} until your wallet is
            registered on the token contract. Registration is a one-time NEAR
            storage deposit from your wallet, not the requester&apos;s.
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setRegisterPrompt(null)}
            >
              Not now
            </button>
            <button
              type="button"
              className="primary btn-ink"
              disabled={busy}
              onClick={() => void registerThenSubmit()}
            >
              {busy
                ? "Registering…"
                : `Register for ${registerPrompt?.assetSymbol ?? "tokens"}`}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {error ? (
        <p className="engagement-workflow-error" role="alert">
          {error}
        </p>
      ) : null}

      {/* Provider: submit / resubmit */}
      {isProvider && engagementStatus === "active" && showDeliveryForm ? (
        <section className="engagement-delivery-card">
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
                  <div className="engagement-delivery-proof__row">
                    <label className="engagement-file-picker">
                      <span className="engagement-file-picker__stack">
                        <FigmaIcon name="attach" size={16} />
                        <span className="engagement-file-picker__caption">
                          Add files
                        </span>
                      </span>
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                        onChange={(e) => {
                          const list = e.target.files
                            ? [...e.target.files]
                            : [];
                          setProofFiles((prev) =>
                            [...prev, ...list].slice(
                              0,
                              MAX_DELIVERY_ATTACHMENTS,
                            ),
                          );
                          e.target.value = "";
                        }}
                      />
                    </label>
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
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void beginSubmitDelivery()}
                  className="primary-wide"
                >
                  {busy ? "Submitting…" : "Submit for review"}
                  {!busy ? <FigmaIcon name="checks" size={17} /> : null}
                </button>
              </div>
          </>
        </section>
      ) : null}

      {isProvider &&
        engagementStatus === "active" &&
        deliveryStatus === "pending_review" &&
        delivery &&
        deliveryHasVisibleContent ? (
          <section className="engagement-delivery-card">
            <div className="engagement-submission-preview engagement-submission-preview--only">
              <p className="engagement-delivery-card__eyebrow">Your submission</p>
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
          </section>
        ) : null}

      {isRequester &&
        paymentFunded &&
        engagementStatus === "active" &&
        (deliveryStatus === "pending_review" || approveFlowActive) && (
          <section
            className="engagement-approve-actions"
            aria-busy={approveFlowActive || busy}
          >
            {approveFlowActive && approveStep ? (
              <div
                className="engagement-approve-progress"
                role="status"
                aria-live="polite"
              >
                <span
                  className="engagement-approve-progress__dot"
                  aria-hidden
                />
                <span className="engagement-approve-progress__label">
                  {approveStep}
                </span>
              </div>
            ) : null}
            {deliveryStatus === "pending_review" && !approveFlowActive ? (
              <>
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
              </>
            ) : null}
          </section>
        )}

      <EngagementReviewSection
        engagementId={engagementId}
        engagementStatus={engagementStatus}
        isRequester={isRequester}
        existingReview={existingReview}
      />
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
