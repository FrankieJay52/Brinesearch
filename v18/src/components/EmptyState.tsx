import { Icon, type IconName } from "./Icon";

export function EmptyState({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return <section className="empty-state"><Icon name={icon}/><h2>{title}</h2><p>{body}</p></section>;
}
