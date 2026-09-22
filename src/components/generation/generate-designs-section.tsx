"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { startGenerationAction } from "@/app/actions/generation";
import { jobStatusLabel } from "@/config/generation";
import type { GenerationJob } from "@/types/supabase";

const ACTIVE_STATUSES = new Set(["queued", "processing"]);
const POLL_INTERVAL_MS = 700;

export function GenerateDesignsSection({
  projectId,
  initialJob,
  canGenerate,
  disabledReason,
}: {
  projectId: string;
  initialJob: GenerationJob | null;
  canGenerate: boolean;
  disabledReason: string | null;
}) {
  const router = useRouter();
  const [job, setJob] = React.useState<GenerationJob | null>(initialJob);
  const [isStarting, setIsStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const isActive = isStarting || (job ? ACTIVE_STATUSES.has(job.status) : false);

  async function handleGenerate() {
    if (isActive) return;
    setIsStarting(true);
    setError(null);

    // Real, honest progress: the Server Action below processes designs one
    // at a time and commits each design/job update to the database as it
    // goes (see generation-service.ts). This poll reads those same rows
    // directly through the browser's RLS-protected client while that
    // action is still in flight, so the progress shown here reflects
    // actual server-side state, not a simulated animation. A later, truly
    // async provider would replace this poll with a realtime subscription
    // or push update — the persisted job/design rows are already the
    // right handoff point for that.
    const supabase = createClient();
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("generation_jobs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setJob(data);
    }, POLL_INTERVAL_MS);

    const result = await startGenerationAction({ projectId }).catch(() => null);

    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (!result) {
      setError("Something went wrong starting generation. Please try again.");
    } else if (!result.ok) {
      setError(result.error);
    } else {
      const { data: finalJob } = await supabase
        .from("generation_jobs")
        .select("*")
        .eq("id", result.data.jobId)
        .maybeSingle();
      if (finalJob) setJob(finalJob);
    }

    setIsStarting(false);
    router.refresh();
  }

  if (isActive) {
    const total = job?.requested_count ?? 0;
    const done = (job?.completed_count ?? 0) + (job?.failed_count ?? 0);
    const progress = job?.progress ?? (isStarting && !job ? 2 : 0);

    return (
      <Card className="border-accent bg-accent/40">
        <CardContent className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Generating designs&hellip;</p>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {total > 0
                  ? `Generating design ${Math.min(done + 1, total)} of ${total}… (${done} of ${total} complete)`
                  : "Preparing prompts…"}
              </p>
            </div>
          </div>
          <div
            role="progressbar"
            aria-label="Design generation progress"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-brand-gradient transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (job && (job.status === "completed" || job.status === "partially_completed" || job.status === "failed")) {
    const isFailure = job.status === "failed";
    const isPartial = job.status === "partially_completed";

    return (
      <Card className={isFailure ? "border-destructive/40 bg-destructive/5" : "border-accent bg-accent/40"}>
        <CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-white ${
                isFailure ? "bg-destructive" : "bg-brand-gradient"
              }`}
            >
              {isFailure ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
            </span>
            <div>
              <p className="text-sm font-semibold">{jobStatusLabel(job.status)}</p>
              <p className="text-sm text-muted-foreground">
                {job.completed_count} of {job.requested_count} design
                {job.requested_count === 1 ? "" : "s"} generated
                {job.failed_count > 0 ? `, ${job.failed_count} failed` : ""}.
                {isPartial && " Failed designs can be retried individually below."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleGenerate}
            disabled={!canGenerate}
            title={!canGenerate ? (disabledReason ?? undefined) : undefined}
          >
            <RefreshCw className="size-4" />
            Generate more
          </Button>
        </CardContent>
        {error && <p className="px-5 pb-4 text-sm text-destructive">{error}</p>}
      </Card>
    );
  }

  return (
    <Card className="border-accent bg-accent/40">
      <CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-gradient text-white">
            <Sparkles className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Ready to generate</p>
            <p className="text-sm text-muted-foreground">
              {canGenerate
                ? "Start the Phase 5 mock generation pipeline for this product."
                : (disabledReason ?? "This product isn't ready for generation yet.")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="brand"
          onClick={handleGenerate}
          disabled={!canGenerate}
          title={!canGenerate ? (disabledReason ?? undefined) : undefined}
        >
          <Sparkles className="size-4" />
          Generate Designs
        </Button>
      </CardContent>
      {error && <p className="px-5 pb-4 text-sm text-destructive">{error}</p>}
    </Card>
  );
}
