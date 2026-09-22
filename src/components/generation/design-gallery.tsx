import { DesignCard } from "@/components/generation/design-card";
import type { Design } from "@/types/supabase";

export function DesignGallery({
  designs,
  displayUrlById,
  showProjectNames,
  projectNameById,
}: {
  designs: Design[];
  /** From resolveDesignDisplayUrls — server-resolved so no component generates its own signed URLs. */
  displayUrlById: Map<string, string | null>;
  showProjectNames?: boolean;
  projectNameById?: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {designs.map((design) => (
        <DesignCard
          key={design.id}
          design={design}
          displayUrl={displayUrlById.get(design.id) ?? null}
          projectName={showProjectNames ? projectNameById?.[design.project_id] : undefined}
        />
      ))}
    </div>
  );
}
