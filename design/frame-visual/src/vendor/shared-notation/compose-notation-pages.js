// Generated from shared/notation; run npm run notation:build.
/** Keep every engine root and translate geometry by exactly the same page offset. */
export function composeNotationPages(pages, drawings, signal) {
    if (signal?.aborted)
        throw new DOMException("The notation render was superseded", "AbortError");
    if (!pages.length || pages.length !== drawings.length)
        throw new Error("Notation pages and drawings must match");
    const gap = 20, width = pages[0].width;
    const height = pages.reduce((sum, page) => sum + page.height, 0) + gap * (pages.length - 1);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMin meet");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.classList.add("score-engraving");
    const anchors = [];
    const events = [];
    const measures = [];
    let offset = 0;
    drawings.forEach((drawing, index) => {
        const page = pages[index];
        const group = document.createElementNS(svg.namespaceURI, "g");
        group.setAttribute("data-score-page", String(index + 1));
        group.setAttribute("transform", `translate(0 ${offset})`);
        const paper = document.createElementNS(svg.namespaceURI, "rect");
        paper.setAttribute("width", String(page.width));
        paper.setAttribute("height", String(page.height));
        paper.setAttribute("fill", "white");
        group.append(paper, drawing.svg);
        svg.append(group);
        anchors.push(...drawing.interaction.anchors.map(item => ({ ...item, pageIndex: index, y: item.y + offset, y1: item.y1 + offset, y2: item.y2 + offset })));
        events.push(...drawing.interaction.events.map(item => ({ ...item, pageIndex: index, y: item.y + offset })));
        measures.push(...drawing.interaction.measures.map(item => ({ ...item, pageIndex: index, y: item.y + offset,
            staffBottom: item.staffBottom + offset,
            ...(item.stringYs ? { stringYs: item.stringYs.map(y => y + offset) } : {}),
        })));
        offset += page.height + gap;
    });
    const interaction = { anchors, events, measures };
    return { svg, layout: { width, height, pages }, interaction };
}
