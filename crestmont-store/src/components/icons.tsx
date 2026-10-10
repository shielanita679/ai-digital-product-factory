import type { SVGProps } from "react";

/**
 * Icon set: 24px grid, 1.5px stroke, round caps. Keep new icons consistent
 * with these so the interface reads as one system.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => (<Icon {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Icon>);
export const BagIcon = (p: IconProps) => (<Icon {...p}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></Icon>);
export const UserIcon = (p: IconProps) => (<Icon {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></Icon>);
export const MenuIcon = (p: IconProps) => (<Icon {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>);
export const CloseIcon = (p: IconProps) => (<Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>);
export const PlusIcon = (p: IconProps) => (<Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>);
export const MinusIcon = (p: IconProps) => (<Icon {...p}><path d="M5 12h14" /></Icon>);
export const ArrowRightIcon = (p: IconProps) => (<Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>);
export const ChevronDownIcon = (p: IconProps) => (<Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>);
export const ChevronRightIcon = (p: IconProps) => (<Icon {...p}><path d="m9 6 6 6-6 6" /></Icon>);
export const LockIcon = (p: IconProps) => (<Icon {...p}><rect x="5" y="10.5" width="14" height="9.5" rx="1.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></Icon>);
export const TruckIcon = (p: IconProps) => (<Icon {...p}><path d="M3 6.5h11v9.5H3zM14 10h3.5l3 3v3H14" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></Icon>);
export const ReturnIcon = (p: IconProps) => (<Icon {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Icon>);
export const MailIcon = (p: IconProps) => (<Icon {...p}><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" /><path d="m4 7 8 6 8-6" /></Icon>);
export const InfoIcon = (p: IconProps) => (<Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></Icon>);
export const DocIcon = (p: IconProps) => (<Icon {...p}><path d="M7 3.5h7l4 4v13H7z" /><path d="M14 3.5v4h4M9.5 12h6M9.5 15.5h6" /></Icon>);
export const BoxIcon = (p: IconProps) => (<Icon {...p}><path d="m12 3.5 8 4v9l-8 4-8-4v-9z" /><path d="m4 7.5 8 4 8-4M12 11.5v9" /></Icon>);
export const CheckIcon = (p: IconProps) => (<Icon {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>);
export const TrashIcon = (p: IconProps) => (<Icon {...p}><path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7" /></Icon>);
