type EngagementCalloutProps = {
  tone: "info" | "warning";
  title: string;
  children: string;
};

export function EngagementCallout({
  tone,
  title,
  children,
}: EngagementCalloutProps) {
  return (
    <div
      className={`engagement-callout engagement-callout--${tone}`}
      role="note"
    >
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
