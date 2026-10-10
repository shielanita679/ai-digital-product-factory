/**
 * Pre-launch readiness check. Run: npm run check:launch
 * Exits non-zero while any business term, credential or catalog item still
 * needs attention. Load your production environment variables first, e.g.
 *   node --env-file=.env.production.local ./node_modules/.bin/tsx scripts/check-launch.ts
 */
import { getLaunchIssues } from "../src/lib/launch";

const issues = getLaunchIssues();
if (issues.length === 0) {
  console.log("✓ Launch check passed. All configured terms, credentials and catalog entries are in place.");
  process.exit(0);
}
console.log(`Launch check: ${issues.length} item(s) need attention before taking real orders:\n`);
for (const issue of issues) console.log(`  • ${issue}`);
console.log("\nSee docs/LAUNCH_CHECKLIST.md for details.");
process.exit(1);
