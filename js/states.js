/* All Indian states and union territories, with Telugu names.
   Loaded before js/app.js. See js/app.js for the searchable picker that uses it. */

const STATES = [
  ["Andaman and Nicobar Islands", "అండమాన్ నికోబార్ దీపులు", 1],
  ["Andhra Pradesh", "ఆంధ్రప్రదేశ్", 0],
  ["Arunachal Pradesh", "అరుణాచల్ ప్రదేశ్", 1],
  ["Assam", "అసం", 1],
  ["Bihar", "బిహార", 0],
  ["Chandigarh", "చండీగఢ్", 1],
  ["Chhattisgarh", "ఛత్తీస్‌గఢ్", 0],
  [
    "Dadra and Nagar Haveli and Daman and Diu",
    "దాద్రా నగర్ హవేలీ మరియు దమన్ దియూ",
    1,
  ],
  ["Delhi", "దిల్లీ", 1],
  ["Goa", "గోవా", 0],
  ["Gujarat", "గుజరాత్", 0],
  ["Haryana", "హర్యానా", 0],
  ["Himachal Pradesh", "హిమాచల్ ప్రదేశ్", 0],
  ["Jammu and Kashmir", "జమ్మూ కాశ్మీర్", 1],
  ["Jharkhand", "ఝార్కండ్", 0],
  ["Karnataka", "కర్ణాటక", 0],
  ["Kerala", "కేరళ", 0],
  ["Ladakh", "లడాఖ్", 1],
  ["Lakshadweep", "లక్షద్వీప్", 1],
  ["Madhya Pradesh", "మధ్యప్రదేశ్", 0],
  ["Maharashtra", "మహారాష్ట్ర", 0],
  ["Manipur", "మణిపూర్", 1],
  ["Meghalaya", "మేఘాలయ", 1],
  ["Mizoram", "మిజోరం", 1],
  ["Nagaland", "నాగాలాండ్", 1],
  ["Odisha", "ఒడిశా", 0],
  ["Puducherry", "పుదుచ్చేరి", 1],
  ["Punjab", "పంజాబ్", 0],
  ["Rajasthan", "రాజస్థాన్", 0],
  ["Sikkim", "సిక్కిమ", 1],
  ["Tamil Nadu", "తమిళనాడు", 0],
  ["Telangana", "తెలంగాణ", 0],
  ["Tripura", "త్రిపుర", 1],
  ["Uttar Pradesh", "ఉత్తర ప్రదేశ్", 0],
  ["Uttarakhand", "ఉత్తరాఖండ్", 0],
  ["West Bengal", "పశ్చిమ బెంగాలు", 0],
].map(([en, te, ut]) => ({ en, te, ut }));

/* How a state should be named in the interface. */
const STATE_LABEL = (x) =>
  x + (STATES.find((s) => s.en === x)?.ut ? " (UT)" : "");

/* Fuzzy-ish match: finds states by English or Telugu name, anywhere in the
   string, so "hyd", "Hyd" and "హైదరాబాద్" style input still works.
   Ranking: starts-with beats contains, so typing "te" shows Telangana first. */
function matchStates(q) {
  q = String(q || "")
    .trim()
    .toLowerCase();
  if (!q) return STATES.slice();
  const start = [],
    inner = [];
  for (const s of STATES) {
    const en = s.en.toLowerCase(),
      te = s.te;
    if (en.startsWith(q) || te.startsWith(q)) start.push(s);
    else if (en.includes(q) || te.includes(q)) inner.push(s);
  }
  return [...start, ...inner];
}

/* Renders a searchable state input.
   Pickers are wired up with delegated events on document, so they keep
   working after the page re-renders (see pickState wiring at the bottom). */
function statePicker(id, value, attrs) {
  const v = value || "";
  const list = STATES.map(
    (s) => `<option value="${esc(s.en)}">${esc(s.te)}</option>`,
  ).join("");
  return (
    `<span class="pk">` +
    `<input id="${id}" class="pk-in" list="${id}-dl" value="${esc(v)}" placeholder="Search states and UTs" autocomplete="off" spellcheck="false" ${attrs || ""}>` +
    `<datalist id="${id}-dl">${list}</datalist>` +
    `<span class="pk-sb" id="${id}-sb" role="listbox" hidden></span></span>`
  );
}

/* Shows the matching states under the input. Called on every keystroke.
   The native <datalist> does the real work on mobile; this panel adds
   substring and Telugu matching, which datalist does not do. */
function pickShow(input) {
  const box = document.getElementById(input.id + "-sb");
  if (!box) return;
  const hits = matchStates(input.value);
  if (hits.length === 0 || input.value.trim() === "") {
    box.hidden = true;
    return;
  }
  box.innerHTML = hits
    .map(
      (s) =>
        `<button type="button" class="pk-o" data-v="${esc(s.en)}">` +
        `<span>${esc(s.en)}</span>${s.ut ? '<b class="pk-ut">UT</b>' : ""}<i lang="te">${esc(s.te)}</i></button>`,
    )
    .join("");
  box.hidden = false;
}

function pickHide(input) {
  const box = document.getElementById(input.id + "-sb");
  if (box) box.hidden = true;
}

/* True when the typed text is a state we recognise. Used to validate the
   form, so a donor cannot save "Hydrabad" and become invisible in search. */
function isValidState(v) {
  const n = String(v || "")
    .trim()
    .toLowerCase();
  return STATES.some((s) => s.en.toLowerCase() === n);
}

function initStatePickers() {
  document.addEventListener("input", (e) => {
    const i = e.target;
    if (i.classList && i.classList.contains("pk-in")) pickShow(i);
  });
  // Choosing from the helper panel. blur fires before click, so let the
  // mousedown through by reading the target during the event itself.
  document.addEventListener("mousedown", (e) => {
    const o = e.target.closest ? e.target.closest(".pk-o") : null;
    if (!o) return;
    e.preventDefault();
    const inp = o.closest(".pk").querySelector(".pk-in");
    inp.value = o.dataset.v;
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    pickHide(inp);
  });
  document.addEventListener("focusout", (e) => {
    const i = e.target;
    if (i.classList && i.classList.contains("pk-in"))
      setTimeout(() => pickHide(i), 80);
  });
}
