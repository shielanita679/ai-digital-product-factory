/**
 * Renders a configurable business term, or a clearly marked placeholder when
 * the owner hasn't set it yet. Placeholders are deliberately visible so an
 * unconfirmed term can never be mistaken for a real commitment.
 */
export function Setting({ value, label }: { value: string | number | null | undefined; label: string }) {
  if (value === null || value === undefined || value === "") {
    return (
      <span className="rounded-[2px] bg-notice px-1 py-px text-notice-ink" title="This term has not been confirmed by the store yet.">
        [{label} — to be confirmed]
      </span>
    );
  }
  return <>{value}</>;
}
