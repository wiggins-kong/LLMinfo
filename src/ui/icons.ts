import * as lucide from "lucide";

type IconNode = Parameters<typeof lucide.createElement>[0];

const icons = lucide as unknown as Record<string, IconNode>;

const PATHS: Record<string, IconNode> = {
  layers: icons.Layers,
  "circle-check": icons.CircleCheck,
  "sun-moon": icons.SunMoon,
  "rows-3": icons.Rows3,
  "table-2": icons.Table2,
  "chart-scatter": icons.ChartScatter,
  "git-compare": icons.GitCompare,
  star: icons.Star,
  calculator: icons.Calculator,
  download: icons.Download,
  settings: icons.Settings,
  "refresh-cw": icons.RefreshCw,
  search: icons.Search,
  "list-filter": icons.ListFilter,
  "file-spreadsheet": icons.FileSpreadsheet,
  "file-json": icons.FileJson,
  check: icons.Check,
  x: icons.X,
  "arrow-up-down": icons.ArrowUpDown,
  "search-x": icons.SearchX,
  "chevron-down": icons.ChevronDown,
  "save": icons.Save,
  "trash-2": icons.Trash2,
  "upload": icons.Upload,
  "database": icons.Database,
  "external-link": icons.ExternalLink,
  "triangle-alert": icons.TriangleAlert,
  "circle-alert": icons.CircleAlert,
  "loader-circle": icons.LoaderCircle,
  "chart-column": icons.ChartColumn,
  "sliders-horizontal": icons.SlidersHorizontal,
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
