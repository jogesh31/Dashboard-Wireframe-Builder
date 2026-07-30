// Full BI visual catalog. Every entry is draggable from the library onto the canvas.
// family = which renderer template is used; iconKind = which glyph (visualIcons.js) represents it.

function item(type, label, group, family, iconKind, w, h, content = {}, style = {}) {
  return { type, label, group, family, iconKind, defaultW: w, defaultH: h, content: { title: label, ...content }, style };
}

const CARTESIAN = { axisX: "Category", axisY: "Value" };
const LEGEND2 = { legend: "Series A, Series B" };

export const VISUAL_CATALOG = [
  // ---- Bar & Column ----
  item("bar-chart", "Bar Chart", "Bar & Column", "chart", "bars-h", 320, 220, { subtitle: "By category", ...CARTESIAN }),
  item("column-chart", "Column Chart", "Bar & Column", "chart", "bars-v", 320, 220, { subtitle: "By category", ...CARTESIAN }),
  item("stacked-bar", "Stacked Bar", "Bar & Column", "chart", "stacked-h", 320, 220, { subtitle: "By category", ...CARTESIAN, ...LEGEND2 }),
  item("stacked-column", "Stacked Column", "Bar & Column", "chart", "stacked-v", 320, 220, { subtitle: "By category", ...CARTESIAN, ...LEGEND2 }),
  item("clustered-bar", "Clustered Bar", "Bar & Column", "chart", "clustered-h", 320, 220, { subtitle: "By category", ...CARTESIAN, ...LEGEND2 }),
  item("clustered-column", "Clustered Column", "Bar & Column", "chart", "clustered-v", 320, 220, { subtitle: "By category", ...CARTESIAN, ...LEGEND2 }),

  // ---- Line & Area ----
  item("line-chart", "Line Chart", "Line & Area", "chart", "line", 340, 220, { subtitle: "Trend over time", axisX: "Date", axisY: "Value" }),
  item("area-chart", "Area Chart", "Line & Area", "chart", "area", 340, 220, { subtitle: "Trend over time", axisX: "Date", axisY: "Value" }),
  item("combo-chart", "Combo Chart", "Line & Area", "chart", "combo", 340, 220, { subtitle: "Two measures", axisX: "Date", axisY: "Value", ...LEGEND2 }),
  item("ribbon-chart", "Ribbon Chart", "Line & Area", "chart", "ribbon", 340, 220, { subtitle: "Rank over time", axisX: "Date", axisY: "Rank", ...LEGEND2 }),
  item("sparkline", "Sparkline", "Line & Area", "chart", "sparkline", 160, 60, { subtitle: "" }),

  // ---- Pie & Part-to-whole ----
  item("pie-chart", "Pie Chart", "Pie & Part-to-whole", "chart", "pie", 240, 220, { subtitle: "Share of total", category: "Category", value: "Value" }),
  item("donut-chart", "Donut Chart", "Pie & Part-to-whole", "chart", "donut", 240, 220, { subtitle: "Share of total", category: "Category", value: "Value" }),
  item("treemap", "Treemap", "Pie & Part-to-whole", "chart", "treemap", 280, 220, { subtitle: "Hierarchical share", category: "Category", value: "Value" }),
  item("funnel", "Funnel", "Pie & Part-to-whole", "chart", "funnel", 260, 220, { subtitle: "Stage conversion", category: "Stage", value: "Count" }),

  // ---- Hierarchical & Flow ----
  item("sunburst", "Sunburst", "Hierarchical & Flow", "chart", "sunburst", 260, 240, { subtitle: "Nested hierarchy" }),
  item("sankey", "Sankey", "Hierarchical & Flow", "chart", "sankey", 340, 220, { subtitle: "Flow between stages" }),
  item("chord-diagram", "Chord Diagram", "Hierarchical & Flow", "chart", "chord", 260, 240, { subtitle: "Relationships" }),
  item("decomposition-tree", "Decomposition Tree", "Hierarchical & Flow", "chart", "dectree", 400, 240, { subtitle: "Drill breakdown" }),
  item("network-graph", "Network Graph", "Hierarchical & Flow", "chart", "network", 320, 240, { subtitle: "Node relationships" }),

  // ---- Statistical ----
  item("waterfall", "Waterfall", "Statistical", "chart", "waterfall", 320, 220, { subtitle: "Change breakdown", ...CARTESIAN }),
  item("scatter-plot", "Scatter Plot", "Statistical", "chart", "scatter", 300, 220, { subtitle: "Correlation", axisX: "X Measure", axisY: "Y Measure" }),
  item("bubble-chart", "Bubble Chart", "Statistical", "chart", "bubble", 300, 220, { subtitle: "Correlation + size", axisX: "X Measure", axisY: "Y Measure", legend: "Bubble size = Value" }),
  item("histogram", "Histogram", "Statistical", "chart", "histogram", 300, 220, { subtitle: "Distribution", axisX: "Bucket", axisY: "Frequency" }),
  item("box-plot", "Box Plot", "Statistical", "chart", "boxplot", 260, 220, { subtitle: "Distribution spread", ...CARTESIAN }),
  item("heatmap", "Heatmap", "Statistical", "chart", "heatmap", 280, 220, { subtitle: "Intensity grid", axisX: "Category", axisY: "Category" }),
  item("calendar-heatmap", "Calendar Heatmap", "Statistical", "chart", "calendar", 320, 200, { subtitle: "Activity by day" }),
  item("radar-chart", "Radar Chart", "Statistical", "chart", "radar", 260, 240, { subtitle: "Multi-metric comparison", ...LEGEND2 }),

  // ---- Cards & KPIs ----
  item("kpi-card", "KPI Card", "Cards & KPIs", "cardstat", "kpi", 200, 130, { subtitle: "vs. target", value: "1.24M", notes: "+8.2% YoY" }, { fontSize: 28, fontWeight: "700" }),
  item("card", "Card", "Cards & KPIs", "cardstat", "card", 180, 120, { value: "42", subtitle: "Total Count" }, { fontSize: 22, fontWeight: "700" }),
  item("multi-row-card", "Multi-row Card", "Cards & KPIs", "cardstat", "multirow", 220, 160, { subtitle: "" }, { fontSize: 14, fontWeight: "700" }),
  item("gauge", "Gauge", "Cards & KPIs", "cardstat", "gauge", 220, 190, { subtitle: "Progress to goal", value: "72%" }, { fontSize: 20, fontWeight: "700" }),
  item("bullet-chart", "Bullet Chart", "Cards & KPIs", "cardstat", "bullet", 260, 110, { subtitle: "Actual vs target" }),
  item("key-influencers", "Key Influencers", "Cards & KPIs", "cardstat", "influencers", 280, 200, { subtitle: "What influences Value" }),
  item("infographic-card", "Infographic Cards", "Cards & KPIs", "cardstat", "infographic", 220, 180, { subtitle: "" }, { fontSize: 20, fontWeight: "700" }),

  // ---- Tables & Matrix ----
  item("matrix", "Matrix", "Tables & Matrix", "table", "matrix", 400, 260, { subtitle: "" }),
  item("table", "Table", "Tables & Matrix", "table", "table", 420, 260, { subtitle: "" }),
  item("pivot-table", "Pivot Table", "Tables & Matrix", "table", "pivot", 420, 260, { subtitle: "" }),

  // ---- Maps ----
  item("map", "Map", "Maps", "map", "map", 320, 260, { subtitle: "Geographic distribution" }),
  item("filled-map", "Filled Map", "Maps", "map", "map", 320, 260, { subtitle: "Choropleth by region" }),
  item("shape-map", "Shape Map", "Maps", "map", "map", 320, 260, { subtitle: "Custom shape regions" }),
  item("azure-map", "Azure Map", "Maps", "map", "map", 320, 260, { subtitle: "Azure Maps visual" }),
  item("arc-map", "Arc Map", "Maps", "map", "map", 320, 260, { subtitle: "Origin-destination arcs" }),

  // ---- Time & Gantt ----
  item("timeline", "Timeline", "Time & Gantt", "chart", "timeline", 360, 140, { subtitle: "Milestones" }),
  item("gantt-chart", "Gantt Chart", "Time & Gantt", "chart", "gantt", 380, 220, { subtitle: "Project schedule", axisX: "Timeline", axisY: "Task" }),

  // ---- Advanced / Other ----
  item("text-only", "Text Only (no visual)", "Advanced / Other", "text", "textbox", 300, 60, { text: "Text" }, { background: "transparent", borderWidth: 0 }),
  item("small-multiples", "Small Multiples", "Advanced / Other", "chart", "smallmultiples", 320, 240, { subtitle: "Repeated by category" }),
  item("word-cloud", "Word Cloud", "Advanced / Other", "chart", "wordcloud", 280, 200, { subtitle: "Term frequency" }),
  item("icon-grid", "Icon Grid", "Advanced / Other", "chart", "icongrid", 260, 200, { subtitle: "" }),

  // ---- Filters ----
  item("slicer", "Slicer", "Filters", "filter", "list", 220, 140, { subtitle: "", category: "Field Name" }),
  item("dropdown-slicer", "Dropdown Slicer", "Filters", "filter", "dropdown", 220, 76, { category: "Field Name" }),
  item("date-slicer", "Date Slicer", "Filters", "filter", "date", 220, 200, { category: "Date Field" }),
  item("hierarchy-slicer", "Hierarchy Slicer", "Filters", "filter", "hierarchy", 220, 160, { category: "Hierarchy" }),
  item("numeric-slider", "Numeric Slider", "Filters", "filter", "slider", 220, 76, { category: "Measure Range" }),

  // ---- Containers & Shapes ----
  item("text-box", "Text Box", "Containers & Shapes", "text", "textbox", 240, 60, { text: "Text box" }, { background: "transparent", borderWidth: 0 }),
  item("image", "Image", "Containers & Shapes", "image", "image", 240, 160, {}, { borderWidth: 1, borderColor: "#c7cad1" }),
  item("logo", "Logo", "Containers & Shapes", "image", "logo", 100, 100, {}, { borderWidth: 1, borderColor: "#c7cad1" }),
  item("button", "Button", "Containers & Shapes", "button", "button", 140, 40, { text: "Button" }, { background: "#6366f1", color: "#ffffff", borderWidth: 0, borderRadius: 6, fontSize: 14, fontWeight: "600" }),
  item("shape", "Shape", "Containers & Shapes", "shape", "iconShape", 120, 120, { shapeType: "star" }, { background: "transparent", borderWidth: 0, color: "#6366f1" }),
  item("rectangle", "Rectangle", "Containers & Shapes", "shape", "rect", 160, 110, { shapeType: "rect" }, { background: "#e7e9ee", borderColor: "#b7bac4", borderWidth: 1.5 }),
  item("circle", "Circle", "Containers & Shapes", "shape", "circle", 140, 140, { shapeType: "circle" }, { background: "#e7e9ee", borderColor: "#b7bac4", borderWidth: 1.5, borderRadius: 999 }),
  item("line", "Line", "Containers & Shapes", "shape", "lineShape", 200, 3, { shapeType: "line" }, { background: "#8a8fa0", borderWidth: 0 }),
  item("divider", "Divider", "Containers & Shapes", "shape", "divider", 320, 2, { shapeType: "divider" }, { background: "#d7d9e0", borderWidth: 0 }),
  item("icons", "Icons", "Containers & Shapes", "icon", "iconShape", 48, 48, {}, { background: "transparent", borderWidth: 0, color: "#6366f1" }),
  item("section-header", "Section Header", "Containers & Shapes", "sectionHeader", "sectionHeader", 400, 50, { text: "Section Header" }, { background: "transparent", borderWidth: 0, fontSize: 15, fontWeight: "700" }),
  item("group-container", "Group Container", "Containers & Shapes", "groupContainer", "groupContainer", 420, 300, { text: "Group" }, { background: "transparent", borderColor: "#9aa0ae", borderWidth: 1.5 }),
];

export const GROUP_ORDER = [
  "Bar & Column",
  "Line & Area",
  "Pie & Part-to-whole",
  "Hierarchical & Flow",
  "Statistical",
  "Cards & KPIs",
  "Tables & Matrix",
  "Maps",
  "Time & Gantt",
  "Advanced / Other",
  "Filters",
  "Containers & Shapes",
];

export function getVisualDef(type) {
  return VISUAL_CATALOG.find((v) => v.type === type);
}

export function groupedCatalog() {
  const map = new Map();
  GROUP_ORDER.forEach((g) => map.set(g, []));
  VISUAL_CATALOG.forEach((v) => {
    if (!map.has(v.group)) map.set(v.group, []);
    map.get(v.group).push(v);
  });
  return map;
}
