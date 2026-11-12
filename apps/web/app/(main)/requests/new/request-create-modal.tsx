"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { format } from "date-fns";
import { PaidAidLogo } from "../../../../components/paidaid-logo";
import { FigmaIcon } from "../../../../components/figma-icons";
import type { Tables } from "../../../../lib/database.types";
import {
  filterTaskBudgetAssetOptions,
  resolveSelectedBudgetAssetId,
  type BudgetAssetOption,
} from "../../../../lib/requests/request-budget-assets";
import { sanitizeHumanAmountInput } from "../../../../lib/requests/human-amount-input";
import { humanAmountToSmallestUnits } from "../../../../lib/validation/request";
import {
  fetchLinkedWalletBalanceForAsset,
  type LinkedAssetBalanceResult,
} from "../../account/wallet-balances-action";
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

const CATEGORY_NONE_KEY = "none";

const CATEGORY_SELECT_ITEMS = {
  [CATEGORY_NONE_KEY]: "None",
  ...Object.fromEntries(CATEGORY_OPTIONS.map((c) => [c.key, c.label])),
};

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

function validateCreateStep1(title: string, description: string) {
  const fieldErrors: Record<string, string> = {};
  const trimmed = title.trim();
  if (trimmed.length < 3 || trimmed.length > 50) {
    fieldErrors.title = "Title must be between 3 and 50 characters";
  }
  if (description.length > 1000) {
    fieldErrors.description = "Description must be at most 1000 characters";
  }
  return fieldErrors;
}

function validateCreateStep2(
  input: {
    budgetHuman: string;
    budgetAssetId: string;
    deadlineDate: string;
    locationKind: "online" | "in_person";
    locationLabel: string;
  },
  budgetOptions: readonly BudgetAssetOption[],
) {
  const fieldErrors: Record<string, string> = {};
  const budgetAsset = budgetOptions.find((a) => a.id === input.budgetAssetId);
  if (!budgetAsset) {
    fieldErrors.budgetAssetId = "Select a supported asset";
  }
  const assetDecimals = budgetAsset?.decimals ?? 24;
  const converted = humanAmountToSmallestUnits(
    input.budgetHuman,
    assetDecimals,
  );
  if (!converted.ok) {
    fieldErrors.budgetHuman = converted.error;
  }
  if (input.deadlineDate.trim() === "") {
    fieldErrors.deadlineAt = "Pick a deadline";
  }
  if (
    input.locationKind === "in_person" &&
    input.locationLabel.trim().length < 1
  ) {
    fieldErrors.locationLabel = "Add a short location for in-person tasks";
  }
  return fieldErrors;
}

export function RequestCreateModal({
  assets,
  tags,
  defaultAssetId,
  onClose,
}: RequestCreateModalProps) {
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
  const [categoryKey, setCategoryKey] = useState(CATEGORY_NONE_KEY);
  const [budgetAssetId, setBudgetAssetId] = useState(defaultAssetId);

  const budgetAssetOptions = useMemo(
    () => filterTaskBudgetAssetOptions(assets),
    [assets],
  );

  useEffect(() => {
    setBudgetAssetId((current) =>
      resolveSelectedBudgetAssetId(
        budgetAssetOptions,
        current,
        defaultAssetId,
      ),
    );
  }, [budgetAssetOptions, defaultAssetId]);

  const budgetAsset = budgetAssetOptions.find((a) => a.id === budgetAssetId);

  const [state, formAction] = useActionState(createRequest, initialState);
  const [isPending, startTransition] = useTransition();
  const [clientFieldErrors, setClientFieldErrors] = useState<
    Record<string, string>
  >({});
  const [linkedBalance, setLinkedBalance] =
    useState<LinkedAssetBalanceResult | null>(null);
  const [linkedBalanceLoading, setLinkedBalanceLoading] = useState(false);

  const selectedCategory =
    categoryKey === CATEGORY_NONE_KEY
      ? null
      : (CATEGORY_OPTIONS.find((c) => c.key === categoryKey) ?? null);
  const categoryTagId =
    selectedCategory == null
      ? null
      : tagIdForPick(
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

  const fieldErrors = useMemo(
    () => ({ ...clientFieldErrors, ...(state.fieldErrors ?? {}) }),
    [clientFieldErrors, state.fieldErrors],
  );

  const clearClientFieldError = (key: string) => {
    setClientFieldErrors((prev) => {
      if (!(key in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  useEffect(() => {
    setClientFieldErrors({});
  }, [step]);

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

  useEffect(() => {
    if (effectiveStep !== 2 || !budgetAssetId) {
      return;
    }
    let cancelled = false;
    setLinkedBalanceLoading(true);
    void fetchLinkedWalletBalanceForAsset(budgetAssetId).then((res) => {
      if (!cancelled) {
        setLinkedBalance(res);
        setLinkedBalanceLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveStep, budgetAssetId]);

  const onFilesChange = (list: FileList | null) => {
    if (!list?.length) {
      setPhotoFiles([]);
      return;
    }
    setPhotoFiles([list[0]!]);
  };

  const handlePrimary = () => {
    if (effectiveStep < 3) {
      const stepErrors =
        effectiveStep === 1
          ? validateCreateStep1(title, description)
          : validateCreateStep2(
              {
                budgetHuman,
                budgetAssetId,
                deadlineDate,
                locationKind,
                locationLabel,
              },
              budgetAssetOptions,
            );
      if (Object.keys(stepErrors).length > 0) {
        setClientFieldErrors(stepErrors);
        return;
      }
      setClientFieldErrors({});
      setStep(Math.min(3, effectiveStep + 1) as Step);
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

  const reviewMeta = [
    selectedCategory?.label.toUpperCase(),
    locationKind === "online" ? "ONLINE" : "IN PERSON",
  ]
    .filter(Boolean)
    .join(" · ");

  const dueLabel =
    deadlineDate.trim() === ""
      ? "—"
      : `Due ${formatDueShort(`${deadlineDate.trim()}T12:00:00`)}`;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent
        unstyled
        showCloseButton={false}
        overlayClassName="overlay modal-overlay"
        className="create-modal"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Create a task</DialogTitle>
        <div className="modal-head">
          <PaidAidLogo />
          <DialogClose render={<button type="button" aria-label="Close" />}>
            <FigmaIcon name="close" size={18} />
          </DialogClose>
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
                  Title
                  <input
                    placeholder="e.g. Help photograph my new products"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      clearClientFieldError("title");
                    }}
                    maxLength={50}
                  />
                </label>
                {fieldErrors.title && (
                  <p className="-mt-1 mb-2 text-[11px] text-red-600 dark:text-red-400">
                    {fieldErrors.title}
                  </p>
                )}
                <label>
                  <span className="inline-flex items-baseline gap-1">
                    Description
                    <span className="font-normal text-[var(--muted)]">
                      (optional)
                    </span>
                  </span>
                  <textarea
                    placeholder="Describe what needs doing, what success looks like, and any helpful context..."
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      clearClientFieldError("description");
                    }}
                    maxLength={1000}
                  />
                </label>
                {fieldErrors.description && (
                  <p className="-mt-1 mb-2 text-[11px] text-red-600 dark:text-red-400">
                    {fieldErrors.description}
                  </p>
                )}
              </div>
            )}

            {effectiveStep === 2 && (
              <div className="form-fields">
                {budgetAssetOptions.length > 1 ? (
                  <label>
                    Payment asset
                    <Select
                      modal={false}
                      items={Object.fromEntries(
                        budgetAssetOptions.map((a) => [a.id, a.symbol]),
                      )}
                      value={budgetAssetId}
                      onValueChange={(value) => {
                        if (value == null) {
                          return;
                        }
                        const nextId = String(value);
                        setBudgetAssetId(nextId);
                        clearClientFieldError("budgetAssetId");
                        clearClientFieldError("budgetHuman");
                        const nextAsset = budgetAssetOptions.find(
                          (a) => a.id === nextId,
                        );
                        if (nextAsset && budgetHuman.trim()) {
                          const converted = humanAmountToSmallestUnits(
                            budgetHuman,
                            nextAsset.decimals,
                          );
                          if (!converted.ok) {
                            setClientFieldErrors((prev) => ({
                              ...prev,
                              budgetHuman: converted.error,
                            }));
                          }
                        }
                      }}
                    >
                      <SelectTrigger aria-label="Payment asset">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {budgetAssetOptions.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.symbol}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldErrors.budgetAssetId ? (
                      <p className="mb-0 mt-1 text-[11px] text-red-600 dark:text-red-400">
                        {fieldErrors.budgetAssetId}
                      </p>
                    ) : null}
                  </label>
                ) : null}
                <div className="two-col">
                  <label>
                    Budget
                    <div className="amount-input">
                      <input
                        placeholder="0"
                        inputMode="decimal"
                        autoComplete="off"
                        value={budgetHuman}
                        onChange={(e) => {
                          setBudgetHuman(sanitizeHumanAmountInput(e.target.value));
                          clearClientFieldError("budgetHuman");
                        }}
                        aria-describedby="create-budget-asset-hint"
                      />
                      <span aria-hidden>{budgetAsset?.symbol ?? "—"}</span>
                    </div>
                    <p
                      id="create-budget-asset-hint"
                      className="mb-0 mt-1 text-[11px] text-[var(--muted)] sr-only"
                    >
                      Amount in {budgetAsset?.symbol ?? "—"}
                    </p>
                    {linkedBalanceLoading ? (
                      <div
                        className="mb-0 mt-1 h-3.5 w-24 animate-pulse rounded bg-stone-300/60 dark:bg-stone-600/40"
                        aria-hidden
                      />
                    ) : linkedBalance?.ok ? (
                      <p className="mb-0 mt-1 text-[11px] text-[var(--muted)]">
                        Balance:{" "}
                        <span className="font-mono text-[var(--ink)]">
                          {linkedBalance.line.displayAmount}{" "}
                          {linkedBalance.line.symbol}
                        </span>
                      </p>
                    ) : linkedBalance && !linkedBalance.ok ? (
                      <p
                        className="mb-0 mt-1 text-[11px] text-[var(--muted)]"
                        title={
                          linkedBalance.code === "rpc"
                            ? linkedBalance.error
                            : undefined
                        }
                      >
                        {linkedBalance.code === "not_linked"
                          ? "Link a NEAR wallet on Account to see your balance."
                          : linkedBalance.code === "rpc"
                            ? "Could not load balance right now."
                            : linkedBalance.error}
                      </p>
                    ) : null}
                    {fieldErrors.budgetHuman ? (
                      <p className="mb-0 mt-1 text-[11px] text-red-600 dark:text-red-400">
                        {fieldErrors.budgetHuman}
                      </p>
                    ) : null}
                  </label>
                  <label>
                    Deadline
                    <input
                      type="date"
                      value={deadlineDate}
                      onChange={(e) => {
                        setDeadlineDate(e.target.value);
                        clearClientFieldError("deadlineAt");
                      }}
                    />
                    {fieldErrors.deadlineAt ? (
                      <p className="mb-0 mt-1 text-[11px] text-red-600 dark:text-red-400">
                        {fieldErrors.deadlineAt}
                      </p>
                    ) : null}
                  </label>
                </div>
                <label>
                  How will this happen?
                  <div className="choice-row">
                    <button
                      type="button"
                      className={locationKind === "online" ? "selected" : ""}
                      onClick={() => {
                        setLocationKind("online");
                        clearClientFieldError("locationLabel");
                      }}
                    >
                      <FigmaIcon name="spark" size={18} />
                      Online
                    </button>
                    <button
                      type="button"
                      className={locationKind === "in_person" ? "selected" : ""}
                      onClick={() => {
                        setLocationKind("in_person");
                        clearClientFieldError("locationLabel");
                      }}
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
                      onChange={(e) => {
                        setLocationLabel(e.target.value);
                        clearClientFieldError("locationLabel");
                      }}
                    />
                  </label>
                )}
                {fieldErrors.locationLabel && (
                  <p className="mb-2 text-[11px] text-red-600 dark:text-red-400">
                    {fieldErrors.locationLabel}
                  </p>
                )}
                <label>
                  <span className="request-create-modal__label-row">
                    Category
                    <span className="request-create-modal__optional">Optional</span>
                  </span>
                  <Select
                    modal={false}
                    items={CATEGORY_SELECT_ITEMS}
                    value={categoryKey}
                    onValueChange={(value) => {
                      if (value == null) {
                        return;
                      }
                      setCategoryKey(String(value));
                      clearClientFieldError("tags");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={CATEGORY_NONE_KEY}>None</SelectItem>
                      {CATEGORY_OPTIONS.map((c) => (
                        <SelectItem key={c.key} value={c.key}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                {fieldErrors.tags && (
                  <p className="mb-2 text-[11px] text-red-600 dark:text-red-400">
                    {fieldErrors.tags}
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
                {fieldErrors.photos && (
                  <p className="-mt-2 mb-2 text-[11px] text-red-600 dark:text-red-400">
                    {fieldErrors.photos}
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
                disabled={isPending}
              >
                {isPending && effectiveStep === 3 ? (
                  <>
                    <span
                      className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-current"
                      aria-hidden
                    />
                    Publishing…
                  </>
                ) : (
                  <>
                    {effectiveStep === 3 ? "Publish" : "Continue"}
                    <FigmaIcon name="arrow" size={17} />
                  </>
                )}
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
            <button type="button" className="primary" onClick={onClose}>
              Browse marketplace
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
