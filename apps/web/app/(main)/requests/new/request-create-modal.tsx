"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

import { PaidAidLogo } from "../../../../components/paidaid-logo";
import { FigmaIcon } from "../../../../components/figma-icons";
import type { Tables } from "../../../../lib/database.types";
import { createRequest, type CreateRequestState } from "../actions";

type RequestCreateModalProps = {
  assets: Tables<"assets">[];
  tags: Tables<"tags">[];
  defaultAssetId: string;
  onClose: () => void;
};

const initialState: CreateRequestState = { error: null };

type Step = 1 | 2 | 3;

/** Figma labels map to our DB categories; we pick one representative tag per category. */
const CATEGORY_OPTIONS: {
  key: string;
  label: string;
  dbCategory: Tables<"tags">["category"];
  slug: string;
}[] = [
  {
    key: "creative",
    label: "Creative",
    dbCategory: "others",
    slug: "creative",
  },
  {
    key: "design",
    label: "Design",
    dbCategory: "others",
    slug: "design",
  },
  { key: "home", label: "Home", dbCategory: "home", slug: "cleaning" },
  {
    key: "writing",
    label: "Writing",
    dbCategory: "others",
    slug: "writing",
  },
  {
    key: "photography",
    label: "Photography",
    dbCategory: "others",
    slug: "photography",
  },
];

function tagIdForPick(
  tags: Tables<"tags">[],
  category: Tables<"tags">["category"],
  slug: string,
): string | null {
  const bySlug = tags.find((t) => t.slug === slug);
  if (bySlug) {
    return bySlug.id;
  }
  const inCat = tags
    .filter((t) => t.category === category)
    .sort((a, b) => a.sort_order - b.sort_order);
  return inCat[0]?.id ?? null;
}

function formatDueShort(isoLocal: string): string {
  const d = Date.parse(isoLocal);
  if (Number.isNaN(d)) {
    return "";
  }
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function RequestCreateModal({
  assets,
  tags,
  defaultAssetId,
  onClose,
}: RequestCreateModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [budgetHuman, setBudgetHuman] = useState("");
  const [deadlineDate, setDeadlineDate] = useState(() =>
    format(new Date(), "yyyy-MM-dd"),
  );
  const [locationKind, setLocationKind] = useState<"online" | "in_person">(
    "online",
  );
  const [locationLabel, setLocationLabel] = useState("");
  const [categoryKey, setCategoryKey] = useState(CATEGORY_OPTIONS[0].key);

  const budgetAssetId = defaultAssetId;
  const budgetAsset = assets.find((a) => a.id === budgetAssetId);

  const [state, formAction] = useActionState(createRequest, initialState);
  const [isPending, startTransition] = useTransition();

  const selectedCategory = CATEGORY_OPTIONS.find((c) => c.key === categoryKey)!;
  const categoryTagId = tagIdForPick(
    tags,
    selectedCategory.dbCategory,
    selectedCategory.slug,
  );

  const photoPreviewUrl = useMemo(() => {
    const first = photoFiles[0];
    if (!first) {
      return null;
    }
    return URL.createObjectURL(first);
  }, [photoFiles]);

  useEffect(() => {
    if (!photoPreviewUrl) {
      return;
    }
    return () => {
      URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  const isPublished = Boolean(state.success && state.requestId);

  const effectiveStep = useMemo((): Step => {
    const fe = state.fieldErrors;
    if (!fe) {
      return step;
    }
    if (fe.title || fe.description) {
      return 1;
    }
    if (fe.photos) {
      return 3;
    }
    if (
      fe.budgetHuman ||
      fe.budgetAssetId ||
      fe.deadlineAt ||
      fe.locationKind ||
      fe.locationLabel ||
      fe.tags ||
      fe.timingType ||
      fe.scheduledAt
    ) {
      return 2;
    }
    return step;
  }, [step, state.fieldErrors]);

  const onFilesChange = (list: FileList | null) => {
    if (!list?.length) {
      setPhotoFiles([]);
      return;
    }
    setPhotoFiles([list[0]!]);
  };

  const step1Ok =
    title.trim().length >= 3 &&
    title.trim().length <= 50 &&
    description.length <= 1000;

  const step2Ok = (() => {
    const budgetOk = /^\d+$/.test(budgetHuman.trim()) && budgetHuman !== "0";
    const deadlineOk = deadlineDate.trim() !== "";
    const inPersonOk =
      locationKind === "online" || locationLabel.trim().length >= 1;
    return budgetOk && deadlineOk && inPersonOk;
  })();

  const canContinue =
    effectiveStep === 1 ? step1Ok : effectiveStep === 2 ? step2Ok : true;

  const handlePrimary = () => {
    if (effectiveStep < 3) {
      if (canContinue) {
        setStep((Math.min(3, effectiveStep + 1) as Step));
      }
      return;
    }
    const deadlineAt =
      deadlineDate.trim() === "" ? "" : `${deadlineDate.trim()}T23:59:59`;

    const formData = new FormData();
    formData.set("title", title);
    formData.set("description", description);
    formData.set("timing_type", "immediate");
    formData.set("scheduled_at", "");
    formData.set("deadline_at", deadlineAt);
    formData.set("expires_at", "");
    formData.set("location_kind", locationKind);
    formData.set(
      "location_label",
      locationKind === "in_person" ? locationLabel : "",
    );
    formData.set("budget_human", budgetHuman.trim());
    formData.set("budget_asset_id", budgetAssetId);
    formData.set("publish", "true");
    formData.set("stay_in_modal", "true");
    formData.delete("tag_id");
    if (categoryTagId) {
      formData.append("tag_id", categoryTagId);
    }
    formData.delete("photos");
    for (const f of photoFiles) {
      formData.append("photos", f);
    }
    startTransition(() => {
      void formAction(formData);
    });
  };

  const handleBack = () => {
    if (effectiveStep > 1) {
      setStep((effectiveStep - 1) as Step);
    }
  };

  const reviewMeta = `${selectedCategory.label.toUpperCase()} · ${
    locationKind === "online" ? "ONLINE" : "IN PERSON"
  }`;

  const dueLabel =
    deadlineDate.trim() === ""
      ? "—"
      : `Due ${formatDueShort(`${deadlineDate.trim()}T12:00:00`)}`;

  return (
    <div className="overlay modal-overlay">
      <div className="create-modal">
        <div className="modal-head">
          <PaidAidLogo />
          <button type="button" onClick={onClose} aria-label="Close">
            <FigmaIcon name="close" size={18} />
          </button>
        </div>

        {!isPublished ? (
          <>
            <div className="step-line">
              <span className={effectiveStep >= 1 ? "on" : ""} />
              <span className={effectiveStep >= 2 ? "on" : ""} />
              <span className={effectiveStep >= 3 ? "on" : ""} />
            </div>
            <div className="form-intro">
              <span>STEP {effectiveStep} OF 3</span>
              <h2>
                {effectiveStep === 1
                  ? "What do you need done?"
                  : effectiveStep === 2
                    ? "Set the details"
                    : "Review your task"}
              </h2>
              <p>
                {effectiveStep === 1
                  ? "A clear brief helps the right people find you."
                  : effectiveStep === 2
                    ? "Help people understand the scope and timing."
                    : "Make sure everything looks right before publishing."}
              </p>
            </div>

            {state.error && (
              <p
                className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                role="alert"
              >
                {state.error}
              </p>
            )}

            {effectiveStep === 1 && (
              <div className="form-fields">
                <label>
                  Task title
                  <input
                    placeholder="e.g. Help photograph my new products"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={50}
                  />
                </label>
                {state.fieldErrors?.title && (
                  <p className="-mt-1 text-[11px] text-red-600 dark:text-red-400">
                    {state.fieldErrors.title}
                  </p>
                )}
                <label>
                  Description <span className="text-[var(--muted)]">(optional)</span>
                  <textarea
                    placeholder="Describe what needs doing, what success looks like, and any helpful context..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={1000}
                  />
                </label>
                {state.fieldErrors?.description && (
                  <p className="-mt-1 text-[11px] text-red-600 dark:text-red-400">
                    {state.fieldErrors.description}
                  </p>
                )}
              </div>
            )}

            {effectiveStep === 2 && (
              <div className="form-fields">
                <div className="two-col">
                  <label>
                    Budget
                    <div className="amount-input">
                      <input
                        placeholder="250"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        value={budgetHuman}
                        onChange={(e) =>
                          setBudgetHuman(e.target.value.replace(/\D/g, ""))
                        }
                      />
                      <span>{budgetAsset?.symbol ?? "—"}</span>
                    </div>
                  </label>
                  {state.fieldErrors?.budgetHuman && (
                    <p className="col-span-2 -mt-2 text-[11px] text-red-600 dark:text-red-400">
                      {state.fieldErrors.budgetHuman}
                    </p>
                  )}
                  <label>
                    Deadline
                    <input
                      type="date"
                      value={deadlineDate}
                      onChange={(e) => setDeadlineDate(e.target.value)}
                    />
                  </label>
                  {state.fieldErrors?.deadlineAt && (
                    <p className="col-span-2 -mt-2 text-[11px] text-red-600 dark:text-red-400">
                      {state.fieldErrors.deadlineAt}
                    </p>
                  )}
                </div>
                <label>
                  How will this happen?
                  <div className="choice-row">
                    <button
                      type="button"
                      className={locationKind === "online" ? "selected" : ""}
                      onClick={() => setLocationKind("online")}
                    >
                      <FigmaIcon name="spark" size={18} />
                      Online
                    </button>
                    <button
                      type="button"
                      className={
                        locationKind === "in_person" ? "selected" : ""
                      }
                      onClick={() => setLocationKind("in_person")}
                    >
                      <FigmaIcon name="pin" size={18} />
                      In person
                    </button>
                  </div>
                </label>
                {locationKind === "in_person" && (
                  <label>
                    Area or meeting point
                    <input
                      placeholder="e.g. Downtown, meet at mall entrance"
                      value={locationLabel}
                      onChange={(e) => setLocationLabel(e.target.value)}
                    />
                  </label>
                )}
                {state.fieldErrors?.locationLabel && (
                  <p className="text-[11px] text-red-600 dark:text-red-400">
                    {state.fieldErrors.locationLabel}
                  </p>
                )}
                <label>
                  Category
                  <select
                    value={categoryKey}
                    onChange={(e) => setCategoryKey(e.target.value)}
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                {state.fieldErrors?.tags && (
                  <p className="text-[11px] text-red-600 dark:text-red-400">
                    {state.fieldErrors.tags}
                  </p>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => {
                onFilesChange(e.target.files);
                e.target.value = "";
              }}
            />

            {effectiveStep === 3 && (
              <div className="review-card">
                <div className="review-image-wrap">
                  <button
                    type="button"
                    className={`review-image review-image--selectable overflow-hidden${
                      photoPreviewUrl ? " !p-0 !bg-transparent" : ""
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    aria-label={
                      photoPreviewUrl ? "Change task photo" : "Add task photo"
                    }
                  >
                    {photoPreviewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoPreviewUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <FigmaIcon name="camera" size={30} />
                    )}
                  </button>
                  {photoPreviewUrl ? (
                    <button
                      type="button"
                      className="review-image-remove"
                      aria-label="Remove photo"
                      onClick={() => {
                        setPhotoFiles([]);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                    >
                      <FigmaIcon name="close" size={14} />
                    </button>
                  ) : null}
                </div>
                {state.fieldErrors?.photos && (
                  <p className="-mt-2 mb-2 text-[11px] text-red-600 dark:text-red-400">
                    {state.fieldErrors.photos}
                  </p>
                )}
                <p className="review-card__meta">{reviewMeta}</p>
                <h3>{title.trim() || "—"}</h3>
                {description.trim() ? <p>{description.trim()}</p> : null}
                <div className="review-card__budget-row">
                  <strong>
                    {budgetHuman.trim() || "0"} {budgetAsset?.symbol}
                  </strong>
                  <span>{dueLabel}</span>
                </div>
              </div>
            )}

            <div className="modal-actions">
              {effectiveStep > 1 ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={handleBack}
                  disabled={isPending}
                >
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary"
                  onClick={onClose}
                  disabled={isPending}
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                className="primary"
                onClick={handlePrimary}
                disabled={isPending || (effectiveStep < 3 && !canContinue)}
              >
                {effectiveStep === 3 ? "Publish task" : "Continue"}
                <FigmaIcon name="arrow" size={17} />
              </button>
            </div>
          </>
        ) : (
          <div className="published">
            <span>
              <FigmaIcon name="check" size={28} />
            </span>
            <h2>Your task is live</h2>
            <p>
              People can now discover it and send you offers. We’ll let you know
              when someone responds.
            </p>
            <button
              type="button"
              className="primary"
              onClick={() => {
                onClose();
                router.push("/");
              }}
            >
              Browse marketplace
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
