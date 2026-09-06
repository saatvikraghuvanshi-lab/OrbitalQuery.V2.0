export function Badge({
  tone = "lime",
  children,
}: {
  tone?: "lime" | "purple" | "blue" | "orange";
  children: React.ReactNode;
}) {
  const cls =
    tone === "purple"
      ? "oq-badge oq-badge--purple"
      : tone === "blue"
        ? "oq-badge oq-badge--blue"
        : tone === "orange"
          ? "oq-badge oq-badge--orange"
          : "oq-badge";
  return <span className={cls}>{children}</span>;
}
