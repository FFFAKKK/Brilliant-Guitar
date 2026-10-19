// Private schematic geometry shared by the layout view and its review fixture.
// The reference proportions describe this thumbnail, never the real workspace.
export const LAYOUT_PREVIEW_PLANE = 512;

export function projectLayoutPreview({ sizes, regions }, width, height) {
  const gap = 4, seam = 3;
  const left = regions.left ? width * sizes.left / 1240 : seam;
  const right = regions.right ? width * sizes.right / 1240 : seam;
  const top = regions.top ? height * sizes.top / 900 : seam;
  const bottom = regions.voice ? height * sizes.voice / 900 : seam;
  const middleY = top + gap, middleHeight = height - top - bottom - gap * 2;
  const region = (side, x, y, width, height) => ({ x, y, width, height, opacity: regions[side] ? 1 : .28 });
  return {
    top: region("top", 0, 0, width, top),
    left: region("left", 0, middleY, left, middleHeight),
    right: region("right", width - right, middleY, right, middleHeight),
    voice: region("voice", 0, height - bottom, width, bottom),
    stage: { x: left + gap, y: middleY, width: width - left - right - gap * 2, height: middleHeight, opacity: 1 },
  };
}
