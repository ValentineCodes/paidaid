"use client";

import { useActionState, useState, useTransition } from "react";

import type { Tables } from "../../../../lib/database.types";
import { categoryLabel } from "../../../../lib/validation/request";
import { createRequest, type CreateRequestState } from "../actions";

const initialState: CreateRequestState = { error: null };

type Step =
  "basics" | "tags" | "timing" | "location" | "photos" | "budget" | "review";

const STEPS: { id: Step; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "tags", label: "Tags" },
  { id: "timing", label: "Timing" },
  { id: "location", label: "Location" },
  { id: "photos", label: "Photos" },
  { id: "budget", label: "Budget" },
  { id: "review", label: "Review" },
];

type RequestComposerFormProps = {
  assets: Tables<"assets">[];
  tags: Tables<"tags">[];
  defaultAssetId: string;
};

export function RequestComposerForm({
  assets,
  tags,
  defaultAssetId,
}: RequestComposerFormProps) {
  const [step, setStep] = useState<Step>("basics");
  const [state, formAction] = useActionState(createRequest, initialState);
  const [isPending, startTransition] = useTransition();
  const [tagQuery, setTagQuery] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [timingType, setTimingType] = useState<"immediate" | "scheduled">(
    "immediate",
  );
  const [scheduledAt, setScheduledAt] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [locationKind, setLocationKind] = useState<
    "unspecified" | "online" | "in_person"
  >("unspecified");
  const [locationLabel, setLocationLabel] = useState("");
  const [budgetHuman, setBudgetHuman] = useState("");
  const [budgetAssetId, setBudgetAssetId] = useState(defaultAssetId);
  const [publish, setPublish] = useState(true);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const tagsByCategory = tags.reduce(
    (acc, tag) => {
      const k = tag.category;
      if (!acc[k]) {
        acc[k] = [];
      }
      acc[k].push(tag);
      return acc;
    },
    {} as Record<string, Tables<"tags">[]>,
  );

  const filteredTags =
    tagQuery.trim() === ""
      ? tags
      : tags.filter((t) => {
          const q = tagQuery.toLowerCase();
          return (
            t.label.toLowerCase().includes(q) ||
            t.slug.toLowerCase().includes(q) ||
            categoryLabel(t.category).toLowerCase().includes(q)
          );
        });

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, id];
    });
  };

  const onFilesChange = (list: FileList | null) => {
    if (!list?.length) {
      setPhotoFiles([]);
      return;
    }
    setPhotoFiles(Array.from(list).slice(0, 5));
  };

  const budgetAsset = assets.find((a) => a.id === budgetAssetId);
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const handleNext = () => {
    const i = STEPS.findIndex((s) => s.id === step);
    if (i < STEPS.length - 1) {
      setStep(STEPS[i + 1].id);
    }
  };

  const handleBack = () => {
    const i = STEPS.findIndex((s) => s.id === step);
    if (i > 0) {
      setStep(STEPS[i - 1].id);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (step !== "review" || isPending) {
          return;
        }
        const formData = new FormData(e.currentTarget);
        formData.set("title", title);
        formData.set("description", description);
        formData.set("timing_type", timingType);
        formData.set("scheduled_at", scheduledAt);
        formData.set("deadline_at", deadlineAt);
        formData.set("expires_at", expiresAt);
        formData.set("location_kind", locationKind);
        formData.set("location_label", locationLabel);
        formData.set("budget_human", budgetHuman);
        formData.set("budget_asset_id", budgetAssetId);
        formData.set("publish", publish ? "true" : "false");
        formData.delete("tag_id");
        for (const id of selectedTagIds) {
          formData.append("tag_id", id);
        }
        formData.delete("photos");
        for (const f of photoFiles) {
          formData.append("photos", f);
        }
        startTransition(() => {
          void formAction(formData);
        });
      }}
      className="flex max-w-2xl flex-col gap-8"
    >
      <nav aria-label="Steps" className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            disabled={isPending}
            onClick={() => setStep(s.id)}
            className={`rounded-full px-3 py-1 font-medium transition ${
              s.id === step
                ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300"
            }`}
          >
            {i + 1}. {s.label}
          </button>
        ))}
      </nav>

      {state.error && (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          role="alert"
        >
          {state.error}
        </p>
      )}

      {step === "basics" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            Title and description
          </h2>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="title"
              className="text-sm font-medium text-stone-700 dark:text-stone-300"
            >
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              minLength={3}
              maxLength={50}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            />
            {state.fieldErrors?.title && (
              <p className="text-sm text-red-700 dark:text-red-300">
                {state.fieldErrors.title}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="description"
              className="text-sm font-medium text-stone-700 dark:text-stone-300"
            >
              Description
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={6}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            />
            <p className="text-xs text-stone-500">
              {description.length} / 1000 characters
            </p>
            {state.fieldErrors?.description && (
              <p className="text-sm text-red-700 dark:text-red-300">
                {state.fieldErrors.description}
              </p>
            )}
          </div>
        </section>
      )}

      {step === "tags" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            Tags (optional)
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Choose up to three predefined tags. These help others find your task
            later.
          </p>
          <input
            type="search"
            placeholder="Search tags…"
            value={tagQuery}
            onChange={(e) => setTagQuery(e.target.value)}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          />
          <p className="text-xs text-stone-500">
            Selected: {selectedTagIds.length} / 3
          </p>
          {state.fieldErrors?.tags && (
            <p className="text-sm text-red-700 dark:text-red-300">
              {state.fieldErrors.tags}
            </p>
          )}
          <div className="flex flex-col gap-6">
            {(Object.keys(tagsByCategory) as Tables<"tags">["category"][]).map(
              (cat) => {
                const list = filteredTags.filter((t) => t.category === cat);
                if (list.length === 0) {
                  return null;
                }
                return (
                  <div key={cat} className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                      {categoryLabel(cat)}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {list.map((t) => {
                        const selected = selectedTagIds.includes(t.id);
                        const disabled =
                          !selected && selectedTagIds.length >= 3;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => toggleTag(t.id)}
                            className={`rounded-full border px-3 py-1 text-sm transition ${
                              selected
                                ? "border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
                                : "border-stone-300 text-stone-700 hover:border-stone-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:text-stone-200"
                            }`}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </section>
      )}

      {step === "timing" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            Timing
          </h2>
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">When should the work happen</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="timing_type"
                value="immediate"
                checked={timingType === "immediate"}
                onChange={() => setTimingType("immediate")}
              />
              Now (as soon as someone accepts)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="timing_type"
                value="scheduled"
                checked={timingType === "scheduled"}
                onChange={() => setTimingType("scheduled")}
              />
              Scheduled
            </label>
          </fieldset>
          {timingType === "scheduled" && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="scheduled_at"
                className="text-sm font-medium text-stone-700 dark:text-stone-300"
              >
                Scheduled date and time
              </label>
              <input
                id="scheduled_at"
                name="scheduled_at"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
              />
              {state.fieldErrors?.scheduledAt && (
                <p className="text-sm text-red-700 dark:text-red-300">
                  {state.fieldErrors.scheduledAt}
                </p>
              )}
            </div>
          )}
          {state.fieldErrors?.timingType && (
            <p className="text-sm text-red-700 dark:text-red-300">
              {state.fieldErrors.timingType}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="deadline_at"
              className="text-sm font-medium text-stone-700 dark:text-stone-300"
            >
              Expected completion by (optional)
            </label>
            <input
              id="deadline_at"
              name="deadline_at"
              type="datetime-local"
              value={deadlineAt}
              onChange={(e) => setDeadlineAt(e.target.value)}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            />
            {state.fieldErrors?.deadlineAt && (
              <p className="text-sm text-red-700 dark:text-red-300">
                {state.fieldErrors.deadlineAt}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="expires_at"
              className="text-sm font-medium text-stone-700 dark:text-stone-300"
            >
              Listing expires (optional)
            </label>
            <input
              id="expires_at"
              name="expires_at"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            />
            {state.fieldErrors?.expiresAt && (
              <p className="text-sm text-red-700 dark:text-red-300">
                {state.fieldErrors.expiresAt}
              </p>
            )}
          </div>
        </section>
      )}

      {step === "location" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            Location (optional)
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Online tasks do not need a street address. We do not request device
            location.
          </p>
          <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
            Kind
            <select
              name="location_kind"
              value={locationKind}
              onChange={(e) =>
                setLocationKind(e.target.value as typeof locationKind)
              }
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            >
              <option value="unspecified">Unspecified</option>
              <option value="online">Online</option>
              <option value="in_person">In person</option>
            </select>
          </label>
          {locationKind === "in_person" && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="location_label"
                className="text-sm font-medium text-stone-700 dark:text-stone-300"
              >
                Area or meeting point
              </label>
              <input
                id="location_label"
                name="location_label"
                type="text"
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                placeholder="e.g. Downtown, meet at mall entrance"
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
              />
              {state.fieldErrors?.locationLabel && (
                <p className="text-sm text-red-700 dark:text-red-300">
                  {state.fieldErrors.locationLabel}
                </p>
              )}
            </div>
          )}
          {state.fieldErrors?.locationKind && (
            <p className="text-sm text-red-700 dark:text-red-300">
              {state.fieldErrors.locationKind}
            </p>
          )}
        </section>
      )}

      {step === "photos" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            Photos (optional)
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Up to five images (JPEG, PNG, WebP, or GIF), 10 MB each max.
          </p>
          <input
            name="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(e) => onFilesChange(e.target.files)}
            className="text-sm text-stone-700 file:mr-3 file:rounded-lg file:border file:border-stone-300 file:bg-stone-100 file:px-3 file:py-1.5 dark:text-stone-300 dark:file:border-stone-600 dark:file:bg-stone-800"
          />
          {state.fieldErrors?.photos && (
            <p className="text-sm text-red-700 dark:text-red-300">
              {state.fieldErrors.photos}
            </p>
          )}
          {photoFiles.length > 0 && (
            <ul className="text-xs text-stone-500">
              {photoFiles.map((f) => (
                <li key={f.name + f.size}>
                  {f.name} ({Math.round(f.size / 1024)} KB)
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {step === "budget" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            Budget (indicative)
          </h2>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            This number is an indicative budget in crypto terms only. Nothing is
            deposited, escrowed, or guaranteed when you publish.
          </p>
          <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
            Asset
            <select
              name="budget_asset_id"
              value={budgetAssetId}
              onChange={(e) => setBudgetAssetId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            >
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.symbol} — {a.chain_id}
                </option>
              ))}
            </select>
          </label>
          {state.fieldErrors?.budgetAssetId && (
            <p className="text-sm text-red-700 dark:text-red-300">
              {state.fieldErrors.budgetAssetId}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="budget_human"
              className="text-sm font-medium text-stone-700 dark:text-stone-300"
            >
              Amount (whole {budgetAsset?.symbol ?? "units"} only)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="budget_human"
                name="budget_human"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={budgetHuman}
                onChange={(e) =>
                  setBudgetHuman(e.target.value.replace(/\D/g, ""))
                }
                className="min-w-[8rem] flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-stone-900 outline-none ring-stone-400 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
                placeholder="0"
              />
              <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">
                {budgetAsset?.symbol}
              </span>
            </div>
            <p className="text-xs text-stone-500">
              Stored on-chain style in smallest units ({budgetAsset?.decimals}{" "}
              decimals). Enter a whole number of {budgetAsset?.symbol} here.
            </p>
            {state.fieldErrors?.budgetHuman && (
              <p className="text-sm text-red-700 dark:text-red-300">
                {state.fieldErrors.budgetHuman}
              </p>
            )}
          </div>
        </section>
      )}

      {step === "review" && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-stone-900 dark:text-stone-100">
            Review
          </h2>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-stone-500">Title</dt>
              <dd className="font-medium text-stone-900 dark:text-stone-100">
                {title || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Description</dt>
              <dd className="whitespace-pre-wrap text-stone-800 dark:text-stone-200">
                {description || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Tags</dt>
              <dd>
                {selectedTagIds.length === 0
                  ? "None"
                  : selectedTagIds
                      .map((id) => tags.find((t) => t.id === id)?.label ?? id)
                      .join(", ")}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Timing</dt>
              <dd>
                {timingType === "immediate"
                  ? "Immediate"
                  : `Scheduled: ${scheduledAt || "—"}`}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Location</dt>
              <dd>
                {locationKind === "unspecified" && "Not specified"}
                {locationKind === "online" && "Online"}
                {locationKind === "in_person" &&
                  (locationLabel || "In person (add label)")}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Budget (indicative)</dt>
              <dd className="font-mono">
                {budgetHuman || "0"} {budgetAsset?.symbol} on{" "}
                {budgetAsset?.chain_id}
              </dd>
            </div>
            <div>
              <dt className="text-stone-500">Visibility</dt>
              <dd>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={publish}
                    onChange={(e) => setPublish(e.target.checked)}
                  />
                  Publish to the open marketplace (otherwise save as draft)
                </label>
              </dd>
            </div>
          </dl>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4 dark:border-stone-800">
        <button
          type="button"
          onClick={handleBack}
          disabled={stepIndex === 0 || isPending}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-600 dark:text-stone-100"
        >
          Back
        </button>
        <div className="flex flex-wrap gap-2">
          {step !== "review" ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={isPending}
              className="rounded-lg bg-stone-200 px-4 py-2 text-sm font-medium text-stone-900 transition hover:bg-stone-300 dark:bg-stone-700 dark:text-stone-100 dark:hover:bg-stone-600"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
            >
              {isPending
                ? "Submitting…"
                : publish
                  ? "Publish request"
                  : "Save draft"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
