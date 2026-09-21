import * as lucide from "lucide";

type IconNode = Parameters<typeof lucide.createElement>[0];

const icons = lucide as unknown as Record<string, IconNode>;

const PATHS: Record<string, IconNode> = {
  layers: icons.Layers,
  "circle-check": icons.CircleCheck,
  settings: icons.Settings,
  "refresh-cw": icons.RefreshCw,
  search: icons.Search,
  "list-filter": icons.ListFilter,
  check: icons.Check,
  x: icons.X,
  "arrow-up-down": icons.ArrowUpDown,
  "search-x": icons.SearchX,
  "chevron-down": icons.ChevronDown,
  "trash-2": icons.Trash2,
  "external-link": icons.ExternalLink,
  "triangle-alert": icons.TriangleAlert,
  "circle-alert": icons.CircleAlert,
  "table-2": icons.Table2,
};

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, size = 16, extra: Record<string, string> = {}): string {
  const node = PATHS[name] ?? icons.Circle;
  const svg = lucide.createElement(node, {
    width: String(size),
    height: String(size),
    "stroke-width": "1.8",
    "aria-hidden": "true",
    ...extra,
  });
  return svg.outerHTML;
}
