import type { NotationInteractionGeometry, RenderedNotation } from "./notation-renderer.ts";

type PageItem<T> = T & { readonly pageIndex: number };
export interface PagedInteraction<G extends NotationInteractionGeometry> {
  readonly anchors: readonly PageItem<G["anchors"][number]>[];
  readonly events: readonly PageItem<G["events"][number]>[];
  readonly measures: readonly PageItem<G["measures"][number]>[];
}

/** Keep every engine root and translate geometry by exactly the same page offset. */
export function composeNotationPages<L extends { readonly width: number; readonly height: number }, G extends NotationInteractionGeometry>(
  pages: readonly L[], drawings: readonly RenderedNotation<G>[], signal?: AbortSignal,
) {
  if (signal?.aborted) throw new DOMException("The notation render was superseded", "AbortError");
  if (!pages.length || pages.length !== drawings.length) throw new Error("Notation pages and drawings must match");
  const gap = 20, width = pages[0]!.width;
  const height = pages.reduce((sum, page) => sum + page.height, 0) + gap * (pages.length - 1);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
  svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
  svg.classList.add("score-engraving");
  const anchors: PageItem<G["anchors"][number]>[] = [];
  const events: PageItem<G["events"][number]>[] = [];
  const measures: PageItem<G["measures"][number]>[] = [];
  let offset = 0;
  drawings.forEach((drawing, index) => {
    const page = pages[index]!;
    const group = document.createElementNS(svg.namespaceURI, "g");
    group.setAttribute("data-score-page", String(index + 1));
    group.setAttribute("transform", `translate(0 ${offset})`);
    const paper = document.createElementNS(svg.namespaceURI, "rect");
    paper.setAttribute("width", String(page.width)); paper.setAttribute("height", String(page.height));
    paper.setAttribute("fill", "white");
    group.append(paper, drawing.svg); svg.append(group);
    anchors.push(...drawing.interaction.anchors.map(item =>
      ({ ...item, pageIndex: index, y: item.y + offset, y1: item.y1 + offset, y2: item.y2 + offset })));
    events.push(...drawing.interaction.events.map(item => ({ ...item, pageIndex: index, y: item.y + offset })));
    measures.push(...drawing.interaction.measures.map(item => ({ ...item, pageIndex: index, y: item.y + offset,
      staffBottom: item.staffBottom + offset,
      ...(item.stringYs ? { stringYs: item.stringYs.map(y => y + offset) } : {}),
    })));
    offset += page.height + gap;
  });
  const interaction: PagedInteraction<G> = { anchors, events, measures };
  return { svg, layout: { width, height, pages }, interaction };
}
