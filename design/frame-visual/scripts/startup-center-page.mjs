import { readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);

/** One three-page template and one original manager shell for both adapters. */
export async function createStartupCenterPage({ product = false } = {}) {
  const original = await readFile(new URL("plugin-startup-config-static-preview.html", root), "utf8");
  const shell = original.match(/<main id="startup-root"[\s\S]*?<\/main>/g);
  if (shell?.length !== 1) throw new Error("Expected one existing plugin manager shell");
  const template = await readFile(new URL("tools/startup-center-page.html", root), "utf8");
  if (template.split("@@PLUGIN_SHELL@@").length !== 2) throw new Error("Expected one plugin shell insertion point");
  let html = template.replace("@@PLUGIN_SHELL@@", shell[0].replace(/^<main\b/, "<div").replace(/<\/main>$/, "</div>"));
  if (!product) return html;
  const styles = [...original.matchAll(/<link rel="stylesheet"[^>]+>/g)].map(match => match[0]);
  html = html.replace(/  <link rel="stylesheet"[^>]+>\s*/g, "")
    .replace("</head>", styles.join("\n  ") + '\n  <link rel="stylesheet" href="styles/startup-center-product.css">\n</head>')
    .replace("<body>", '<body class="startup-product">')
    .replaceAll("启动中心预览", "启动中心").replaceAll("启动中心视觉预览", "启动中心")
    .replaceAll("示例最近作品", "最近作品").replaceAll("搜索示例作品", "搜索作品")
    .replaceAll("选中示例作品的小预览", "所选作品").replaceAll("（预览）", "")
    .replaceAll("当前预览", "当前启动中心")
    .replace(/<span class="launch-preview-badge"[\s\S]*?<\/span>/, "")
    .replace(/<span class="startup-preview-badge"[\s\S]*?<\/span>/, "")
    .replace(/<span class="launch-sample-caption">[\s\S]*?<\/span>/, "")
    .replace(/<img src="fixtures\/approved-score.svg"[^>]*>/, "")
    .replace('aria-live="polite">视觉预览</span>', 'aria-live="polite"></span>')
    .replace(/<div class="launch-setting-note">[\s\S]*?<\/div>/,
      '<div class="launch-setting-note"><button id="launch-appearance-status" type="button" class="launch-icon-button" data-frame-ui title="启动中心设置" aria-label="启动中心设置" disabled><span data-launch-icon="info"></span></button></div>')
    .replace('<div class="launch-actions">', '<div class="launch-actions"><button id="launch-refresh" type="button" class="launch-icon-button" title="刷新最近作品" aria-label="刷新最近作品"><span data-launch-icon="timerReset"></span></button>')
    .replace(/(<button id="launch-open-selected"[\s\S]*?<\/button>)/, '$1<button id="launch-remove" type="button" class="launch-icon-button" title="移除最近记录；不删除文件" aria-label="移除最近记录" hidden><span data-launch-icon="close"></span></button>')
    .replace(/(<footer class="launch-home-footer">[\s\S]*?)(<\/footer>)/,
      '$1<button id="launch-retry" type="button" class="launch-icon-button" aria-label="重试" hidden><span data-launch-icon="undo"></span></button><button id="launch-continue" type="button" class="launch-icon-button" title="继续当前作品" aria-label="继续当前作品" hidden><span data-launch-icon="play"></span></button>$2')
    .replace("</main>", '</main>\n  <div id="app" data-frame-ui hidden></div>')
    .replace("vendor/startup-center-preview.js", "vendor/startup-center-product.js")
    .replace(/(<button id="launch-(?:refresh|remove|retry|continue)")/g, "$1 data-frame-ui");
  return html.replace(/^[ \t]+$/gm, "");
}
