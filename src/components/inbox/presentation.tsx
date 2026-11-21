export function Avatar({ name }: { name: string }) {
  return <span className="inbox-avatar" aria-hidden="true">{Array.from(name.trim())[0] || "?"}</span>;
}
export function timeLabel(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString() === new Date().toLocaleDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}
