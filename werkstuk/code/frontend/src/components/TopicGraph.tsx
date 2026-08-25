import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { courseRing } from "../lib/courseColors";
import type { GraphCourse, GraphEdge, GraphNode } from "../lib/types";

const FONT = '600 12px "Source Sans 3", ui-sans-serif, system-ui, sans-serif';
const PAD_X = 18;
const LINE_HEIGHT = 14;
const MIN_RX = 52;
const MIN_RY = 18;
const GAP_X = 28;
const LAYER_GAP = 96;
const TODO = "#ffffff";
const PATTERN = "#8a93a3";
const LINK = "#b8c0cc";
const LINK_HOT = "#2f7de1";

type LaidOut = GraphNode & {
  x: number;
  y: number;
  rx: number;
  ry: number;
  lines: string[];
};

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

function reverseDoorPairs(edges: GraphEdge[]): Set<string> {
  const doors = new Set(
    edges
      .filter((edge) => edge.kind === "prerequisite")
      .map((edge) => `${edge.from_id}\0${edge.to_id}`),
  );
  const pairs = new Set<string>();
  for (const edge of edges) {
    if (
      edge.kind === "encompassing" &&
      doors.has(`${edge.to_id}\0${edge.from_id}`)
    ) {
      pairs.add(pairKey(edge.from_id, edge.to_id));
    }
  }
  return pairs;
}

const CLEAR = 12;
const PATH_STEPS = 24;

function insideOval(x: number, y: number, node: LaidOut, pad: number): boolean {
  const dx = (x - node.x) / (node.rx + pad);
  const dy = (y - node.y) / (node.ry + pad);
  return dx * dx + dy * dy < 1;
}

function cubicPoint(
  x1: number,
  y1: number,
  cx1: number,
  cy1: number,
  cx2: number,
  cy2: number,
  x2: number,
  y2: number,
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x:
      u * u * u * x1 +
      3 * u * u * t * cx1 +
      3 * u * t * t * cx2 +
      t * t * t * x2,
    y:
      u * u * u * y1 +
      3 * u * u * t * cy1 +
      3 * u * t * t * cy2 +
      t * t * t * y2,
  };
}

function sampleCubic(
  x1: number,
  y1: number,
  cx1: number,
  cy1: number,
  cx2: number,
  cy2: number,
  x2: number,
  y2: number,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let step = 1; step < PATH_STEPS; step += 1) {
    points.push(
      cubicPoint(x1, y1, cx1, cy1, cx2, cy2, x2, y2, step / PATH_STEPS),
    );
  }
  return points;
}

function pathHits(
  points: { x: number; y: number }[],
  others: LaidOut[],
): boolean {
  for (const point of points) {
    for (const node of others) {
      if (insideOval(point.x, point.y, node, CLEAR)) {
        return true;
      }
    }
  }
  return false;
}

function linkPath(
  source: LaidOut,
  target: LaidOut,
  kind: GraphEdge["kind"],
  nodes: LaidOut[],
  nudgeX: number,
): string {
  const goingDown = source.y <= target.y;
  const x1 = source.x + nudgeX;
  const y1 = goingDown ? source.y + source.ry : source.y - source.ry;
  const x2 = target.x + nudgeX;
  const y2 = goingDown ? target.y - target.ry : target.y + target.ry;
  const others = nodes.filter(
    (node) => node.id !== source.id && node.id !== target.id,
  );
  const preferred = kind === "encompassing" ? -1 : 1;
  const k = (y2 - y1) * 0.45;

  function smooth(bow: number, side: number): string {
    return `M${x1},${y1} C${x1 + side * bow},${y1 + k} ${x2 + side * bow},${y2 - k} ${x2},${y2}`;
  }

  function smoothHits(bow: number, side: number): boolean {
    return pathHits(
      sampleCubic(
        x1,
        y1,
        x1 + side * bow,
        y1 + k,
        x2 + side * bow,
        y2 - k,
        x2,
        y2,
      ),
      others,
    );
  }

  if (!smoothHits(0, 1)) {
    return smooth(0, 1);
  }

  for (const side of [preferred, -preferred]) {
    for (const bow of [40, 80, 120, 160, 220]) {
      if (!smoothHits(bow, side)) {
        return smooth(bow, side);
      }
    }
  }

  const top = Math.min(y1, y2);
  const bot = Math.max(y1, y2);
  const blocking = others.filter(
    (node) => node.y + node.ry + CLEAR > top && node.y - node.ry - CLEAR < bot,
  );
  const kOut = Math.sign(y2 - y1) * Math.min(28, Math.abs(y2 - y1) * 0.2);
  const midY = (y1 + y2) / 2;

  function around(rail: number): string {
    return `M${x1},${y1} C${x1},${y1 + kOut} ${rail},${y1 + kOut} ${rail},${midY} C${rail},${y2 - kOut} ${x2},${y2 - kOut} ${x2},${y2}`;
  }

  function aroundHits(rail: number): boolean {
    const first = sampleCubic(
      x1,
      y1,
      x1,
      y1 + kOut,
      rail,
      y1 + kOut,
      rail,
      midY,
    );
    const second = sampleCubic(
      rail,
      midY,
      rail,
      y2 - kOut,
      x2,
      y2 - kOut,
      x2,
      y2,
    );
    return pathHits([...first, ...second], others);
  }

  for (const side of [preferred, -preferred]) {
    const wall =
      side > 0
        ? Math.max(x1, x2, ...blocking.map((node) => node.x + node.rx))
        : Math.min(x1, x2, ...blocking.map((node) => node.x - node.rx));
    for (const extra of [24, 56, 88, 128, 168]) {
      const rail = wall + side * extra;
      if (!aroundHits(rail)) {
        return around(rail);
      }
    }
  }

  return smooth(0, 1);
}

let measureCtx: CanvasRenderingContext2D | null = null;

function measure(text: string): number {
  if (measureCtx == null) {
    const canvas = document.createElement("canvas");
    measureCtx = canvas.getContext("2d");
  }
  if (measureCtx == null) {
    return text.length * 7;
  }
  measureCtx.font = FONT;
  return measureCtx.measureText(text).width;
}

function splitTitle(title: string): string[] {
  const words = title
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length < 2) {
    return [title];
  }
  const oneLine = measure(title);
  let best = [title];
  let bestWidth = oneLine;
  for (let index = 1; index < words.length; index += 1) {
    const first = words.slice(0, index).join(" ");
    const second = words.slice(index).join(" ");
    const width = Math.max(measure(first), measure(second));
    if (width < bestWidth) {
      bestWidth = width;
      best = [first, second];
    }
  }
  return bestWidth < oneLine ? best : [title];
}

function sizeFor(title: string): { lines: string[]; rx: number; ry: number } {
  const lines = splitTitle(title);
  const widest = Math.max(...lines.map(measure));
  return {
    lines,
    rx: Math.max(MIN_RX, widest / 2 + PAD_X),
    ry: Math.max(MIN_RY, (lines.length * LINE_HEIGHT) / 2 + 10),
  };
}

function layout(nodes: GraphNode[], edges: GraphEdge[]): LaidOut[] {
  const sized = new Map(
    nodes.map((node) => [node.id, sizeFor(node.title)] as const),
  );
  const incoming = new Map<string, string[]>();
  for (const node of nodes) {
    incoming.set(node.id, []);
  }
  for (const edge of edges) {
    if (edge.kind !== "prerequisite") {
      continue;
    }
    incoming.get(edge.to_id)?.push(edge.from_id);
  }

  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  function dep(id: string): number {
    const known = depth.get(id);
    if (known != null) {
      return known;
    }
    if (visiting.has(id)) {
      return 0;
    }
    visiting.add(id);
    const pres = incoming.get(id) ?? [];
    const next = pres.length === 0 ? 0 : 1 + Math.max(0, ...pres.map(dep));
    visiting.delete(id);
    depth.set(id, next);
    return next;
  }

  for (const node of nodes) {
    dep(node.id);
  }

  const buckets = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const layer = depth.get(node.id) ?? 0;
    const list = buckets.get(layer) ?? [];
    list.push(node);
    buckets.set(layer, list);
  }

  const pos = new Map<string, { x: number; y: number }>();
  const layers = [...buckets.keys()].sort((a, b) => a - b);

  for (const layer of layers) {
    const list = buckets.get(layer) ?? [];
    const placed = list.map((node, index) => {
      const parents = incoming.get(node.id) ?? [];
      const local = parents.filter((id) => (depth.get(id) ?? 0) === layer - 1);
      const anchors = local.length > 0 ? local : parents;
      const parentXs = anchors
        .map((id) => pos.get(id)?.x)
        .filter((x): x is number => x != null);
      const fallbackGap = (sized.get(node.id)?.rx ?? MIN_RX) * 2 + GAP_X;
      const x =
        parentXs.length > 0
          ? parentXs.reduce((sum, value) => sum + value, 0) / parentXs.length
          : (index - (list.length - 1) / 2) * fallbackGap;
      return { node, x };
    });
    placed.sort(
      (a, b) => a.x - b.x || a.node.title.localeCompare(b.node.title),
    );
    for (let index = 1; index < placed.length; index += 1) {
      const prev = sized.get(placed[index - 1].node.id);
      const curr = sized.get(placed[index].node.id);
      const min =
        placed[index - 1].x +
        (prev?.rx ?? MIN_RX) +
        (curr?.rx ?? MIN_RX) +
        GAP_X;
      if (placed[index].x < min) {
        placed[index].x = min;
      }
    }
    if (placed.length > 0) {
      const mid = (placed[0].x + placed[placed.length - 1].x) / 2;
      for (const item of placed) {
        item.x -= mid;
      }
    }
    for (const item of placed) {
      pos.set(item.node.id, { x: item.x, y: layer * LAYER_GAP });
    }
  }

  return nodes.map((node) => {
    const point = pos.get(node.id) ?? { x: 0, y: 0 };
    const size = sized.get(node.id) ?? sizeFor(node.title);
    return { ...node, ...point, ...size };
  });
}

export function TopicGraph({
  nodes,
  edges,
  courses,
  showEncompassing,
  onSelect,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  courses: GraphCourse[];
  showEncompassing: boolean;
  onSelect: (node: GraphNode) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // Keep the latest onSelect available to d3 click handlers without
  // redrawing the whole graph when the callback identity changes.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) {
        return;
      }
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || nodes.length === 0 || size.width === 0 || size.height === 0) {
      return;
    }

    const laid = layout(nodes, edges);
    const byId = new Map(laid.map((node) => [node.id, node]));
    const drawn = edges.filter((edge) =>
      showEncompassing
        ? edge.kind === "encompassing"
        : edge.kind === "prerequisite",
    );
    const splitPairs = reverseDoorPairs(drawn);
    const links = drawn
      .map((edge) => ({
        ...edge,
        source: byId.get(edge.from_id),
        target: byId.get(edge.to_id),
      }))
      .filter(
        (edge): edge is typeof edge & { source: LaidOut; target: LaidOut } =>
          edge.source != null && edge.target != null,
      );

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${size.width} ${size.height}`);

    const root = svg.append("g");
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 3])
      .on("zoom", (event) => {
        root.attr("transform", event.transform);
      });
    svg.call(zoom);

    const connected = new Map<string, Set<string>>();
    for (const node of laid) {
      connected.set(node.id, new Set());
    }
    for (const edge of links) {
      connected.get(edge.from_id)?.add(edge.to_id);
      connected.get(edge.to_id)?.add(edge.from_id);
    }

    const defs = svg.append("defs");
    function addArrow(id: string, fill: string, open = false) {
      const marker = defs
        .append("marker")
        .attr("id", id)
        .attr("viewBox", "0 0 10 10")
        .attr("refX", 8)
        .attr("refY", 5)
        .attr("markerWidth", open ? 6.5 : 5.5)
        .attr("markerHeight", open ? 6.5 : 5.5)
        .attr("orient", "auto");
      const tip = marker.append("path").attr("d", "M 1 1 L 9 5 L 1 9");
      if (open) {
        tip.attr("fill", "none").attr("stroke", fill).attr("stroke-width", 1.6);
      } else {
        tip.attr("d", "M 0 0 L 10 5 L 0 10 z").attr("fill", fill);
      }
    }
    addArrow("graph-arrow", LINK);
    addArrow("graph-arrow-hot", LINK_HOT);
    addArrow("graph-refresh", LINK, true);
    addArrow("graph-refresh-hot", LINK_HOT, true);

    const hatch = defs
      .append("pattern")
      .attr("id", "graph-done")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 7)
      .attr("height", 7);
    hatch.append("rect").attr("width", 7).attr("height", 7).attr("fill", TODO);
    hatch
      .append("path")
      .attr("d", "M-1 1 l2 -2 M0 7 l7 -7 M6 8 l2 -2")
      .attr("stroke", PATTERN)
      .attr("stroke-width", 1.15)
      .attr("stroke-linecap", "square");

    const dots = defs
      .append("pattern")
      .attr("id", "graph-doing")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 6)
      .attr("height", 6);
    dots.append("rect").attr("width", 6).attr("height", 6).attr("fill", TODO);
    dots
      .append("circle")
      .attr("cx", 2)
      .attr("cy", 2)
      .attr("r", 0.95)
      .attr("fill", PATTERN);

    function markerFor(edge: GraphEdge, hot: boolean): string {
      if (edge.kind === "encompassing") {
        return hot ? "url(#graph-refresh-hot)" : "url(#graph-refresh)";
      }
      return hot ? "url(#graph-arrow-hot)" : "url(#graph-arrow)";
    }

    function nudgeFor(edge: GraphEdge): number {
      if (!splitPairs.has(pairKey(edge.from_id, edge.to_id))) {
        return 0;
      }
      return edge.kind === "encompassing" ? -14 : 14;
    }

    const linkG = root
      .selectAll("g.link")
      .data(links)
      .join("g")
      .attr("class", "link")
      .style("pointer-events", "none");

    const link = linkG
      .append("path")
      .attr("fill", "none")
      .attr("stroke", LINK)
      .attr("stroke-width", 1.1)
      .attr("stroke-dasharray", (edge) =>
        edge.kind === "encompassing" ? "5 4" : null,
      )
      .attr("stroke-linecap", "round")
      .attr("marker-end", (edge) => markerFor(edge, false))
      .attr("d", (edge) =>
        linkPath(edge.source, edge.target, edge.kind, laid, nudgeFor(edge)),
      );

    linkG.each(function (edge) {
      if (edge.kind !== "encompassing") {
        return;
      }
      const path = d3.select(this).select("path").node();
      if (!(path instanceof SVGPathElement) || path.getTotalLength() === 0) {
        return;
      }
      const mid = path.getPointAtLength(path.getTotalLength() / 2);
      d3.select(this)
        .append("text")
        .attr("x", mid.x)
        .attr("y", mid.y - 5)
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("font-weight", 600)
        .attr("fill", "#5b6573")
        .text(String(edge.weight));
    });

    const group = root
      .selectAll("g.node")
      .data(laid)
      .join("g")
      .attr("class", "node")
      .attr("transform", (node) => `translate(${node.x},${node.y})`)
      .style("cursor", "pointer")
      .on("click", (_event, node) => {
        onSelectRef.current(node);
      });

    group
      .append("ellipse")
      .attr("rx", (node) => node.rx)
      .attr("ry", (node) => node.ry)
      .attr("fill", (node) => {
        if (node.completed) {
          return "url(#graph-done)";
        }
        if (node.started) {
          return "url(#graph-doing)";
        }
        return TODO;
      })
      .attr("stroke", (node) => courseRing(node.course_id, courses))
      .attr("stroke-width", 1.15);

    const labels = group
      .append("text")
      .style("pointer-events", "none")
      .attr("text-anchor", "middle")
      .attr("fill", "#12203d")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 3)
      .attr("paint-order", "stroke")
      .attr("font-size", 12)
      .attr("font-weight", 600);

    labels.each(function (node) {
      const selection = d3.select(this);
      const offset = ((node.lines.length - 1) * LINE_HEIGHT) / 2;
      node.lines.forEach((line, index) => {
        selection
          .append("tspan")
          .attr("x", 0)
          .attr("y", index * LINE_HEIGHT - offset)
          .attr("dominant-baseline", "middle")
          .text(line);
      });
    });

    function setFocus(id: string | null) {
      const near = id ? connected.get(id) : null;
      group.attr("opacity", (node) => {
        if (id == null || node.id === id || near?.has(node.id)) {
          return 1;
        }
        return 0.18;
      });
      linkG.attr("opacity", (edge) => {
        if (id == null || edge.from_id === id || edge.to_id === id) {
          return 1;
        }
        return 0.1;
      });
      link
        .attr("stroke", (edge) =>
          id != null && (edge.from_id === id || edge.to_id === id)
            ? LINK_HOT
            : LINK,
        )
        .attr("stroke-width", (edge) => {
          const hot = id != null && (edge.from_id === id || edge.to_id === id);
          if (!hot) {
            return 1.1;
          }
          return edge.kind === "encompassing" ? 1.6 : 2.2;
        })
        .attr("stroke-dasharray", (edge) => {
          if (edge.kind !== "encompassing") {
            return null;
          }
          const hot = id != null && (edge.from_id === id || edge.to_id === id);
          return hot ? "8 6" : "5 4";
        })
        .attr("marker-end", (edge) =>
          markerFor(
            edge,
            id != null && (edge.from_id === id || edge.to_id === id),
          ),
        );
    }

    group
      .on("mouseenter", (_event, node) => {
        setFocus(node.id);
      })
      .on("mouseleave", () => {
        setFocus(null);
      });
    svg.on("mouseleave", () => {
      setFocus(null);
    });

    const minX = Math.min(...laid.map((node) => node.x - node.rx)) - 40;
    const maxX = Math.max(...laid.map((node) => node.x + node.rx)) + 40;
    const minY = Math.min(...laid.map((node) => node.y - node.ry)) - 40;
    const maxY = Math.max(...laid.map((node) => node.y + node.ry)) + 40;
    const boxW = Math.max(maxX - minX, 1);
    const boxH = Math.max(maxY - minY, 1);
    const scale = Math.min(size.width / boxW, size.height / boxH, 1.4);
    const tx = size.width / 2 - ((minX + maxX) / 2) * scale;
    const ty = size.height / 2 - ((minY + maxY) / 2) * scale;
    svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));

    return () => {
      svg.on("mouseleave", null);
      svg.on(".zoom", null);
      svg.selectAll("*").remove();
    };
  }, [nodes, edges, courses, size, showEncompassing]);

  return (
    <div ref={wrapRef} className="h-full w-full overflow-hidden bg-surface">
      <svg
        ref={svgRef}
        role="img"
        aria-label="Knowledge graph"
        className="h-full w-full"
      />
    </div>
  );
}
