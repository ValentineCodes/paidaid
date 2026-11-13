import Link from "next/link";

import { FigmaIcon } from "../../../../components/figma-icons";
import { TruncatedText } from "../../../../components/truncated-text";
import { formatPostedRelative } from "../../../../lib/datetime/relative-from-now";
import type { Database } from "../../../../lib/database.types";
import type { EngagementSettlementView } from "../../../../lib/engagement/settlement-types";
import { EngagementCallout } from "./engagement-callout";
import { EngagementSettlementSection } from "./engagement-settlement-section";
import { EngagementWorkflow } from "./engagement-workflow";
import { EngagementMilestoneWorkflow } from "./engagement-milestone-workflow";
import { EngagementReviewSection } from "./engagement-review-section";

type DeliveryAttachmentRow =
  Database["public"]["Tables"]["delivery_attachments"]["Row"];
type DeliveryRow = Database["public"]["Tables"]["deliveries"]["Row"];
type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"];

export type EngagementDetailContentProps = {
  nowMs: number;
  engagementId: string;
  engagementStatus: Database["public"]["Enums"]["engagement_status"];
  scheduledForDay: string;
  createdAt: string;
  isProvider: boolean;
  title: string;
  description: string | null;
  budgetHuman: string;
  assetSymbol: string;
  paymentFunded: boolean;
  locationKind: Database["public"]["Enums"]["location_kind"] | null;
  locationLabel: string | null;
  deadlineAt: string | null;
  peerDisplayName: string;
  peerPhotoUrl: string | null;
  peerPhone: string | null;
  conversationId: string | null;
  linkedRequesterNear: string | null;
  linkedProviderNear: string | null;
  fundingPrerequisites: {
    requesterWalletLinked: boolean;
    providerWalletLinked: boolean;
    requesterDisplayName: string;
    providerDisplayName: string;
    requesterNearAccountId: string | null;
    providerNearAccountId: string | null;
  } | null;
  initialSettlement: EngagementSettlementView | null;
  delivery: DeliveryRow | null;
  deliveryAttachments: DeliveryAttachmentRow[];
  existingReview: ReviewRow | null;
  tagLabels: string[];
  paymentMode: Database["public"]["Enums"]["engagement_payment_mode"];
  engagementMilestones: {
    id: string;
    position: number;
    title: string;
    description: string;
    amountSmallest: string;
    status: Database["public"]["Enums"]["milestone_workflow_status"];
    latestDelivery: {
      deliveryId: string;
      description: string;
      attachments: {
        id: string;
        storage_path: string;
        mime_type: string;
      }[];
    } | null;
  }[];
  assetDecimals: number;
  milestoneReleaseQueue: {
    onChainMilestonesReleased: number;
    nextReleasePosition: number;
    releasableMilestoneId: string | null;
  } | null;
};

function formatLocationLine(
  locationKind: EngagementDetailContentProps["locationKind"],
  locationLabel: string | null,
): string {
  if (locationKind === "online") {
    return "Online";
  }
  if (locationKind === "unspecified" || !locationKind) {
    return "Not specified";
  }
  return locationLabel?.trim() || "In person";
}

function formatDeadlineLabel(deadlineAt: string | null): string {
  if (!deadlineAt) {
    return "Flexible";
  }
  const d = new Date(deadlineAt);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function statusBadgeLabel(
  status: Database["public"]["Enums"]["engagement_status"],
): string {
  if (status === "completed") {
    return "Completed";
  }
  return "In progress";
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

function EngagementOfferCard({
  amount,
  whenDetail,
  locationLabel,
  funded,
}: {
  amount: string;
  whenDetail: string;
  locationLabel: string;
  funded: boolean;
}) {
  return (
    <div className="engagement-offer-card">
      <div className="engagement-offer-card__offer">
        <small>Offer</small>
        <strong>{amount}</strong>
        {funded ? (
          <span className="engagement-offer-card__funded">Funded in escrow</span>
        ) : (
          <span className="engagement-offer-card__pending">Awaiting funding</span>
        )}
      </div>
      <div aria-hidden className="engagement-offer-card__divider" />
      <div className="engagement-offer-card__cols">
        <div>
          <small>
            <FigmaIcon name="clock" size={14} /> When
          </small>
          <span>{whenDetail}</span>
        </div>
        <div>
          <small>
            <FigmaIcon name="pin" size={14} /> Location
          </small>
          <span>{locationLabel}</span>
        </div>
      </div>
    </div>
  );
}

export function EngagementDetailContent(props: EngagementDetailContentProps) {
  const {
    nowMs,
    engagementId,
    engagementStatus,
    scheduledForDay,
    createdAt,
    isProvider,
    title,
    description,
    budgetHuman,
    assetSymbol,
    paymentFunded,
    locationKind,
    locationLabel,
    deadlineAt,
    peerDisplayName,
    peerPhotoUrl,
    conversationId,
    linkedRequesterNear,
    linkedProviderNear,
    fundingPrerequisites,
    initialSettlement,
    delivery,
    deliveryAttachments,
    existingReview,
    tagLabels,
    paymentMode,
    engagementMilestones,
    milestoneReleaseQueue,
    assetDecimals,
  } = props;
  const isRequester = !isProvider;

  const screenTitle = isProvider ? "Request" : "Your request";
  const startedAt = new Date(createdAt);
  const metaTime = Number.isNaN(startedAt.getTime())
    ? "—"
    : formatPostedRelative(startedAt, nowMs);
  const locationLine = formatLocationLine(locationKind, locationLabel);
  const whenDetail = formatDeadlineLabel(deadlineAt);
  const showPaymentSecured =
    !isProvider && paymentFunded && engagementStatus === "active";
  return (
    <div className="inner-page engagement-flow">
      <p className="engagement-flow__eyebrow">{screenTitle}</p>

      <p className="engagement-flow__meta">
        <span
          className={`engagement-status-pill${engagementStatus === "completed" ? " engagement-status-pill--done" : ""}`}
        >
          {statusBadgeLabel(engagementStatus)}
        </span>
        <time dateTime={createdAt}>{metaTime}</time>
      </p>

      <h1 className="engagement-flow__title">{title}</h1>
      {description?.trim() ? (
        <TruncatedText
          text={description}
          className="engagement-flow__description"
        />
      ) : null}

      <EngagementOfferCard
        amount={`${budgetHuman} ${assetSymbol}`}
        whenDetail={whenDetail}
        locationLabel={locationLine}
        funded={paymentFunded}
      />

      {tagLabels.length > 0 ? (
        <p className="engagement-flow__tags">{tagLabels.join(" · ")}</p>
      ) : null}

      <section className="engagement-flow__section">
        <div className="engagement-person-card">
          <div className="avatar large shrink-0">
            {peerPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={peerPhotoUrl}
                alt=""
                className="size-full rounded-full object-cover"
              />
            ) : (
              initialsFromName(peerDisplayName)
            )}
          </div>
          <div className="engagement-person-card__body">
            <strong className="engagement-person-card__name">
              {peerDisplayName}
            </strong>
          </div>
          {conversationId ? (
            <Link
              href={`/messages/${conversationId}`}
              className="engagement-person-card__chat"
              aria-label={`Chat with ${peerDisplayName}`}
            >
              <span className="engagement-connect-icon" aria-hidden>
                <FigmaIcon name="send" size={20} />
              </span>
            </Link>
          ) : (
            <span
              className="engagement-person-card__chat engagement-person-card__chat--disabled"
              aria-hidden
            >
              <span className="engagement-connect-icon">
                <FigmaIcon name="send" size={20} />
              </span>
            </span>
          )}
        </div>
      </section>

      <div className="engagement-flow__below">
        {showPaymentSecured ? (
          <EngagementCallout tone="info" title="Payment secured">
            Approving the submission releases escrow to your provider in one step.
          </EngagementCallout>
        ) : null}

        {isProvider &&
          engagementStatus === "active" &&
          delivery?.status === "pending_review" && (
            <EngagementCallout tone="info" title="Under review">
              Waiting for the requester to approve your submission.
            </EngagementCallout>
          )}

        {isProvider &&
          engagementStatus === "active" &&
          delivery?.status === "approved" &&
          paymentFunded && (
            <EngagementCallout tone="info" title="Delivery approved">
              Awaiting on-chain payment release to complete the engagement.
            </EngagementCallout>
          )}

        {isProvider &&
          engagementStatus === "active" &&
          !paymentFunded &&
          !(fundingPrerequisites?.providerWalletLinked ?? false) && (
            <EngagementCallout tone="warning" title="Wallet needed">
              The requester cannot fund escrow until you sign in with your NEAR
              wallet.
            </EngagementCallout>
          )}

        {!isProvider && engagementStatus === "active" && !paymentFunded && (
          <EngagementCallout tone="warning" title="Escrow not funded">
            This engagement has no funded escrow. Funding happens when you accept a
            provider on the request — open the request to complete funding.
          </EngagementCallout>
        )}

        {paymentFunded && paymentMode === "single" ? (
          <EngagementSettlementSection
            engagementId={engagementId}
            isRequester={!isProvider}
            linkedRequesterNearAccountId={linkedRequesterNear}
            linkedProviderNearAccountId={linkedProviderNear}
            initialSettlement={initialSettlement}
            deliveryStatus={delivery?.status ?? null}
          />
        ) : null}

        {paymentMode === "milestones" ? (
          <div className="engagement-workflow-wrap flex flex-col gap-4">
            <EngagementMilestoneWorkflow
              engagementId={engagementId}
              conversationId={conversationId}
              assetSymbol={assetSymbol}
              assetDecimals={assetDecimals}
              milestones={engagementMilestones}
              milestoneReleaseQueue={milestoneReleaseQueue}
              isProvider={isProvider}
              isRequester={isRequester}
              paymentFunded={paymentFunded}
            />
            <EngagementReviewSection
              engagementId={engagementId}
              engagementStatus={engagementStatus}
              isRequester={isRequester}
              existingReview={existingReview}
            />
          </div>
        ) : (
          <div className="engagement-workflow-wrap">
            <EngagementWorkflow
              engagementId={engagementId}
              conversationId={conversationId}
              isProvider={isProvider}
              isRequester={isRequester}
              engagementStatus={engagementStatus}
              delivery={delivery}
              deliveryAttachments={deliveryAttachments}
              existingReview={existingReview}
              paymentFunded={paymentFunded}
              linkedRequesterNearAccountId={linkedRequesterNear}
              linkedProviderNearAccountId={linkedProviderNear}
            />
          </div>
        )}
      </div>
    </div>
  );
}
