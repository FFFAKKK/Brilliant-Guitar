// Shared chrome fitting for the fixture and persistent workbench.
// Menus and region/window controls keep their space; secondary status yields first.
export function fitVisualTitle(shell, title, viewportWidth) {
  const start = shell.querySelector(".v-title-start");
  const end = shell.querySelector(".v-title-end");
  const status = shell.querySelector(".v-doc-state");
  const name = shell.querySelector(".v-document");
  const center = viewportWidth / 2;
  status.hidden = false;
  if (status.style.getPropertyValue("max-width")) status.style.maxWidth = "220px";
  const controlsWidth = end.getBoundingClientRect().width - status.getBoundingClientRect().width;
  const statusSpace = Math.max(0, center - controlsWidth - 16 - 40);
  if (statusSpace < 220) status.style.maxWidth = statusSpace + "px";
  const essential = status.dataset.essential === "true";
  status.hidden = !essential && statusSpace < 44;
  if (essential && statusSpace < 44) status.style.maxWidth = "28px";
  const width = Math.max(0, Math.floor(2 * Math.min(
    center - start.getBoundingClientRect().right - 16,
    end.getBoundingClientRect().left - center - 16)));
  shell.style.setProperty("--document-space", width + "px");
  name.hidden = width < 12;
  name.textContent = title;
  const characters = Array.from(title);
  for (let length = characters.length - 1; name.scrollWidth > width && length >= 0; length--) {
    const trailing = Math.floor(length / 2);
    name.textContent = characters.slice(0, Math.ceil(length / 2)).join("") + "…"
      + (trailing ? characters.slice(-trailing).join("") : "");
  }
}
