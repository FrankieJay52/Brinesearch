import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "map"
  | "search"
  | "saved"
  | "more"
  | "route"
  | "graph"
  | "google"
  | "location"
  | "company"
  | "settings"
  | "offline"
  | "update"
  | "feed"
  | "control"
  | "account"
  | "back"
  | "close"
  | "share"
  | "sun"
  | "moon";

const paths: Record<IconName, ReactNode> = {
  map: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z"/><path d="M8 3v15M16 6v15"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  saved: <path d="M6 4h12v17l-6-4-6 4Z"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  route: <><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3"/></>,
  graph: <><circle cx="5" cy="17" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="19" cy="17" r="2"/><path d="m6.4 15.6 4.2-7.2m2.8 0 4.2 7.2M7 17h10"/></>,
  google: <><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 12h-8"/></>,
  location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  company: <><path d="M4 21V7l8-4v18M12 9h8v12M2 21h20"/><path d="M7 9h2M7 13h2M7 17h2M15 13h2M15 17h2"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.8-1L14.5 3h-5l-.4 3a7 7 0 0 0-1.8 1L5 6.1 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.3-1a7 7 0 0 0 1.8 1l.4 3h5l.4-3a7 7 0 0 0 1.8-1l2.3 1 2-3.5-2.1-1.5a7 7 0 0 0 .1-1Z"/></>,
  offline: <><path d="M5 9a9 9 0 0 1 14 0M8 13a5 5 0 0 1 8 0M12 18h.01"/><path d="m3 3 18 18"/></>,
  update: <><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.2-1L20 12M4 12l2.7 5a7 7 0 0 0 11.2-1"/></>,
  feed: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  control: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></>,
  account: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  back: <path d="m15 18-6-6 6-6"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  share: <><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  moon: <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>,
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  );
}
