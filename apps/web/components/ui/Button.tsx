export function Button({
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "purple";
}) {
  const cls =
    variant === "ghost" ? "oq-btn oq-btn--ghost" : variant === "purple" ? "oq-btn oq-btn--purple" : "oq-btn";
  return <button {...props} className={`${cls} ${props.className ?? ""}`} />;
}
