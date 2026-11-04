const DB_NAME = "synergeticx-builder";
const DB_VERSION = 1;
const MAX_PROJECTS = 3;
const THEME_KEY = "sx-builder-theme-v3";
const state = { db: null, projects: [], activeId: "all", page: "home", filter: "All tasks", deferredPrompt: null, saveTimer: 0 };
const $ = (selector, parent = document) => parent.querySelector(selector);
const app = $("#app");
const taskDialog = $("#taskDialog");
const confirmDialog = $("#confirmDialog");
const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const shortDate = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" });

function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch (_) {} }
  const icon = $("#themeIcon");
  if (icon) icon.innerHTML = theme === "dark"
    ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>'
    : '<path d="M20.3 15.2A8.4 8.4 0 0 1 8.8 3.7 8.5 8.5 0 1 0 20.3 15.2Z"/>';
  const themeButton = $("#themeBtn");
  const nextThemeLabel = theme === "dark" ? "Switch to day theme" : "Switch to night theme";
  themeButton?.setAttribute("aria-label", nextThemeLabel);
  if (themeButton) themeButton.title = nextThemeLabel;
  const color = getComputedStyle(document.documentElement).getPropertyValue("--background-elevated").trim();
  $("#themeColor")?.setAttribute("content", color);
}
let savedTheme = "";
try { savedTheme = localStorage.getItem(THEME_KEY) || ""; } catch (_) {}
applyTheme(savedTheme || "light");

function uid() { return globalThis.crypto?.randomUUID?.() || `p-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function esc(value = "") { return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])); }
function slug(value) { return String(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project"; }
function asDate(value) { if (!value) return null; const d = new Date(`${value}T12:00:00`); return Number.isNaN(d.getTime()) ? null : d; }
function dateLabel(value) { const date = asDate(value); return date ? shortDate.format(date) : "Date not set"; }
function taskProgress(project) { const tasks = project.tasks || []; return tasks.length ? tasks.reduce((sum, t) => sum + (Number(t.progress) || 0), 0) / tasks.length : 0; }
function projectTotals(projects) {
  const tasks = projects.flatMap(p => p.tasks || []);
  return { tasks, done: tasks.filter(t => Number(t.progress) >= 100).length, active: tasks.filter(t => Number(t.progress) > 0 && Number(t.progress) < 100).length,
    percent: tasks.length ? tasks.reduce((sum, t) => sum + (Number(t.progress) || 0), 0) / tasks.length : 0,
    estimate: tasks.reduce((sum, t) => sum + (Number(t.estimate) || 0), 0), actual: tasks.reduce((sum, t) => sum + (Number(t.actualCost) || 0), 0) };
}
function allSorted(project) { return [...(project.tasks || [])].sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0)); }

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore("projects", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function dbAll() { return new Promise((resolve, reject) => { const req = state.db.transaction("projects").objectStore("projects").getAll(); req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error); }); }
function dbPut(project) { return new Promise((resolve, reject) => { const tx = state.db.transaction("projects", "readwrite"); tx.objectStore("projects").put(project); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
function dbDelete(id) { return new Promise((resolve, reject) => { const tx = state.db.transaction("projects", "readwrite"); tx.objectStore("projects").delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }

async function start() {
  try {
    state.db = await openDB();
    state.projects = (await dbAll()).sort((a, b) => a.name.localeCompare(b.name));
    if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
  } catch (error) {
    console.error(error);
    toast("This browser couldn't open local storage. Check that site data is enabled.");
  }
  if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("./sw.js").catch(console.warn);
  render();
}

function currentProjects() { return state.activeId === "all" ? state.projects : state.projects.filter(p => p.id === state.activeId); }
function currentProject() { return state.projects.find(p => p.id === state.activeId) || null; }
function changePage(page) { state.page = page; render(); app.focus({ preventScroll: true }); }

function render() {
  $("#navFooter").hidden = state.projects.length === 0;
  document.querySelectorAll(".nav-item").forEach(btn => {
    const active = btn.dataset.page === state.page;
    btn.classList.toggle("active", active);
    btn.classList.toggle("tab-selected", active);
    btn.setAttribute("aria-selected", String(active));
    if ("selected" in btn) btn.selected = active;
  });
  if (!state.projects.length) { renderWelcome(); return; }
  const projects = currentProjects();
  if (state.page === "chart") renderChart(projects);
  else if (state.page === "schedule") renderSchedule(projects);
  else if (state.page === "data") renderData();
  else renderHome();
  bindPageControls();
}

function renderWelcome() {
  app.innerHTML = `<p class="eyebrow">YOUR BUILD, IN SYNC</p><h1>Every project.<br>One clear picture.</h1>
    <p class="intro">Start by loading a project JSON file. Your schedules stay in this browser on this device.</p>
    <section class="hero"><p class="hero-label">YOUR PROJECT DATA STAYS WITH YOU</p><div class="hero-main"><div class="hero-title">Import once, track anywhere,<br>share with a simple file.</div><span class="hero-percent">SX</span></div><div class="hero-track"><i style="width:100%"></i></div><div class="hero-foot"><span>On-device IndexedDB</span><span>JSON in · JSON out</span></div></section>
    <div class="surface data-card"><h3>Load your first project</h3><p>Select the private JSON file for this project. The data is copied into this browser and remains available offline after the app has loaded.</p><button class="btn full" data-action="import">＋ Load Project JSON File</button></div>
    <div class="callout"><span>⇄</span><div><strong>For multiple projects</strong>Load one JSON file for each project you manage. You can keep up to three separate projects on this device.</div></div>
    <div class="surface data-card"><h3>Add an app icon</h3><p>Install SynergeticX Builder from your browser to launch it from your Home Screen.</p><button class="btn ghost full" data-action="install">Install / Add to Home Screen</button></div>`;
  bindPageControls();
}

function selectorMarkup() {
  const options = [`<option value="all" ${state.activeId === "all" ? "selected" : ""}>All projects</option>`, ...state.projects.map(p => `<option value="${esc(p.id)}" ${p.id === state.activeId ? "selected" : ""}>${esc(p.name)} · ${esc(p.location || "")}</option>`)].join("");
  return `<select class="project-selector" id="projectSelect" aria-label="Select project">${options}</select>`;
}

function renderHome() {
  const projects = currentProjects(); const total = projectTotals(projects); const scoped = state.activeId !== "all";
  const label = scoped ? projects[0].name : "Across your projects";
  const cards = state.projects.map(p => {
    const n = projectTotals([p]); const pct = Math.round(taskProgress(p));
    return `<article class="project-card"><div class="project-card-head"><span class="project-icon">⌂</span><div class="project-card-title"><h3>${esc(p.name)}</h3><p>${esc(p.location || "Location not set")}</p></div><span class="project-pct">${pct}%</span></div><div class="mini-track"><i style="width:${pct}%"></i></div><div class="project-card-foot"><span>${p.tasks.length} tasks · ${n.done} complete</span><span>${money.format(n.actual)} actual</span></div><button class="open-project" data-open-project="${esc(p.id)}">Open project&nbsp; →</button></article>`;
  }).join("");
  const next = projects.flatMap(p => allSorted(p).filter(t => (Number(t.progress) || 0) < 100).slice(0, 1).map(t => ({ p, t }))).slice(0, 2);
  app.innerHTML = `<p class="eyebrow">PROJECT OVERVIEW</p><h1>${scoped ? esc(label) : "Build with clarity."}</h1><p class="intro">${scoped ? esc(projects[0].location || "Construction project") : "A live view of progress, spend and what’s next."}</p>
    ${selectorMarkup()}
    <section class="hero"><p class="hero-label">${scoped ? "PROJECT PROGRESS" : "TOTAL PROJECT PROGRESS"}</p><div class="hero-main"><div class="hero-title">${total.done} of ${total.tasks.length} tasks complete</div><span class="hero-percent">${Math.round(total.percent)}%</span></div><div class="hero-track"><i style="width:${total.percent}%"></i></div><div class="hero-foot"><span>${total.active} in progress</span><span>${total.tasks.length - total.done - total.active} to start</span></div></section>
    <div class="metric-grid"><div class="metric"><div class="metric-label">Estimated</div><strong class="metric-value">${money.format(total.estimate)}</strong><div class="metric-note">Combined allowance</div></div><div class="metric"><div class="metric-label">Recorded actual</div><strong class="metric-value">${money.format(total.actual)}</strong><div class="metric-note">Entered to date</div></div></div>
    <div class="section-heading"><h2>${scoped ? "Project snapshot" : "My projects"}</h2><button data-action="import">＋ Load JSON</button></div>
    <div class="project-list">${scoped ? projectCardFull(projects[0]) : cards}</div>
    ${!scoped ? `<div class="button-row" style="margin-top:10px"><button class="btn secondary" data-action="new-project">＋ New project</button></div>` : ""}
    <div class="section-heading"><h2>Next on site</h2><button data-page="schedule">View schedule&nbsp; →</button></div>
    ${next.length ? `<div class="task-list">${next.map(({ p, t }) => taskCard(p, t)).join("")}</div>` : `<div class="empty-state">No open tasks yet. Add the activities for this project from the Schedule tab.</div>`}`;
}

function projectCardFull(project) {
  const total = projectTotals([project]); const pct = Math.round(taskProgress(project));
  return `<article class="project-card"><div class="project-card-head"><span class="project-icon">⌂</span><div class="project-card-title"><h3>${esc(project.name)}</h3><p>${esc(project.location || "Location not set")}</p></div><span class="project-pct">${pct}%</span></div><div class="mini-track"><i style="width:${pct}%"></i></div><div class="project-card-foot"><span>${project.tasks.length} tasks · ${total.done} complete</span><span>${money.format(total.actual)} actual</span></div></article>`;
}

function renderChart(projects) {
  const scoped = state.activeId !== "all";
  if (!scoped) {
    const totals = projectTotals(projects);
    app.innerHTML = `<p class="eyebrow">BUILD PROGRESS</p><h1>Progress chart</h1><p class="intro">Every task in build order. Each bar fills as you record completion.</p>${selectorMarkup()}
      <div class="chart-summary"><strong>${Math.round(totals.percent)}%</strong><span>average task completion<br>across ${totals.tasks.length} activities</span></div>
      ${projects.map(p => `<div class="section-heading"><h2>${esc(p.name)} · ${Math.round(taskProgress(p))}%</h2><button data-open-chart="${esc(p.id)}">Focus&nbsp; ↗</button></div>${chartRows(p)}`).join("")}`;
  } else {
    const p = projects[0]; const total = projectTotals(projects);
    app.innerHTML = `<p class="eyebrow">BUILD PROGRESS</p><h1>Task progress</h1><p class="intro">${esc(p.name)} · ${esc(p.location || "")}</p>${selectorMarkup()}
      <div class="chart-summary"><strong>${Math.round(total.percent)}%</strong><span>whole-project progress<br>simple average of ${p.tasks.length} tasks</span></div>
      <div class="chart-legend"><span>0% · Not started</span><span>100% · Complete</span></div>${chartRows(p)}`;
  }
}

function chartRows(project) {
  if (!project.tasks.length) return `<div class="empty-state">No task bars yet. Add activities in Schedule, or load an updated JSON file.</div>`;
  return `<div class="chart-scroll">${allSorted(project).map(task => {
    const pct = Math.max(0, Math.min(100, Number(task.progress) || 0));
    return `<button class="chart-row ${task.impacted ? "impacted" : ""}" data-edit-task="${esc(project.id)}::${esc(task.id)}" style="width:100%;border-top:0;border-left:0;border-right:0;text-align:left"><span class="chart-seq">${String(task.seq || "").padStart(2, "0")}</span><span class="chart-task"><span class="chart-task-title">${esc(task.name)}</span><span class="chart-task-date">${dateLabel(task.start)}${task.finish ? ` – ${dateLabel(task.finish)}` : ""}</span><span class="bar-rail"><span class="bar-fill" style="display:block;width:${pct}%"></span></span></span><span class="chart-value">${pct}%</span></button>`;
  }).join("")}</div>`;
}

function renderSchedule(projects) {
  const scoped = state.activeId !== "all";
  if (!scoped) {
    app.innerHTML = `<p class="eyebrow">TASKS & DATES</p><h1>Construction schedule</h1><p class="intro">Choose a project to view and update its ordered activities.</p>${selectorMarkup()}
      <div class="project-list">${projects.map(p => `<article class="project-card"><div class="project-card-head"><span class="project-icon">☷</span><div class="project-card-title"><h3>${esc(p.name)}</h3><p>${p.tasks.length} activities · ${esc(p.location || "")}</p></div><button class="btn secondary" data-open-project="${esc(p.id)}">Open</button></div></article>`).join("")}</div>`;
    return;
  }
  const p = projects[0]; const tasks = allSorted(p).filter(t => matchesFilter(t));
  const filters = ["All tasks", "In progress", "At risk", "Complete"];
  app.innerHTML = `<p class="eyebrow">${esc(p.location || "PROJECT PLAN")}</p><h1>${esc(p.name)}</h1><p class="intro">${p.tasks.length} activities · ${p.tasks.filter(t => t.impacted).length} schedule impacts</p>${selectorMarkup()}
    <div class="filters">${filters.map(f => `<button class="filter-chip ${state.filter === f ? "active" : ""}" data-filter="${esc(f)}">${esc(f)}</button>`).join("")}</div>
    <div class="task-list">${tasks.length ? tasks.map(t => taskCard(p, t)).join("") : `<div class="empty-state">No activities match this filter.</div>`}</div>
    <div class="button-row" style="margin-top:12px"><button class="btn secondary" data-action="add-task">＋ Add activity</button></div>`;
}

function matchesFilter(task) {
  const pct = Number(task.progress) || 0;
  if (state.filter === "Complete") return pct >= 100;
  if (state.filter === "In progress") return pct > 0 && pct < 100;
  if (state.filter === "At risk") return task.impacted || (!!task.finish && pct < 100 && task.finish < new Date().toISOString().slice(0, 10));
  return true;
}
function taskCard(project, task) {
  const pct = Number(task.progress) || 0; const risk = task.impacted || matchesOverdue(task); const status = pct >= 100 ? "Done" : pct > 0 ? "Active" : risk ? "Impacted" : "Planned";
  const range = task.start ? `${dateLabel(task.start)}${task.finish ? ` – ${dateLabel(task.finish)}` : ""}` : task.finish ? `Finish ${dateLabel(task.finish)}` : "Dates not set";
  return `<button class="task-card" data-edit-task="${esc(project.id)}::${esc(task.id)}" style="width:100%;text-align:left"><span class="task-num">${String(task.seq || "").padStart(2, "0")}</span><span class="task-main"><span class="task-name">${esc(task.name)}</span><span class="task-meta">${esc(range)} · ${pct}%</span></span><span class="task-state ${pct >= 100 ? "done" : risk ? "risk" : ""}">${status}</span></button>`;
}
function matchesOverdue(task) { return !!task.finish && task.finish < new Date().toISOString().slice(0, 10) && Number(task.progress) < 100; }

function renderData() {
  const projects = state.projects;
  app.innerHTML = `<p class="eyebrow">PORTABLE BY DESIGN</p><h1>Project data</h1><p class="intro">Each project is its own JSON file. Export it, send it, then import it on another phone.</p>
    <div class="surface data-card"><h3>Load Project JSON File</h3><p>Choose one or more project files. Imports save to this browser’s IndexedDB and replace a project with the same project ID.</p><button class="btn full" data-action="import">＋ Load Project JSON File</button></div>
    <div class="section-heading"><h2>On this device</h2><span class="muted" style="font-size:11px">${projects.length} / ${MAX_PROJECTS} projects</span></div>
    <div class="surface data-card">${projects.map(p => `<div class="data-project-row"><div><strong>${esc(p.name)} · ${esc(p.location || "")}</strong><small>${p.tasks.length} tasks · Updated ${p.updatedAt ? dateLabel(p.updatedAt.slice(0,10)) : "from starter file"}</small></div><span class="button-row"><button class="btn secondary" data-export-project="${esc(p.id)}">Export</button><button class="btn danger" data-remove-project="${esc(p.id)}">Remove</button></span></div>`).join("")}</div>
    <div class="surface data-card"><h3>Add another project</h3><p>You can keep up to three project files on this device.</p><div class="button-row"><button class="btn ghost" data-action="new-project">＋ Create project</button></div></div>
    <div class="callout"><span>ⓘ</span><div><strong>For family sharing</strong>Export one project and send its JSON file by AirDrop, text or email. The recipient loads that file in their own browser. There is no shared live database, so import the latest file to receive updates.</div></div>
    <div class="surface data-card"><h3>Add this PWA to your Home Screen</h3><p>Websites do not add an icon automatically. Use your browser’s install option to put SynergeticX Builder on your Home Screen.</p><button class="btn secondary full" data-action="install">Install / Add to Home Screen</button></div>`;
}

function bindPageControls() {
  $("#projectSelect")?.addEventListener("change", event => { state.activeId = event.target.value; state.filter = "All tasks"; render(); });
  app.querySelectorAll("[data-page]").forEach(el => el.addEventListener("click", () => changePage(el.dataset.page)));
  app.querySelectorAll("[data-filter]").forEach(el => el.addEventListener("click", () => { state.filter = el.dataset.filter; render(); }));
  app.querySelectorAll("[data-open-project]").forEach(el => el.addEventListener("click", () => { state.activeId = el.dataset.openProject; state.page = "home"; render(); }));
  app.querySelectorAll("[data-open-chart]").forEach(el => el.addEventListener("click", () => { state.activeId = el.dataset.openChart; state.page = "chart"; render(); }));
  app.querySelectorAll("[data-edit-task]").forEach(el => el.addEventListener("click", () => { const [projectId, taskId] = el.dataset.editTask.split("::"); openTask(projectId, taskId); }));
  app.querySelectorAll("[data-export-project]").forEach(el => el.addEventListener("click", () => exportProject(el.dataset.exportProject)));
  app.querySelectorAll("[data-remove-project]").forEach(el => el.addEventListener("click", () => removeProject(el.dataset.removeProject)));
  app.querySelectorAll("[data-action]").forEach(el => el.addEventListener("click", () => handleAction(el.dataset.action)));
}

async function handleAction(action) {
  if (action === "import") $("#fileInput").click();
  if (action === "new-project") createProject();
  if (action === "add-task") createTask();
  if (action === "install") installApp();
}

$("#fileInput").addEventListener("change", async event => {
  const files = [...event.target.files]; event.target.value = "";
  for (const file of files) {
    try { await importObject(JSON.parse(await file.text()), file.name); }
    catch (error) { console.error(error); toast(`${file.name}: ${error.message || "Invalid project JSON"}`); }
  }
});

function normalizeTask(raw, index) {
  if (!raw || typeof raw !== "object" || !String(raw.name || raw.task || "").trim()) throw new Error(`Task ${index + 1} is missing a name`);
  const pct = Number(raw.progress ?? raw.completion ?? 0);
  return { id: String(raw.id ?? raw.seq ?? index + 1), seq: Number(raw.seq ?? raw.id ?? index + 1), name: String(raw.name ?? raw.task).trim(),
    start: String(raw.start ?? raw.plannedStart ?? ""), finish: String(raw.finish ?? raw.plannedFinish ?? ""),
    actualStart: String(raw.actualStart ?? ""), actualFinish: String(raw.actualFinish ?? ""),
    estimate: Math.max(0, Number(raw.estimate ?? raw.estimatedCost ?? 0) || 0), actualCost: Math.max(0, Number(raw.actualCost ?? raw.actualAmount ?? 0) || 0),
    contact: String(raw.contact ?? ""), notes: String(raw.notes ?? ""), progress: Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0)), impacted: Boolean(raw.impacted) };
}

async function importObject(data, fileName = "") {
  let project;
  if (Array.isArray(data)) {
    const base = fileName.replace(/\.json$/i, "").replace(/[-_]+/g, " ");
    project = { id: slug(base) + "-" + uid().slice(-5), name: base || "Imported project", location: "", tasks: data.map(normalizeTask) };
  } else if (data?.project && Array.isArray(data.project.tasks)) {
    project = { ...data.project, tasks: data.project.tasks.map(normalizeTask) };
  } else {
    throw new Error("Expected a SynergeticX project JSON file with a project and tasks list");
  }
  project.id = String(project.id || uid()); project.name = String(project.name || "Imported project"); project.location = String(project.location || "");
  project.schemaVersion = 1; project.updatedAt = new Date().toISOString();
  const existing = state.projects.find(p => p.id === project.id);
  if (!existing && state.projects.length >= MAX_PROJECTS) { toast(`This device already has ${MAX_PROJECTS} projects. Export or remove one before adding another.`); return; }
  if (existing && !confirm(`Replace the local ${existing.name} project with the contents of ${fileName || "this file"}?`)) return;
  await dbPut(project); state.projects = (await dbAll()).sort((a, b) => a.name.localeCompare(b.name)); state.activeId = project.id; state.page = "home"; render(); toast(`${project.name} loaded and saved on this device.`);
}

function exportProject(projectId) {
  const project = state.projects.find(p => p.id === projectId); if (!project) return;
  const payload = { app: "SynergeticX Builder", schemaVersion: 1, exportedAt: new Date().toISOString(), project: structuredClone(project) };
  const file = new File([JSON.stringify(payload, null, 2)], `${slug(project.name)}-${new Date().toISOString().slice(0,10)}.json`, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|iPod/i.test(navigator.userAgent)) navigator.share({ files: [file], title: `${project.name} project data` }).catch(() => downloadFile(file));
  else downloadFile(file);
}
function downloadFile(file) { const url = URL.createObjectURL(file); const link = document.createElement("a"); link.href = url; link.download = file.name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000); toast("Project JSON exported."); }

async function removeProject(id) {
  const project = state.projects.find(p => p.id === id); if (!project) return;
  if (!confirm(`Remove ${project.name} and its local data from this browser? Export a backup first if needed.`)) return;
  await dbDelete(id); state.projects = await dbAll(); state.activeId = "all"; state.page = state.projects.length ? "data" : "home"; render(); toast(`${project.name} removed from this device.`);
}

function createProject() {
  if (state.projects.length >= MAX_PROJECTS) { toast(`This device supports up to ${MAX_PROJECTS} project slots.`); return; }
  const name = prompt("Project name (for example, Collins Close)"); if (!name?.trim()) return;
  const location = prompt("Suburb or project location") || "";
  const project = { id: uid(), name: name.trim(), location: location.trim(), schemaVersion: 1, updatedAt: new Date().toISOString(), tasks: [] };
  dbPut(project).then(async () => { state.projects = await dbAll(); state.activeId = project.id; state.page = "schedule"; render(); toast("Project created. Add your first schedule activity."); });
}
function createTask() {
  const project = currentProject(); if (!project) { toast("Choose one project first."); return; }
  const name = prompt("Activity name"); if (!name?.trim()) return;
  const seq = Math.max(0, ...project.tasks.map(t => Number(t.seq) || 0)) + 1;
  const task = normalizeTask({ id: String(seq), seq, name, progress: 0 }, seq - 1);
  project.tasks.push(task); project.tasks.sort((a, b) => a.seq - b.seq); persistProject(project).then(() => { render(); toast("Activity added."); });
}

function openTask(projectId, taskId) {
  const project = state.projects.find(p => p.id === projectId); const task = project?.tasks.find(t => String(t.id) === String(taskId)); if (!project || !task) return;
  taskDialog.innerHTML = `<div class="dialog-header"><div><p class="eyebrow">${esc(project.name)} · ACTIVITY ${esc(task.seq)}</p><h2>${esc(task.name)}</h2><p>${esc(task.contact || "")}</p></div><button class="icon-button" data-close aria-label="Close">×</button></div>
    <div class="dialog-body"><div class="field"><label for="editProgress">Completion</label><div class="progress-editor"><input id="editProgress" type="range" min="0" max="100" step="5" value="${Number(task.progress) || 0}"><output id="progressOutput">${Number(task.progress) || 0}%</output></div></div>
      <div class="date-grid"><div class="field"><label for="editStart">Planned start</label><input id="editStart" type="date" value="${esc(task.start)}"></div><div class="field"><label for="editFinish">Planned finish</label><input id="editFinish" type="date" value="${esc(task.finish)}"></div></div>
      <div class="date-grid"><div class="field"><label for="editActualStart">Actual start</label><input id="editActualStart" type="date" value="${esc(task.actualStart)}"></div><div class="field"><label for="editActualFinish">Actual finish</label><input id="editActualFinish" type="date" value="${esc(task.actualFinish)}"></div></div>
      <div class="date-grid"><div class="field"><label for="editEstimate">Estimated cost (AUD)</label><input id="editEstimate" type="number" min="0" step="0.01" value="${Number(task.estimate) || ""}"></div><div class="field"><label for="editActualCost">Actual cost to date (AUD)</label><input id="editActualCost" type="number" min="0" step="0.01" value="${Number(task.actualCost) || ""}"></div></div>
      <div class="field"><label for="editNotes">Site notes</label><textarea id="editNotes" maxlength="4000" placeholder="Short update, issue or handover note…">${esc(task.notes)}</textarea></div>
      <div class="callout warning" ${task.impacted ? "" : "hidden"}><span>⚠</span><div><strong>Schedule impact</strong>This activity was shifted by a planned date change. Review its dates.</div></div>
    </div><div class="dialog-actions"><button class="btn ghost" data-close>Close</button><button class="btn secondary" data-delete-task>Delete task</button></div>`;
  taskDialog.showModal();
  taskDialog.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => taskDialog.close()));
  taskDialog.querySelector("[data-delete-task]").addEventListener("click", () => { if (confirm(`Delete “${task.name}”?`)) { project.tasks = project.tasks.filter(t => t.id !== task.id); persistProject(project).then(() => { taskDialog.close(); render(); toast("Activity deleted."); }); } });
  const bind = (id, key, cast = v => v) => $(id, taskDialog).addEventListener("input", event => { task[key] = cast(event.target.value); taskDialog.querySelector("#progressOutput")?.replaceChildren(`${task.progress}%`); queueSave(project); });
  bind("#editProgress", "progress", value => Number(value));
  bind("#editStart", "start"); bind("#editActualStart", "actualStart"); bind("#editActualFinish", "actualFinish");
  bind("#editEstimate", "estimate", value => Math.max(0, Number(value) || 0)); bind("#editActualCost", "actualCost", value => Math.max(0, Number(value) || 0)); bind("#editNotes", "notes");
  $("#editFinish", taskDialog).addEventListener("change", event => changeFinish(project, task, event.target.value));
}
taskDialog.addEventListener("close", () => {
  clearTimeout(state.saveTimer);
  const project = currentProject();
  if (project) persistProject(project).then(render);
});

async function changeFinish(project, task, newFinish) {
  const previous = task.finish || ""; if (newFinish === previous) return;
  let affected = [];
  if (previous && newFinish && Number(task.progress) < 100) {
    const delta = Math.round((new Date(`${newFinish}T12:00:00`) - new Date(`${previous}T12:00:00`)) / 86400000);
    if (delta) affected = allSorted(project).filter(t => Number(t.seq) > Number(task.seq) && Number(t.progress) < 100 && t.start && t.start >= previous);
    if (affected.length) {
      const preview = affected.slice(0, 6).map(t => `<li>${esc(t.name)}</li>`).join("") + (affected.length > 6 ? `<li>+ ${affected.length - 6} more</li>` : "");
      const direction = delta > 0 ? `later by ${delta} day${delta === 1 ? "" : "s"}` : `earlier by ${Math.abs(delta)} day${Math.abs(delta) === 1 ? "" : "s"}`;
      confirmDialog.innerHTML = `<div class="dialog-header"><div><p class="eyebrow">FLOW-ON REVIEW</p><h2>Downstream dates move ${direction}</h2><p>${affected.length} incomplete later task${affected.length === 1 ? "" : "s"} start on or after this task’s current finish.</p></div></div><div class="dialog-body"><ul class="impact-list">${preview}</ul><p class="muted" style="font-size:11px">Apply the same calendar-day shift to their planned starts and finishes?</p></div><div class="dialog-actions"><button class="btn ghost" data-only>Save task only</button><button class="btn secondary" data-cascade>Shift downstream tasks</button></div>`;
      confirmDialog.showModal();
      const choose = async cascade => {
        task.finish = newFinish;
        if (cascade) for (const successor of affected) { successor.start = shiftDate(successor.start, delta); successor.finish = shiftDate(successor.finish, delta); successor.impacted = true; }
        await persistProject(project); confirmDialog.close(); $("#editFinish", taskDialog).value = newFinish; render(); toast(cascade ? `${affected.length} downstream task dates shifted.` : "Task finish updated.");
      };
      confirmDialog.querySelector("[data-only]").addEventListener("click", () => choose(false));
      confirmDialog.querySelector("[data-cascade]").addEventListener("click", () => choose(true));
      confirmDialog.addEventListener("cancel", event => { event.preventDefault(); confirmDialog.close(); $("#editFinish", taskDialog).value = previous; }, { once: true });
      return;
    }
  }
  task.finish = newFinish; await persistProject(project); toast("Planned finish updated.");
}
function shiftDate(value, delta) { if (!value) return value; const d = new Date(`${value}T12:00:00`); d.setDate(d.getDate() + delta); return d.toISOString().slice(0, 10); }
function queueSave(project) { clearTimeout(state.saveTimer); state.saveTimer = setTimeout(() => persistProject(project).then(() => { updateLiveSummary(); }), 300); }
async function persistProject(project) { project.updatedAt = new Date().toISOString(); await dbPut(project); }
function updateLiveSummary() { const summary = $(".chart-summary", taskDialog); if (summary) summary.querySelector("strong").textContent = `${Math.round(taskProgress(currentProject() || { tasks: [] }))}%`; }

let toastTimer;
function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2800); }

function isIOSDevice() { return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }

async function installApp() {
  if (state.deferredPrompt) {
    const promptEvent = state.deferredPrompt;
    state.deferredPrompt = null;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") toast("SynergeticX Builder is being installed.");
    return;
  }
  const isIOS = isIOSDevice();
  const instructions = isIOS
    ? "iOS requires you to add the icon from Safari. Open this page in Safari, tap Share, choose Add to Home Screen, turn on Open as Web App if shown, then tap Add."
    : /Android/i.test(navigator.userAgent)
      ? "In Chrome, tap the ⋮ menu, choose Install app or Add to Home screen, then confirm."
      : "Open this page in your phone browser. Use its Install app or Add to Home Screen option. On iPhone, use Safari’s Share button, then Add to Home Screen.";
  const title = isIOS ? "Finish adding the icon" : "Install SynergeticX Builder";
  const detail = isIOS ? "A website cannot add its own icon on iPhone. Safari’s Add to Home Screen action must complete the install." : "The app icon is added only after you confirm in the browser menu.";
  confirmDialog.innerHTML = `<div class="dialog-header"><div><p class="eyebrow">QUICK SETUP</p><h2>${title}</h2></div><button class="icon-button" data-install-close aria-label="Close">×</button></div><div class="dialog-body"><p class="intro">${instructions}</p><p class="muted" style="font-size:11px">${detail}</p></div><div class="dialog-actions"><button class="btn secondary" data-install-close>Got it</button></div>`;
  confirmDialog.showModal();
  confirmDialog.querySelectorAll("[data-install-close]").forEach(button => button.addEventListener("click", () => confirmDialog.close()));
}

document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => changePage(button.dataset.page)));
$("#themeBtn").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true));
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", event => {
  let userChoice = ""; try { userChoice = localStorage.getItem(THEME_KEY) || ""; } catch (_) {}
  if (!userChoice) applyTheme(event.matches ? "dark" : "light");
});
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); state.deferredPrompt = event; });
$("#installBtn").addEventListener("click", installApp);
if (isIOSDevice()) {
  $("#installBtn").textContent = "Add to Home";
  $("#installBtn").setAttribute("aria-label", "Add SynergeticX Builder to Home Screen");
  $("#installBtn").title = "Add SynergeticX Builder to Home Screen";
}
window.addEventListener("appinstalled", () => { state.deferredPrompt = null; $("#installBtn").hidden = true; toast("SynergeticX Builder was installed."); });
if (matchMedia("(display-mode: standalone)").matches || navigator.standalone === true) $("#installBtn").hidden = true;
start();
