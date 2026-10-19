let loading;

export function loadVexFlow() {
  if (loading) return loading;
  if (typeof document === "undefined") return Promise.reject(new Error("五线谱绘制需要浏览器 document"));
  loading = (globalThis.VexFlow ? Promise.resolve(globalThis.VexFlow) : new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("../vendor/vexflow-bravura.js", import.meta.url).href;
    script.async = true;
    script.onload = () => globalThis.VexFlow ? resolve(globalThis.VexFlow) : reject(new Error("VexFlow 全局对象未加载"));
    script.onerror = () => reject(new Error("VexFlow 绘制引擎加载失败"));
    document.head.append(script);
  })).then(async engine => {
    if (!document.fonts?.load) throw new Error("浏览器不支持记谱字体加载检查");
    const faces = await Promise.all([
      document.fonts.load("40px Bravura"),
      document.fonts.load("12px Academico"),
    ]);
    if (faces.some(group => group.length === 0 || group.some(face => face.status !== "loaded"))) {
      throw new Error("Bravura 或 Academico 记谱字体未加载");
    }
    return { ...engine, default: engine.default ?? engine };
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}
