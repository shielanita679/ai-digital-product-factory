import { DesignCard } from "@/components/generation/design-card";
import type { Design, Vectorization } from "@/types/supabase";

export function DesignGallery({
  designs,
  displayUrlById,
  vectorizationByDesignId,
  vectorPreviewUrlByVectorizationId,
  showProjectNames,
  projectNameById,
}: {
  designs: Design[];
  /** From resolveDesignDisplayUrls — server-resolved so no component generates its own signed URLs. */
  displayUrlById: Map<string, string | null>;
  /** From resolveVectorizationsForDesigns — keyed by design_id. Omitted (or empty) before the Phase 7 migration is applied. */
  vectorizationByDesignId?: Map<string, Vectorization>;
  /** From resolveVectorDisplayUrls — keyed by vectorization id. */
  vectorPreviewUrlByVectorizationId?: Map<string, string | null>;
  showProjectNames?: boolean;
  projectNameById?: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {designs.map((design) => {
        const vectorization = vectorizationByDesignId?.get(design.id) ?? null;
        return (
          <DesignCard
            key={design.id}
            design={design}
            displayUrl={displayUrlById.get(design.id) ?? null}
            vectorization={vectorization}
            vectorPreviewUrl={vectorization ? (vectorPreviewUrlByVectorizationId?.get(vectorization.id) ?? null) : null}
            projectName={showProjectNames ? projectNameById?.[design.project_id] : undefined}
          />
        );
      })}
    </div>
  );
}
