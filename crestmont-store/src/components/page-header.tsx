import { Breadcrumbs, type Crumb } from "./breadcrumbs";

export function PageHeader({ title, intro, crumbs, eyebrow }: { title: string; intro?: React.ReactNode; crumbs?: Crumb[]; eyebrow?: string }) {
  return (
    <div className="border-b border-line">
      <div className="page-x py-10 sm:py-14">
        {crumbs && <Breadcrumbs items={crumbs} />}
        {eyebrow && <p className="eyebrow mt-6">{eyebrow}</p>}
        <h1 className={`${eyebrow ? "mt-2" : crumbs ? "mt-6" : ""} text-4xl sm:text-5xl`}>{title}</h1>
        {intro && <div className="mt-4 max-w-2xl text-ink-2">{intro}</div>}
      </div>
    </div>
  );
}
