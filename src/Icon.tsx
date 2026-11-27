type IconName =
  | "write"
  | "history"
  | "sliders"
  | "chart"
  | "leaf"
  | "book"
  | "heart"
  | "chat"
  | "art"
  | "target"
  | "home"
  | "work"
  | "arrow"
  | "plus";
const paths: Record<IconName, string> = {
  write: "M12 20h8M16 3l5 5L9 20l-6 1 1-6L16 3ZM14 5l5 5",
  history: "M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2",
  sliders: "M4 7h8m4 0h4M4 17h3m4 0h9M12 4v6M7 14v6",
  chart: "M4 4v16h16M8 15v-4m5 4V7m5 8V4",
  leaf: "M12 21v-9M12 16C4 16 3 11 3 7c6 0 9 3 9 9ZM12 12c0-6 4-9 9-9 0 6-3 9-9 9Z",
  book: "M12 5v16M12 5C8 3 5 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-6-1-10 1Z",
  heart: "M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 2 10 8 15 6-5 13-10 8-15Z",
  chat: "M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4ZM8 10h8M8 14h5",
  art: "M12 3a9 9 0 1 0 0 18h2c2 0 2-2 1-3s-1-3 1-3h2c5 0 4-12-6-12ZM7 9h.01M11 6h.01M16 8h.01M6 14h.01",
  target:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-5h.01",
  home: "M3 10l9-7 9 7M5 9v12h14V9M9 21v-7h6v7",
  work: "M8 7V3h8v4M3 7h18v14H3V7ZM3 12c6 3 12 3 18 0M12 12v4",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  plus: "M12 5v14M5 12h14",
};
export function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export const statusIcons: IconName[] = [
  "book",
  "heart",
  "chat",
  "art",
  "home",
  "work",
];
export const navIcons: IconName[] = [
  "write",
  "history",
  "sliders",
  "chart",
  "target",
];
