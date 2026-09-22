import { DesignCard } from "@/components/generation/design-card";
import type { Design } from "@/types/supabase";

export function DesignGallery({
  designs,
  showProjectNames,
  projectNameById,
}: {
  designs: Design[];
  showProjectNames?: boolean;
  projectNameById?: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {designs.map((design) => (
        <DesignCard
          key={design.id}
          design={design}
          projectName={showProjectNames ? projectNameById?.[design.project_id] : undefined}
        />
      ))}
    </div>
  );
}
