/**
 * Stand-in for Supabase Auth until Phase 2 wires up real authentication.
 * Simulates network latency so the UI states (loading/disabled) are testable now.
 */
export async function submitAuthPlaceholder() {
  await new Promise((resolve) => setTimeout(resolve, 700));
}
