import { FigmaIcon } from "../../../../components/figma-icons";

function initialsFromDisplayName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

type Props = {
  displayName: string;
  verified: boolean;
  avatarUrl: string | null;
  variant: "drawer" | "page";
};

function RequesterAvatar({
  displayName,
  avatarUrl,
}: {
  displayName: string;
  avatarUrl: string | null;
}) {
  const initials = initialsFromDisplayName(displayName);
  return (
    <div className="avatar large shrink-0">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="size-full rounded-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  );
}

export function PostedBySection({
  displayName,
  verified,
  avatarUrl,
  variant,
}: Props) {
  const inner = (
    <>
      <h4 id="posted-by-heading">Posted by</h4>
      <div className="requester">
        <RequesterAvatar displayName={displayName} avatarUrl={avatarUrl} />
        <div>
          <strong>{displayName}</strong>
        </div>
        {verified ? (
          <span className="verified">
            <FigmaIcon name="check" size={12} /> Verified
          </span>
        ) : null}
      </div>
    </>
  );

  if (variant === "drawer") {
    return (
      <div className="posted-by-block" aria-labelledby="posted-by-heading">
        {inner}
      </div>
    );
  }

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="posted-by-heading-page"
    >
      <h2
        id="posted-by-heading-page"
        className="text-lg font-medium text-stone-900 dark:text-stone-100"
      >
        Posted by
      </h2>
      <div className="requester text-on-light-surface max-w-lg rounded-xl bg-stone-50 p-4 dark:bg-stone-900/40">
        <RequesterAvatar displayName={displayName} avatarUrl={avatarUrl} />
        <div>
          <strong>{displayName}</strong>
        </div>
        {verified ? (
          <span className="verified">
            <FigmaIcon name="check" size={12} /> Verified
          </span>
        ) : null}
      </div>
    </section>
  );
}
