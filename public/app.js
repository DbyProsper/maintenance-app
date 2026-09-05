"use strict";

/* ==================================================================
   1. Application constants and shared state
   ================================================================== */
const DB = "ufh-maintenance-prototype",
  VERSION = 2,
  STORES = ["profiles", "requests", "notifications", "settings"];
const STATUS = [
  "Received",
  "Assigned",
  "In Progress",
  "Delayed / On Hold",
  "Completed",
  "Reopened",
  "Cancelled",
];
const CATEGORIES = [
  "Electrical",
  "Lighting",
  "Plumbing or water",
  "Toilet or bathroom",
  "Door or lock",
  "Broken window or glass",
  "Furniture or fittings",
  "Structural issue",
  "Cleaning or sanitation",
  "Other",
];
const state = {
  db: null,
  profile: null,
  route: "dashboard",
  draft: null,
  formStep: 1,
  formImages: [],
  request: null,
};
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)],
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const uid = () => crypto.randomUUID(),
  now = () => new Date().toISOString(),
  fmt = (v) =>
    v
      ? new Intl.DateTimeFormat("en-ZA", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(v))
      : "Not set",
  slug = (v) =>
    String(v)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

/* ==================================================================
   2. Four-second homepage campus slideshow
   ================================================================== */
function initHeroSlideshow() {
  const slides = $$(".hero-slide");
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (slides.length < 2 || reduceMotion) return;

  let activeIndex = 0;
  let timerId;

  const showNextSlide = () => {
    slides[activeIndex].classList.remove("is-active");
    activeIndex = (activeIndex + 1) % slides.length;
    slides[activeIndex].classList.add("is-active");
  };

  const startSlideshow = () => {
    window.clearInterval(timerId);
    timerId = window.setInterval(showNextSlide, 4000);
  };

  startSlideshow();

  // Stop background work when the tab is hidden, then restart on return.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.clearInterval(timerId);
    } else {
      startSlideshow();
    }
  });
}

/* ==================================================================
   3. IndexedDB setup and repository helpers
   ================================================================== */
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("profiles")) {
        const s = d.createObjectStore("profiles", { keyPath: "id" });
        s.createIndex("role", "role");
      }
      if (!d.objectStoreNames.contains("requests")) {
        const s = d.createObjectStore("requests", { keyPath: "id" });
        s.createIndex("studentId", "studentId");
        s.createIndex("status", "status");
        s.createIndex("updatedAt", "updatedAt");
      }
      if (!d.objectStoreNames.contains("notifications")) {
        const s = d.createObjectStore("notifications", { keyPath: "id" });
        s.createIndex("profileId", "profileId");
        s.createIndex("requestId", "requestId");
      }
      if (!d.objectStoreNames.contains("settings"))
        d.createObjectStore("settings", { keyPath: "key" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
const repo = {
  all: (store) =>
    new Promise((ok, no) => {
      const r = state.db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    }),
  get: (store, id) =>
    new Promise((ok, no) => {
      const r = state.db.transaction(store).objectStore(store).get(id);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    }),
  put: (store, val) =>
    new Promise((ok, no) => {
      const r = state.db
        .transaction(store, "readwrite")
        .objectStore(store)
        .put(val);
      r.onsuccess = () => ok(val);
      r.onerror = () => no(r.error);
    }),
  del: (store, id) =>
    new Promise((ok, no) => {
      const r = state.db
        .transaction(store, "readwrite")
        .objectStore(store)
        .delete(id);
      r.onsuccess = () => ok();
      r.onerror = () => no(r.error);
    }),
  clear: (store) =>
    new Promise((ok, no) => {
      const r = state.db
        .transaction(store, "readwrite")
        .objectStore(store)
        .clear();
      r.onsuccess = () => ok();
      r.onerror = () => no(r.error);
    }),
};

/* ==================================================================
   4. Shared interface helpers, theme, and local AI recommendation
   ================================================================== */
function toast(message) {
  const e = document.createElement("div");
  e.className = "toast";
  e.textContent = message;
  $("#toast-region").append(e);
  setTimeout(() => e.remove(), 3800);
}
function modal(title, body, actions = "") {
  $("#modal-root").innerHTML =
    `<div class="modal-backdrop" role="presentation"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">${esc(title)}</h2>${body}<div class="modal-actions">${actions}<button class="secondary" type="button" data-close-modal>Close</button></div></section></div>`;
  $(".modal button,input,select,textarea")?.focus();
}
function closeModal() {
  $("#modal-root").innerHTML = "";
}
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("ufh-theme", t);
  const dark = t === "dark";
  $("#theme-toggle").textContent = dark ? "☀" : "☾";
  $("#access-theme").textContent = dark ? "Use light mode" : "Use dark mode";
}
function statusChip(s) {
  return `<span class="chip ${slug(s)}">${esc(s)}</span>`;
}
function overdue(r, days) {
  return (
    !["Completed", "Cancelled"].includes(r.status) &&
    Date.now() - new Date(r.lastProgressAt).getTime() >= days * 86400000
  );
}
function recommendation(data) {
  const text =
      `${data.category} ${data.title} ${data.description} ${data.location}`.toLowerCase(),
    reasons = [];
  let priority = "Low";
  if (
    /spar(k|king)|smoke|fire|exposed|shock|flood|burst|cannot lock|broken lock|shattered|broken glass/.test(
      text,
    )
  ) {
    priority = "High";
    reasons.push(
      "Safety, security, flooding or exposed-electrical wording detected",
    );
  } else if (
    /leak|no water|no light|toilet|sanitation|electrical|plumbing/.test(text)
  ) {
    priority = "Medium";
    reasons.push("Possible loss of an essential residence facility");
  } else reasons.push("No immediate safety phrase detected");
  if (data.accessibilityNeed)
    reasons.push(
      "An assistance request is present for staff review; no disability is inferred",
    );
  if (data.images?.length)
    reasons.push("Images are available for staff assessment");
  return { category: data.category, priority, reasons };
}
async function notify(profileId, requestId, message) {
  await repo.put("notifications", {
    id: uid(),
    profileId,
    requestId,
    message,
    createdAt: now(),
    readAt: null,
  });
}

/* ==================================================================
   5. Application startup, access screen, and route navigation
   ================================================================== */
async function boot() {
  try {
    const id = localStorage.getItem("ufh-session");
    if (id) {
      $("#boot").hidden = false;
      $("#access").hidden = true;
    }
    state.db = await openDB();
    setTheme(localStorage.getItem("ufh-theme") || "light");
    if (id) state.profile = await repo.get("profiles", id);
    $("#boot").hidden = true;
    state.profile ? await startApp() : await showAccess();
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  } catch (e) {
    $("#boot").hidden = true;
    $("#fatal").hidden = false;
    $("#fatal-message").textContent = e.message;
  }
}
async function showAccess() {
  state.profile = null;
  $("#topbar").hidden = true;
  $("#app-shell").hidden = true;
  $("#access").hidden = false;
  const profiles = await repo.all("profiles");
  $("#profile-list").innerHTML = profiles.length
    ? profiles
        .map(
          (p) =>
            `<button class="profile-card" data-select-profile="${p.id}"><span><strong>${esc(p.name)}</strong><br><small>${esc(p.email || "Local profile")}</small></span><span class="role">${esc(p.role)}</span></button>`,
        )
        .join("")
    : `<div class="empty"><div class="empty-icon">◎</div><strong>No local profiles yet</strong><p>Create the first student or maintenance profile to begin.</p></div>`;
}
function navItems() {
  return state.profile.role === "student"
    ? [
        ["dashboard", "Overview"],
        ["report", "Report an issue"],
        ["requests", "My requests"],
        ["notifications", "Notifications"],
        ["settings", "Profile & data"],
        ["help", "How it works"],
      ]
    : [
        ["dashboard", "Operations dashboard"],
        ["requests", "All requests"],
        ["notifications", "Notifications"],
        ["settings", "Profiles & data"],
        ["help", "How it works"],
      ];
}
async function startApp() {
  localStorage.setItem("ufh-session", state.profile.id);
  $("#access").hidden = true;
  $("#topbar").hidden = false;
  $("#app-shell").hidden = false;
  $("#profile-button").textContent = state.profile.name;
  $$(".staff-only").forEach((x) => (x.hidden = state.profile.role !== "staff"));
  $("#main-nav").innerHTML = navItems()
    .map(([r, l]) => `<button class="nav-link" data-route="${r}">${l}</button>`)
    .join("");
  await updateBadge();
  route(location.hash.slice(1) || "dashboard");
}
async function route(value) {
  const [name, id] = value.split("/");
  state.route = name;
  $$(".nav-link").forEach((n) =>
    n.classList.toggle("active", n.dataset.route === name),
  );
  closeDrawer();
  location.hash = value;
  $("#view").innerHTML =
    '<div class="grid"><div class="skeleton"></div><div class="skeleton"></div></div>';
  await new Promise((r) => setTimeout(r, 120));
  if (name === "dashboard") await renderDashboard();
  else if (name === "report" && state.profile.role === "student")
    renderReport();
  else if (name === "requests") await renderRequests();
  else if (name === "request" && id) await renderDetail(id);
  else if (name === "notifications") await renderNotifications();
  else if (name === "settings") await renderSettings();
  else if (name === "help") renderHelp();
  else await renderDashboard();
  $("#main").focus();
}
async function scopedRequests() {
  const all = await repo.all("requests");
  return state.profile.role === "student"
    ? all.filter((r) => r.studentId === state.profile.id)
    : all;
}

/* ==================================================================
   6. Dashboards, request lists, metrics, and request cards
   ================================================================== */
async function renderDashboard() {
  const rows = await scopedRequests(),
    days = await threshold(),
    v = $("#view");
  const counts = {
    total: rows.length,
    open: rows.filter((r) => !["Completed", "Cancelled"].includes(r.status))
      .length,
    progress: rows.filter((r) => r.status === "In Progress").length,
    delayed: rows.filter((r) => r.status === "Delayed / On Hold").length,
    completed: rows.filter((r) => r.status === "Completed").length,
  };
  v.innerHTML = `<header class="page-head"><div><p class="eyebrow">${state.profile.role === "student" ? "Student workspace" : "Maintenance workspace"}</p><h1>${state.profile.role === "student" ? "Maintenance overview" : "Operations dashboard"}</h1><p class="muted">${state.profile.role === "student" ? "Your locally stored requests and updates." : "Live figures calculated from locally submitted requests."}</p></div>${state.profile.role === "student" ? '<button class="primary" data-route="report">Report an issue</button>' : '<button class="secondary" data-route="requests">Manage requests</button>'}</header><section class="metrics">${[
    ["Total", counts.total],
    ["Open", counts.open],
    ["In progress", counts.progress],
    ["Delayed", counts.delayed],
    ["Completed", counts.completed],
  ]
    .map(
      (x) =>
        `<article class="metric"><span>${x[0]}</span><strong>${x[1]}</strong></article>`,
    )
    .join("")}</section>${
    rows.length
      ? `<div class="detail-grid"><section><h2>Recent requests</h2><div class="request-list">${rows
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 5)
          .map(requestCard)
          .join(
            "",
          )}</div></section>${state.profile.role === "staff" ? `<aside class="panel"><h2>Operational breakdown</h2>${chart(rows, "category")}${chart(rows, "residence")}<p class="muted">${rows.filter((r) => overdue(r, days)).length} request(s) overdue using the ${days}-day threshold.</p></aside>` : await recentActivity(rows)}</div>`
      : `<div class="empty"><div class="empty-icon">⌁</div><h2>No maintenance requests yet</h2><p>${state.profile.role === "student" ? "Submit the first issue to generate a reference number and start its timeline." : "Create a student profile and submit a request; real operational figures will appear here."}</p>${state.profile.role === "student" ? '<button class="primary" data-route="report">Report the first issue</button>' : ""}</div>`
  }`;
}
function requestCard(r) {
  return `<article class="card request-card"><div><small>${esc(r.jobNo)}</small><h3>${esc(r.title)}</h3><p>${esc(r.residence)} · Floor ${esc(r.floor)} · Room ${esc(r.room)}</p></div><div><strong>${esc(r.category)}</strong><p>Updated ${fmt(r.updatedAt)}</p></div><div>${statusChip(r.status)} ${statusChip(r.finalPriority || r.suggestion.priority)}</div><button class="secondary" data-route="request/${r.id}">Open</button></article>`;
}
function chart(rows, key) {
  const counts = {};
  rows.forEach((r) => (counts[r[key]] = (counts[r[key]] || 0) + 1));
  const max = Math.max(...Object.values(counts), 1);
  return `<div class="chart-list">${Object.entries(counts)
    .slice(0, 6)
    .map(
      ([k, n]) =>
        `<div class="bar"><span>${esc(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${(n / max) * 100}%"></div></div><strong>${n}</strong></div>`,
    )
    .join("")}</div>`;
}
async function recentActivity(rows) {
  const events = rows
    .flatMap((r) => r.history.map((h) => ({ ...h, jobNo: r.jobNo })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);
  return `<aside class="panel"><h2>Recent activity</h2>${events.length ? events.map((e) => `<p><strong>${esc(e.jobNo)}</strong> · ${esc(e.type)}<br><small>${fmt(e.at)}</small></p>`).join("") : '<p class="muted">Activity appears after a request is submitted.</p>'}</aside>`;
}

/* ==================================================================
   7. Student report form, validation, images, and submission
   ================================================================== */
function renderReport() {
  state.formStep = 1;
  state.formImages = [];
  const saved = sessionStorage.getItem(`draft-${state.profile.id}`);
  state.draft = saved ? JSON.parse(saved) : {};
  drawForm();
}
function drawForm() {
  const d = state.draft || {},
    v = $("#view");
  v.innerHTML = `<section class="panel form-card"><header><p class="eyebrow">Step ${state.formStep} of 3</p><h1>Report a maintenance issue</h1><div class="steps">${[1, 2, 3].map((n) => `<span class="step ${n <= state.formStep ? "active" : ""}"></span>`).join("")}</div></header><form id="issue-form" novalidate>${state.formStep === 1 ? stepOne(d) : state.formStep === 2 ? stepTwo(d) : stepThree(d)}</form></section>`;
  $("#issue-form").addEventListener("input", saveDraftFromForm);
  $("#issue-form").addEventListener("submit", advanceForm);
  $("#image-input")?.addEventListener("change", processImages);
  $$("[data-remove-image]").forEach((b) =>
    b.addEventListener("click", () => {
      state.formImages.splice(+b.dataset.removeImage, 1);
      drawForm();
    }),
  );
}
function stepOne(d) {
  return `<div class="form-grid"><label class="field">Residence name<input name="residence" required value="${esc(d.residence)}" placeholder="Type the full residence name"><span class="error" data-error="residence"></span></label><label class="field">Floor<input name="floor" required value="${esc(d.floor)}" placeholder="e.g. Ground or 2"><span class="error" data-error="floor"></span></label><label class="field">Room number<input name="room" required value="${esc(d.room)}" placeholder="e.g. B14"><span class="error" data-error="room"></span></label><label class="field">Exact position or area<input name="location" required value="${esc(d.location)}" placeholder="e.g. beside the desk"><span class="error" data-error="location"></span></label><label class="field">Category<select name="category" required><option value="">Select a category</option>${CATEGORIES.map((c) => `<option ${d.category === c ? "selected" : ""}>${c}</option>`).join("")}</select><span class="error" data-error="category"></span></label><label class="field">Problem title<input name="title" required maxlength="90" value="${esc(d.title)}" placeholder="Short, specific title"><span class="error" data-error="title"></span></label><label class="field full">Detailed description<textarea name="description" required minlength="20" rows="6" placeholder="Explain what is wrong, when it started and any immediate risk.">${esc(d.description)}</textarea><span class="error" data-error="description"></span></label></div>${actions(false, "Continue")}`;
}
function stepTwo(d) {
  return `<div class="form-grid"><label class="field full">Photos <span class="hint">Capture or select JPEG, PNG or WebP images. Each is compressed before IndexedDB storage.</span><input id="image-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple></label><div class="preview-grid full">${state.formImages.map((x, i) => `<div class="preview"><img src="${x.url}" alt="Selected maintenance image ${i + 1}"><button class="danger" type="button" data-remove-image="${i}">Remove</button></div>`).join("")}</div><label class="field">Permission/access notes<textarea name="accessNotes" rows="4" placeholder="When can staff enter? Who should they contact?">${esc(d.accessNotes)}</textarea></label><label class="field">Preferred contact method<select name="contact"><option value="">No preference</option>${["In-app notification", "Email", "Phone"].map((x) => `<option ${d.contact === x ? "selected" : ""}>${x}</option>`).join("")}</select><span class="hint">Only in-app notifications operate in this prototype.</span></label><label class="field full"><span><input name="accessibilityNeed" type="checkbox" ${d.accessibilityNeed ? "checked" : ""}> I request practical access or communication assistance for this repair</span><span class="hint">Optional. Describe the assistance needed; do not provide a diagnosis.</span></label><label class="field full">Assistance note<textarea name="accessibilityNote" rows="3">${esc(d.accessibilityNote)}</textarea></label></div>${actions(true, "Review report")}`;
}
function stepThree(d) {
  return `<div class="review"><div><small>Location</small><strong>${esc(d.residence)}, Floor ${esc(d.floor)}, Room ${esc(d.room)}</strong><p>${esc(d.location)}</p></div><div><small>Issue</small><strong>${esc(d.title)}</strong><p>${esc(d.category)}</p></div><div class="full"><small>Description</small><p>${esc(d.description)}</p></div><div><small>Images</small><strong>${state.formImages.length}</strong></div><div><small>Automated suggestion</small><strong>${esc(recommendation({ ...d, images: state.formImages }).priority)}</strong><p>Maintenance makes the final decision.</p></div></div><label class="field"><span><input name="confirm" type="checkbox" required> I confirm that the information is accurate and the uploaded images are appropriate for maintenance use.</span><span class="error" data-error="confirm"></span></label>${actions(true, "Submit request", true)}`;
}
function actions(back, label, submit = false) {
  return `<div class="form-actions">${back ? '<button class="secondary" type="button" data-form-back>Back</button>' : '<button class="secondary" type="button" data-route="dashboard">Cancel</button>'}<button class="primary" type="submit">${submit ? '<span class="submit-label">' : ""}${label}${submit ? "</span>" : ""}</button></div>`;
}
function saveDraftFromForm(e) {
  const f = new FormData(e.currentTarget);
  for (const [k, v] of f) state.draft[k] = v;
  state.draft.accessibilityNeed = f.get("accessibilityNeed") === "on";
  sessionStorage.setItem(
    `draft-${state.profile.id}`,
    JSON.stringify(state.draft),
  );
}
function validate(form) {
  let ok = true;
  form.querySelectorAll("[required]").forEach((el) => {
    const valid =
      el.type === "checkbox"
        ? el.checked
        : el.value.trim() &&
          (el.name !== "description" || el.value.trim().length >= 20);
    const out = form.querySelector(`[data-error="${el.name}"]`);
    if (out)
      out.textContent = valid
        ? ""
        : el.name === "description"
          ? "Please provide at least 20 characters."
          : "This field is required.";
    el.setAttribute("aria-invalid", String(!valid));
    if (!valid) ok = false;
  });
  return ok;
}
async function advanceForm(e) {
  e.preventDefault();
  saveDraftFromForm(e);
  if (!validate(e.currentTarget)) return;
  if (state.formStep < 3) {
    state.formStep++;
    drawForm();
    return;
  }
  const button = e.submitter;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Saving request…';
  await submitRequest();
}
async function processImages(e) {
  const files = [...e.target.files];
  for (const file of files) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast(`${file.name} is not a supported image.`);
      continue;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast(`${file.name} is larger than 12 MB.`);
      continue;
    }
    const blob = await compressImage(file);
    state.formImages.push({
      id: uid(),
      blob,
      url: URL.createObjectURL(blob),
      name: file.name,
      type: blob.type,
    });
  }
  drawForm();
}
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(),
      url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1600,
        scale = Math.min(1, max / Math.max(img.width, img.height)),
        c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(
        (b) => {
          URL.revokeObjectURL(url);
          b ? resolve(b) : reject(new Error("Image processing failed"));
        },
        "image/jpeg",
        0.82,
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}
async function submitRequest() {
  const d = state.draft,
    suggestion = recommendation({ ...d, images: state.formImages }),
    stamp = now(),
    all = await repo.all("requests"),
    jobNo = `UFH-${new Date().getFullYear()}-${String(all.length + 1).padStart(4, "0")}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const request = {
    id: uid(),
    jobNo,
    studentId: state.profile.id,
    studentName: state.profile.name,
    residence: d.residence.trim(),
    floor: d.floor.trim(),
    room: d.room.trim(),
    location: d.location.trim(),
    category: d.category,
    title: d.title.trim(),
    description: d.description.trim(),
    images: state.formImages.map((x) => ({
      id: x.id,
      blob: x.blob,
      name: x.name,
      type: x.type,
    })),
    accessNotes: d.accessNotes || "",
    contact: d.contact || "",
    accessibilityNeed: !!d.accessibilityNeed,
    accessibilityNote: d.accessibilityNote || "",
    suggestion,
    finalPriority: suggestion.priority,
    status: "Received",
    assigneeId: null,
    assigneeName: "",
    expectedDate: "",
    delayReason: "",
    materials: "",
    completionSummary: "",
    feedback: "",
    createdAt: stamp,
    updatedAt: stamp,
    lastProgressAt: stamp,
    history: [
      {
        id: uid(),
        at: stamp,
        actorId: state.profile.id,
        actor: state.profile.name,
        type: "Request submitted",
        publicText: "Request received and reference number created.",
        internalText: "",
      },
    ],
  };
  await repo.put("requests", request);
  await notify(state.profile.id, request.id, `${jobNo} was received.`);
  sessionStorage.removeItem(`draft-${state.profile.id}`);
  state.draft = null;
  state.formImages = [];
  $("#view").innerHTML =
    `<section class="panel success"><div class="success-mark">✓</div><p class="eyebrow">Request received</p><h1>${esc(jobNo)}</h1><p>Save this reference number. Maintenance can now review the report.</p><div class="form-actions"><button class="secondary" data-route="dashboard">Dashboard</button><button class="primary" data-route="request/${request.id}">Open request</button></div></section>`;
  await updateBadge();
}

/* ==================================================================
   8. Request filtering, details, and staff/student actions
   ================================================================== */
async function renderRequests() {
  const rows = await scopedRequests(),
    staff = state.profile.role === "staff",
    profiles = staff
      ? (await repo.all("profiles")).filter((p) => p.role === "staff")
      : [],
    residences = [...new Set(rows.map((r) => r.residence))].sort(),
    days = await threshold();
  $("#view").innerHTML =
    `<header class="page-head"><div><p class="eyebrow">${staff ? "Request management" : "Request tracking"}</p><h1>${staff ? "All requests" : "My requests"}</h1></div>${staff ? "" : '<button class="primary" data-route="report">Report an issue</button>'}</header><div class="toolbar"><input id="request-search" placeholder="Search job, title, residence, room or description" aria-label="Search requests"><select id="status-filter"><option value="">All statuses</option>${STATUS.map((s) => `<option>${s}</option>`).join("")}</select><select id="category-filter"><option value="">All categories</option>${CATEGORIES.map((s) => `<option>${s}</option>`).join("")}</select>${staff ? `<select id="residence-filter"><option value="">All residences</option>${residences.map((s) => `<option>${esc(s)}</option>`).join("")}</select><select id="priority-filter"><option value="">All priorities</option><option>High</option><option>Medium</option><option>Low</option></select><select id="assignee-filter"><option value="">All assignees</option><option value="unassigned">Unassigned</option>${profiles.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select><select id="access-filter"><option value="">All assistance states</option><option value="yes">Assistance requested</option><option value="no">No assistance request</option></select><select id="overdue-filter"><option value="">All ages</option><option value="yes">Overdue only</option></select><input id="date-filter" type="date" aria-label="Filter by submission date">` : ""}<select id="sort-filter"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="waiting">Longest waiting</option><option value="priority">Urgency</option><option value="status">Status</option></select></div><div id="filtered-list" class="request-list"></div>`;
  const paint = () => {
    const val = (id) => $(id)?.value || "",
      q = val("#request-search").toLowerCase(),
      rank = { High: 3, Medium: 2, Low: 1 };
    let out = rows.filter(
      (r) =>
        (!q ||
          [r.jobNo, r.title, r.residence, r.floor, r.room, r.description]
            .join(" ")
            .toLowerCase()
            .includes(q)) &&
        (!val("#status-filter") || r.status === val("#status-filter")) &&
        (!val("#category-filter") || r.category === val("#category-filter")) &&
        (!val("#residence-filter") ||
          r.residence === val("#residence-filter")) &&
        (!val("#priority-filter") ||
          r.finalPriority === val("#priority-filter")) &&
        (!val("#assignee-filter") ||
          (val("#assignee-filter") === "unassigned"
            ? !r.assigneeId
            : r.assigneeId === val("#assignee-filter"))) &&
        (!val("#access-filter") ||
          (val("#access-filter") === "yes") === r.accessibilityNeed) &&
        (!val("#overdue-filter") || overdue(r, days)) &&
        (!val("#date-filter") ||
          r.createdAt.slice(0, 10) === val("#date-filter")),
    );
    const sort = val("#sort-filter");
    out.sort((a, b) =>
      sort === "oldest"
        ? a.createdAt.localeCompare(b.createdAt)
        : sort === "waiting"
          ? a.lastProgressAt.localeCompare(b.lastProgressAt)
          : sort === "priority"
            ? rank[b.finalPriority] - rank[a.finalPriority]
            : sort === "status"
              ? a.status.localeCompare(b.status)
              : b.createdAt.localeCompare(a.createdAt),
    );
    $("#filtered-list").innerHTML = out.length
      ? out.map(requestCard).join("")
      : '<div class="empty"><h2>No matching requests</h2><p>Adjust the search or filters.</p></div>';
  };
  $$(".toolbar input,.toolbar select").forEach((x) =>
    x.addEventListener("input", paint),
  );
  paint();
}
async function renderDetail(id) {
  const r = await repo.get("requests", id);
  if (
    !r ||
    (state.profile.role === "student" && r.studentId !== state.profile.id)
  ) {
    toast("Request not found for this profile.");
    return route("requests");
  }
  r.images = r.images || [];
  r.completionImages = r.completionImages || [];
  state.request = r;
  const staff = state.profile.role === "staff";
  $("#view").innerHTML =
    `<header class="page-head"><div><p class="eyebrow">${esc(r.jobNo)}</p><h1>${esc(r.title)}</h1><p>${statusChip(r.status)} ${statusChip(r.finalPriority)}</p></div><div><button class="secondary" data-print>Print summary</button> <button class="secondary" data-route="requests">Back</button></div></header><div class="detail-grid"><section class="panel"><h2>Request details</h2><p>${esc(r.description)}</p><div class="gallery preview-grid">${r.images.map((x, i) => `<button type="button" data-image="${i}"><img src="${URL.createObjectURL(x.blob)}" alt="Maintenance evidence ${i + 1} for ${esc(r.jobNo)}"></button>`).join("")}</div>${r.completionImages.length ? `<h3>Completion evidence</h3><div class="gallery preview-grid">${r.completionImages.map((x, i) => `<img src="${URL.createObjectURL(x.blob)}" alt="Completion evidence ${i + 1} for ${esc(r.jobNo)}">`).join("")}</div>` : ""}<div class="meta-grid"><div><small>Location</small>${esc(r.residence)}, Floor ${esc(r.floor)}, Room ${esc(r.room)} · ${esc(r.location)}</div><div><small>Category</small>${esc(r.category)}</div><div><small>Submitted</small>${fmt(r.createdAt)}</div><div><small>Assigned to</small>${esc(r.assigneeName || "Not assigned")}</div><div><small>Expected attendance</small>${esc(r.expectedDate || "No reliable date yet")}</div><div><small>Access assistance</small>${r.accessibilityNeed ? "Requested" : "Not requested"}</div>${r.delayReason ? `<div class="full"><small>Delay reason</small>${esc(r.delayReason)}</div>` : ""}</div><h2>Activity timeline</h2><ol class="timeline">${r.history
      .sort((a, b) => b.at.localeCompare(a.at))
      .filter((h) => staff || h.publicText)
      .map(
        (h) =>
          `<li><strong>${esc(h.type)}</strong>${h.publicText ? `<p>${esc(h.publicText)}</p>` : ""}${staff && h.internalText ? `<p><em>Internal: ${esc(h.internalText)}</em></p>` : ""}<small>${fmt(h.at)} · ${esc(h.actor)}</small></li>`,
      )
      .join(
        "",
      )}</ol></section><aside class="panel">${staff ? await staffControls(r) : studentControls(r)}</aside></div>`;
}
function studentControls(r) {
  const cancellable = r.status === "Received",
    completed = r.status === "Completed";
  return `<h2>Request actions</h2><p>Maintenance staff make the final priority decision.</p><div class="panel"><strong>Automated suggestion: ${esc(r.suggestion.priority)}</strong><p>${r.suggestion.reasons.map(esc).join(" · ")}</p></div>${cancellable ? '<button class="danger wide" data-student-action="cancel">Cancel request</button>' : ""}${completed ? `<form id="feedback-form" class="staff-form"><label class="field">Completion feedback<textarea name="feedback" rows="3" placeholder="Was the issue resolved?"></textarea></label><button class="secondary" type="submit">Save feedback</button><button class="danger" type="button" data-student-action="reopen">Reopen or dispute</button></form>` : ""}`;
}
async function staffControls(r) {
  const profiles = (await repo.all("profiles")).filter(
    (p) => p.role === "staff",
  );
  return `<h2>Maintenance controls</h2><div class="panel"><p class="eyebrow">Automated suggestion</p><strong>${esc(r.suggestion.category)} · ${esc(r.suggestion.priority)}</strong><p>${r.suggestion.reasons.map(esc).join(" · ")}</p><small>Deterministic rules, not a live AI model. Staff make the final decision.</small></div><form id="staff-update" class="staff-form"><label class="field">Final priority<select name="priority">${["High", "Medium", "Low"].map((x) => `<option ${r.finalPriority === x ? "selected" : ""}>${x}</option>`).join("")}</select></label><label class="field">Status<select name="status">${STATUS.map((x) => `<option ${r.status === x ? "selected" : ""}>${x}</option>`).join("")}</select></label><label class="field">Assign to<select name="assignee"><option value="">Unassigned</option>${profiles.map((p) => `<option value="${p.id}" ${r.assigneeId === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label><label class="field">Expected attendance<input name="expectedDate" type="date" value="${esc(r.expectedDate)}"></label><label class="field">Delay reason<textarea name="delayReason" rows="2">${esc(r.delayReason)}</textarea></label><label class="field">Materials or specialist assistance<textarea name="materials" rows="2">${esc(r.materials)}</textarea></label><label class="field">Student-visible update<textarea name="publicText" rows="3"></textarea></label><label class="field">Internal note<textarea name="internalText" rows="3"></textarea></label><label class="field">Completion summary<textarea name="completionSummary" rows="3">${esc(r.completionSummary)}</textarea></label><label class="field">Optional completion image<input name="completionImage" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label><button class="primary" type="submit">Save update</button></form>`;
}
async function saveStaff(form) {
  const f = new FormData(form),
    r = state.request,
    next = f.get("status");
  if (next === "Delayed / On Hold" && !f.get("delayReason").trim()) {
    toast("A student-visible delay reason is required.");
    return;
  }
  if (next === "Completed" && !f.get("completionSummary").trim()) {
    toast("A completion summary is required.");
    return;
  }
  const profiles = await repo.all("profiles"),
    assignee = profiles.find((p) => p.id === f.get("assignee")),
    changes = [];
  if (r.finalPriority !== f.get("priority"))
    changes.push(
      `Final priority changed from ${r.finalPriority} to ${f.get("priority")}`,
    );
  if (r.status !== next)
    changes.push(`Status changed from ${r.status} to ${next}`);
  r.finalPriority = f.get("priority");
  r.status = next;
  r.assigneeId = assignee?.id || null;
  r.assigneeName = assignee?.name || "";
  r.expectedDate = f.get("expectedDate");
  r.delayReason = f.get("delayReason").trim();
  r.materials = f.get("materials").trim();
  r.completionSummary = f.get("completionSummary").trim();
  r.completionImages = r.completionImages || [];
  const file = f.get("completionImage");
  if (file && file.size) {
    if (
      !/^image\/(jpeg|png|webp)$/.test(file.type) ||
      file.size > 12 * 1024 * 1024
    ) {
      toast("Choose a JPEG, PNG or WebP completion image under 12 MB.");
      return;
    }
    const blob = await compressImage(file);
    r.completionImages.push({
      id: uid(),
      blob,
      name: file.name,
      type: blob.type,
    });
    changes.push("Completion image attached");
  }
  const pub = f.get("publicText").trim(),
    internal = f.get("internalText").trim(),
    stamp = now();
  if (pub) changes.push(pub);
  r.updatedAt = stamp;
  r.lastProgressAt = stamp;
  r.history.push({
    id: uid(),
    at: stamp,
    actorId: state.profile.id,
    actor: state.profile.name,
    type: "Maintenance update",
    publicText: changes.join(" · "),
    internalText: internal,
  });
  await repo.put("requests", r);
  if (changes.length)
    await notify(r.studentId, r.id, `${r.jobNo}: ${changes.join(" · ")}`);
  toast("Request updated.");
  await renderDetail(r.id);
  await updateBadge();
}
async function studentAction(action) {
  const r = state.request,
    reason =
      action === "reopen"
        ? prompt("Briefly explain what remains unresolved:")
        : "";
  if (action === "reopen" && !reason) return;
  if (action === "cancel" && !confirm("Cancel this newly submitted request?"))
    return;
  const stamp = now();
  r.status = action === "cancel" ? "Cancelled" : "Reopened";
  r.updatedAt = r.lastProgressAt = stamp;
  r.history.push({
    id: uid(),
    at: stamp,
    actorId: state.profile.id,
    actor: state.profile.name,
    type: r.status,
    publicText: reason || "Request cancelled before work began.",
    internalText: "",
  });
  await repo.put("requests", r);
  await notify(r.studentId, r.id, `${r.jobNo} is now ${r.status}.`);
  toast(`Request ${r.status.toLowerCase()}.`);
  renderDetail(r.id);
}

/* ==================================================================
   9. Notifications, settings, import/export, and supporting views
   ================================================================== */
async function renderNotifications() {
  const all = (await repo.all("notifications"))
    .filter((n) => n.profileId === state.profile.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  $("#view").innerHTML =
    `<header class="page-head"><div><p class="eyebrow">In-app updates</p><h1>Notifications</h1></div><button class="secondary" data-mark-all>Mark all as read</button></header><section class="panel">${all.length ? all.map((n) => `<button class="notification ${n.readAt ? "" : "unread"}" data-notification="${n.id}" data-request="${n.requestId}"><span>${esc(n.message)}</span><time>${fmt(n.createdAt)}</time></button>`).join("") : '<div class="empty"><h2>No notifications</h2><p>Submission and status updates will appear here.</p></div>'}</section>`;
}
async function markNotification(id, requestId) {
  const n = await repo.get("notifications", id);
  if (n) {
    n.readAt = now();
    await repo.put("notifications", n);
  }
  await updateBadge();
  if (requestId) route(`request/${requestId}`);
}
async function updateBadge() {
  if (!state.profile) return;
  const n = (await repo.all("notifications")).filter(
    (x) => x.profileId === state.profile.id && !x.readAt,
  ).length;
  $("#notification-count").textContent = n;
  $("#notification-count").hidden = !n;
}
async function renderSettings() {
  const days = await threshold();
  $("#view").innerHTML =
    `<header class="page-head"><div><p class="eyebrow">Local prototype settings</p><h1>Profile & data</h1></div></header><div class="detail-grid"><section class="panel"><h2>Current profile</h2><form id="edit-profile" class="staff-form"><label class="field">Display name<input name="name" required value="${esc(state.profile.name)}"></label><label class="field">Contact detail<input name="email" value="${esc(state.profile.email || "")}"></label><p class="muted">Role: ${esc(state.profile.role)}. Local profiles are not production authentication.</p><button class="primary" type="submit">Save profile</button></form><button class="secondary wide" data-sign-out>Switch or create profile</button></section><aside class="panel"><h2>Prototype data</h2>${state.profile.role === "staff" ? `<label class="field">Overdue threshold<select id="threshold">${[5, 6, 7].map((n) => `<option value="${n}" ${days === n ? "selected" : ""}>${n} days</option>`).join("")}</select></label>` : ""}<div class="grid"><button class="secondary" data-export>Export JSON backup</button><label class="secondary" style="text-align:center">Import JSON backup<input id="import-file" type="file" accept="application/json" hidden></label><button class="danger" data-reset>Clear all prototype data</button></div></aside></div>`;
}
async function threshold() {
  return +(await repo.get("settings", "overdueDays"))?.value || 7;
}
async function exportData() {
  const data = {
    format: "UFH-MAINTENANCE-PROTOTYPE",
    version: 2,
    exportedAt: now(),
  };
  for (const s of STORES) data[s] = await repo.all(s);
  for (const r of data.requests)
    for (const img of [...(r.images || []), ...(r.completionImages || [])])
      ((img.data = await blobToData(img.blob)), delete img.blob);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  a.download = `ufh-maintenance-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Prototype data exported.");
}
const blobToData = (blob) =>
    new Promise((ok) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.readAsDataURL(blob);
    }),
  dataToBlob = async (data) => (await fetch(data)).blob();
async function importData(file) {
  const data = JSON.parse(await file.text());
  if (
    data.format !== "UFH-MAINTENANCE-PROTOTYPE" ||
    !Array.isArray(data.requests)
  )
    throw new Error("This is not a UFH prototype export.");
  for (const s of STORES) await repo.clear(s);
  for (const r of data.requests)
    for (const img of [...(r.images || []), ...(r.completionImages || [])])
      if (img.data) {
        img.blob = await dataToBlob(img.data);
        delete img.data;
      }
  for (const s of STORES)
    for (const item of data[s] || []) await repo.put(s, item);
  localStorage.removeItem("ufh-session");
  toast("Import complete. Reloading…");
  setTimeout(() => location.reload(), 600);
}
async function resetData() {
  if (
    !confirm(
      "Clear every local profile, request, image, notification and setting from this browser?",
    )
  )
    return;
  if (!confirm("This cannot be undone unless you exported a backup. Continue?"))
    return;
  for (const s of STORES) await repo.clear(s);
  localStorage.removeItem("ufh-session");
  sessionStorage.clear();
  location.reload();
}
function renderHelp() {
  $("#view").innerHTML =
    `<header class="page-head"><div><p class="eyebrow">Implemented behaviour</p><h1>How it works</h1></div></header><div class="detail-grid"><section class="panel"><h2>For students</h2><ol><li>Create or select a local student profile.</li><li>Report an issue with residence, floor, room, details and optional compressed images.</li><li>Track the reference, timeline and maintenance updates.</li><li>Cancel before work begins, or provide feedback/reopen after completion.</li></ol></section><section class="panel"><h2>For maintenance staff</h2><ol><li>Create or select a staff profile.</li><li>Open real locally submitted requests.</li><li>Review the deterministic suggestion and set the final priority.</li><li>Assign, update, delay with a reason, and complete with a summary.</li></ol><p class="muted">All information is stored in IndexedDB in this browser. Export a backup before clearing browser data.</p></section></div>`;
}
function openProfileModal() {
  modal(
    "Create local profile",
    `<form id="profile-form" class="staff-form"><label class="field">Display name<input name="name" required maxlength="80"></label><label class="field">Email or contact detail <span class="hint">Optional</span><input name="email" maxlength="120"></label><label class="field">Prototype role<select name="role"><option value="student">Student</option><option value="staff">Maintenance staff</option></select></label><p class="muted">This profile is stored only in this browser and is not secure institutional authentication.</p><button class="primary" type="submit">Create profile</button></form>`,
  );
}
function openImage(index) {
  const x = state.request.images[index];
  modal(
    "Maintenance image",
    `<img src="${URL.createObjectURL(x.blob)}" alt="Enlarged maintenance evidence" style="max-width:100%;border-radius:12px">`,
  );
}
function toggleDrawer() {
  const open = !$("#sidebar").classList.contains("open");
  $("#sidebar").classList.toggle("open", open);
  $("#drawer-backdrop").hidden = !open;
  $("#menu-toggle").setAttribute("aria-expanded", String(open));
}
function closeDrawer() {
  $("#sidebar").classList.remove("open");
  $("#drawer-backdrop").hidden = true;
  $("#menu-toggle").setAttribute("aria-expanded", "false");
}

/* ==================================================================
   10. Delegated browser event handling
   ================================================================== */
document.addEventListener("click", async (e) => {
  const routeButton = e.target.closest("[data-route]");
  if (routeButton) return route(routeButton.dataset.route);
  if (e.target.closest("[data-close-modal]")) return closeModal();
  if (e.target.closest("#new-profile")) return openProfileModal();
  const pick = e.target.closest("[data-select-profile]");
  if (pick) {
    state.profile = await repo.get("profiles", pick.dataset.selectProfile);
    return startApp();
  }
  if (e.target.closest("[data-form-back]")) {
    state.formStep--;
    return drawForm();
  }
  const action = e.target.closest("[data-student-action]");
  if (action) return studentAction(action.dataset.studentAction);
  const note = e.target.closest("[data-notification]");
  if (note)
    return markNotification(note.dataset.notification, note.dataset.request);
  if (e.target.closest("[data-mark-all]")) {
    const list = (await repo.all("notifications")).filter(
      (n) => n.profileId === state.profile.id,
    );
    for (const n of list) {
      n.readAt = n.readAt || now();
      await repo.put("notifications", n);
    }
    toast("All notifications marked as read.");
    await updateBadge();
    return renderNotifications();
  }
  if (e.target.closest("[data-export]")) return exportData();
  if (e.target.closest("[data-reset]")) return resetData();
  if (
    e.target.closest("[data-sign-out]") ||
    e.target.closest("#profile-button")
  ) {
    localStorage.removeItem("ufh-session");
    return showAccess();
  }
  const img = e.target.closest("[data-image]");
  if (img) return openImage(+img.dataset.image);
  if (e.target.closest("[data-print]")) return print();
  if (e.target.closest("#menu-toggle")) return toggleDrawer();
  if (e.target.closest("#drawer-backdrop")) return closeDrawer();
  if (e.target.closest("#notifications-button")) return route("notifications");
  if (e.target.closest("#theme-toggle") || e.target.closest("#access-theme"))
    return setTheme(
      document.documentElement.dataset.theme === "dark" ? "light" : "dark",
    );
  if (e.target.closest("#global-search-btn")) {
    route("requests").then(() => $("#request-search")?.focus());
  }
});
document.addEventListener("submit", async (e) => {
  if (e.target.id === "profile-form") {
    e.preventDefault();
    const f = new FormData(e.target),
      p = {
        id: uid(),
        name: f.get("name").trim(),
        email: f.get("email").trim(),
        role: f.get("role"),
        createdAt: now(),
      };
    if (!p.name) return;
    await repo.put("profiles", p);
    closeModal();
    state.profile = p;
    return startApp();
  }
  if (e.target.id === "staff-update") {
    e.preventDefault();
    return saveStaff(e.target);
  }
  if (e.target.id === "feedback-form") {
    e.preventDefault();
    state.request.feedback = new FormData(e.target).get("feedback").trim();
    state.request.updatedAt = now();
    await repo.put("requests", state.request);
    toast("Feedback saved.");
    return renderDetail(state.request.id);
  }
  if (e.target.id === "edit-profile") {
    e.preventDefault();
    const f = new FormData(e.target);
    state.profile.name = f.get("name").trim();
    state.profile.email = f.get("email").trim();
    await repo.put("profiles", state.profile);
    $("#profile-button").textContent = state.profile.name;
    toast("Profile updated.");
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.id === "threshold") {
    await repo.put("settings", { key: "overdueDays", value: +e.target.value });
    toast("Overdue threshold updated.");
  }
  if (e.target.id === "import-file" && e.target.files[0])
    try {
      await importData(e.target.files[0]);
    } catch (err) {
      toast(err.message);
    }
});
window.addEventListener(
  "hashchange",
  () => state.profile && route(location.hash.slice(1) || "dashboard"),
);
window.addEventListener("beforeunload", (e) => {
  if (
    state.route === "report" &&
    state.draft &&
    Object.keys(state.draft).length
  ) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("error", (e) => {
  console.error(e.error || e.message);
});

// Start independent homepage motion before opening the local application data.
initHeroSlideshow();
boot();
