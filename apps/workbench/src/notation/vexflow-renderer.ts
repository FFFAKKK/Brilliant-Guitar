import { createVexflowRenderer } from "../../../../shared/notation/vexflow-renderer.ts";
import { loadEngravingEngine } from "./engraving-engine.ts";
export const vexflowRenderer = createVexflowRenderer(loadEngravingEngine);
