/* Mana Raktha Datha - application logic, views and translations. Loaded after js/config.js. */
const G = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
// who can donate to each recipient group
const CAN_GIVE = {
  "O-": ["O-"],
  "O+": ["O+", "O-"],
  "A-": ["A-", "O-"],
  "A+": ["A+", "A-", "O+", "O-"],
  "B-": ["B-", "O-"],
  "B+": ["B+", "B-", "O+", "O-"],
  "AB-": ["AB-", "A-", "B-", "O-"],
  "AB+": G,
};
const S = {
  lang: "en",
  reqs: [],
  reports: [],
  rep: null,
  user: null,
  view: "home",
  reveals: new Set(),
  auth: { mode: "register", step: "form", data: null, otp: null },
  q: { group: "", state: "", compat: true },
  users: [],
  donors: [],
};
const $ = (s) => document.querySelector(s);
const ok = (d) => (d.status || "approved") === "approved";
const esc = (t) =>
  String(t).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function toast(m) {
  const t = $("#toast");
  t.textContent = m;
  t.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("on"), 3500);
}
function go(v) {
  S.view = v;
  S.qk = "";
  S.al = 0;
  S.rl = 0;
  S.donors = [];
  render();
  scrollTo(0, 0);
}
function opts(a, sel, all) {
  return (
    (all ? `<option value="">${all}</option>` : "") +
    a
      .map((x) => `<option ${x === sel ? "selected" : ""}>${x}</option>`)
      .join("")
  );
}

function tabbar() {
  const u = S.user,
    v = S.view,
    t = [
      ["home", "🏠", "Home", "go('home')"],
      ["search", "🔎", "Search", "go('search')"],
      ["emergency", "🚨", "Emergency", "go('emergency')"],
      ["info", "ℹ️", "Info", "go('info')"],
      u
        ? u.admin
          ? ["admin", "🛠️", "Admin", "go('admin')"]
          : ["profile", "👤", "Profile", "go('profile')"]
        : ["auth", "👤", "Log in", "startAuth('login')"],
    ];
  $("#tabbar").innerHTML = t
    .map(
      (x) =>
        `<button class="${v === x[0] ? "on" : ""}" onclick="${x[3]}"><i>${x[1]}</i><span>${x[2]}</span></button>`,
    )
    .join("");
}
function renderNav() {
  tabbar();
  $("#nav").innerHTML =
    `<button onclick="go('home')">Home</button><button onclick="go('search')">Find donors</button><button onclick="go('emergency')">Emergency</button><button onclick="go('info')">Info</button>` +
    (S.user
      ? (S.user.admin
          ? `<button onclick="go('admin')">Admin</button>`
          : `<button onclick="go('profile')">My profile</button>`) +
        `<button class="pill" onclick="logout()">Log out</button>`
      : `<button onclick="startAuth('login')">Log in</button><button class="pill" onclick="startAuth('register')">Register</button>`);
}
const SPOT =
  () => `<section class="spot"><img class="spotimg" src="${IMG.trio}" alt="Donors connected by a blood drop with a heart">
<div><h2>One donation can help save up to three lives</h2><p>Whole blood is separated into parts, so a single donation can reach more than one patient. Every donor here is a neighbour ready to help.</p>${MEDIA.photo ? `<img class="photo" src="${MEDIA.photo}" alt="Blood donation" loading="lazy">` : ""}</div></section>${MEDIA.video ? `<div class="vid"><iframe src="${MEDIA.video}" title="Why donate blood" allowfullscreen loading="lazy"></iframe></div>` : ""}`;
function SITE() {
  return location.href.split("#")[0];
}
{
  const h = location.hash.slice(1);
  if (
    [
      "about",
      "privacy",
      "terms",
      "disclaimer",
      "contact",
      "info",
      "emergency",
    ].includes(h)
  )
    S.view = h;
}
function anim() {
  const els = document.querySelectorAll(".steps li,.facts,.spot,.card,.vid");
  if (typeof IntersectionObserver !== "function") return;
  const io = new IntersectionObserver(
    (es) =>
      es.forEach((x) => {
        if (x.isIntersecting) {
          x.target.classList.add("in");
          io.unobserve(x.target);
        }
      }),
    { threshold: 0.1 },
  );
  els.forEach((e, i) => {
    e.classList.add("rv");
    e.style.setProperty("--d", Math.min(i % 6, 5) * 0.07 + "s");
    io.observe(e);
  });
}
const V = {};
V.home = () => `<div class="wrap">
<section class="hero2"><div class="txt">
<h1>Someone nearby has the blood group you need.</h1>
<p>Register once, search by blood group and state, and call a verified donor directly. Free for donors and for families.</p>
<p><button class="btn" onclick="go('search')">Find a donor</button> <button class="btn ghost" onclick="startAuth('register')">Become a donor</button></p></div></section>
<section class="pickg"><h2>Pick a blood group</h2><p class="note">Tap a blood group to search</p><div class="drops" aria-label="Pick a blood group">${G.map((g) => `<button class="drop" aria-label="Search ${g}" onclick="pick('${g}')"><span>${g}</span></button>`).join("")}</div></section>
<div class="demo" style="margin-top:14px"><strong>Urgent need?</strong> <a href="#" onclick="go('emergency');return false">See or post an emergency request</a></div>
<svg class="beat" viewBox="0 0 600 36" preserveAspectRatio="none" aria-hidden="true"><path d="M0 18H210L228 18 240 4 254 32 266 18H600"/></svg>
${SPOT()}<h2>How it works</h2>
<ol class="steps"><li><img class="ic" src="${IMG.step1}" alt=""><h3>Register</h3>Enter your email, confirm the 6-digit code we send, and add your blood group and state.</li>
<li><img class="ic" src="${IMG.step2}" alt=""><h3>Search</h3>Choose the blood group and state. We list donors who are available and eligible to give.</li>
<li><img class="ic" src="${IMG.step3}" alt=""><h3>Call</h3>Reveal the number, call or WhatsApp the donor, and arrange the donation at a hospital.</li></ol>
<br><div class="factrow"><img class="camp" src="${IMG.camp}" alt="A donor at a blood donation camp" loading="lazy"><div class="facts"><h3>Before you donate</h3><ul>
<li>Usually age 18 to 65 and weight above 45 kg.</li>
<li>Men wait about 90 days between donations, women about 120 days.</li>
<li>Don't donate when unwell, pregnant, or soon after surgery or tattoos.</li></ul>
<span class="note">General guidelines only. The doctor at the blood centre makes the final decision.</span></div></div></div>`;
V.auth = () => {
  const a = S.auth;
  const reg = a.mode === "register";
  if (a.step === "otp")
    return `<div class="wrap" style="max-width:460px"><div class="card"><h2>Check your email</h2>
<p>We sent a 6-digit code to <strong>${esc(a.data.email)}</strong>. It expires in 10 minutes. Check spam if you can't find it.</p>

<form onsubmit="verifyOtp(event)"><input class="otp" id="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" required>
<button class="btn">Verify and continue</button></form>
<p class="note"><a href="#" onclick="resend();return false">Send a new code</a> · <a href="#" onclick="startAuth('${a.mode}');return false">Change email</a></p></div></div>`;
  return `<div class="wrap authgrid"><div class="card">
<div class="tabs"><button class="btn sm ${reg ? "" : "ghost"}" onclick="startAuth('register')">Register</button><button class="btn sm ${reg ? "ghost" : ""}" onclick="startAuth('login')">Log in</button></div>
${S.msg ? `<div class="demo">${esc(S.msg)}</div><br>` : ""}
<form onsubmit="submitAuth(event)">
${reg ? `<label>Full name<input id="f_name" required maxlength="60"></label>` : ""}
<label>Email<input id="f_email" type="email" required autocomplete="email"></label>
${
  reg
    ? `<div class="row"><label>Mobile number<input id="f_phone" inputmode="numeric" pattern="[6-9][0-9]{9}" maxlength="10" required placeholder="10 digits"></label>
<label>Age<input id="f_age" type="number" min="18" max="65" required></label></div>
<div class="row"><label>Blood group<select id="f_g" required>${opts(G, "", "Select")}</select></label>
<label>Gender<select id="f_sex"><option value="M">Male</option><option value="F">Female</option></select></label></div>
<div class="row"><label>State<span class="pk-hint" id="f_state_hint" hidden>Pick a state from the list</span>${statePicker("f_state", "", "required")}</label><label>Area or village<input id="f_area" required maxlength="40" placeholder="e.g. Kukatpally"></label></div>
<label>Last donation date (leave empty if never)<input id="f_last" type="date" max="${new Date().toISOString().slice(0, 10)}"></label>
<label class="chk"><input type="checkbox" id="f_consent" required>I agree to show my name and mobile number to logged-in users who search for my blood group. I can delete my data any time. Read the <a href="#privacy" target="_blank" rel="noopener">Privacy Policy</a> and <a href="#terms" target="_blank" rel="noopener">Terms</a>.</label>`
    : ""
}
<button class="btn">${reg ? "Send code to my email" : "Send login code"}</button></form></div><img class="authimg" src="${IMG.comm}" alt="A community of donors in front of Hyderabad landmarks"></div>`;
};
V.search = () => {
  if (!S.user)
    return `<div class="wrap" style="max-width:520px"><div class="card"><h2>Log in to find donors</h2><p>Donor contact details are shown only to registered users, which keeps donors safe from spam.</p>
<button class="btn" onclick="startAuth('register')">Register</button> <button class="btn ghost" onclick="startAuth('login')">Log in</button></div></div>`;
  const q = S.q,
    all = S.donors;
  let groups = q.group ? (q.compat ? CAN_GIVE[q.group] : [q.group]) : G;
  const elig = (d) =>
    d.avail && (d.last === null || d.last >= (d.sex === "F" ? 120 : 90));
  let m = all.filter(
    (d) => ok(d) && groups.includes(d.g) && (!q.state || d.state === q.state),
  );
  const shown = m
      .filter(elig)
      .sort((a, b) => (b.g === q.group) - (a.g === q.group)),
    hidden = m.length - shown.length;
  return `<div class="wrap"><h2>Find a donor</h2>
<div class="filters"><div style="flex:1 1 100%"><div class="note" style="margin-bottom:6px"><b>Blood group needed</b></div><div class="chips">${["", ...G].map((g) => `<button class="chip ${q.group === g ? "on" : ""}" onclick="S.q.group='${g}';render()">${g || "Any"}</button>`).join("")}</div></div>
<label style="flex:1 1 220px">State${statePicker("q_state", q.state, 'onchange="S.q.state=this.value;render()" autocomplete="off"')}</label>
<label class="chk" style="flex:1 1 100%"><input type="checkbox" ${q.compat ? "checked" : ""} onchange="S.q.compat=this.checked;render()">Include compatible groups${q.group && q.compat ? ` (${q.group} can receive from ${CAN_GIVE[q.group].join(", ")})` : ""}</label></div>
<p class="note">${shown.length} available donor${shown.length === 1 ? "" : "s"}${hidden ? ` · ${hidden} hidden (recently donated or unavailable)` : ""} · Numbers revealed: ${S.reveals.size} of 10 today</p>
<div class="res">${
    shown
      .map(
        (d) => `<div class="card donor"><div class="badge"><b>${d.g}</b></div>
<div class="info"><strong>${esc(d.name)}</strong><br>${esc(d.area)}, ${esc(d.state)}<br><span class="note"><span class="dot"></span>Available · ${d.last === null ? "Never donated" : "Last donated " + d.last + " days ago"}</span></div>
<div class="acts">${
          S.reveals.has(d.id)
            ? `<a class="btn sm" href="tel:+91${d.phone}">Call ${d.phone.replace(/(\d{5})(\d{5})/, "$1 $2")}</a><a class="btn sm ghost" target="_blank" rel="noopener" href="https://wa.me/91${d.phone}">WhatsApp</a>`
            : `<button class="btn sm" onclick="reveal(${d.id})">Show number</button>`
        }${S.rep === d.id ? `<select style="width:auto" onchange="report(${d.id},this.value)"><option value="">Why?</option><option>Wrong number</option><option>Not responding</option><option>Fake profile</option></select>` : `<button class="btn sm ghost" onclick="S.rep=${d.id};render()">Report</button>`}</div></div>`,
      )
      .join("") ||
    `<div class="card" style="text-align:center"><div style="font-size:2rem">🩸</div><p>No donors match yet. Try another state or turn on compatible groups.</p><button class="btn sm" onclick="go('emergency')">Post an emergency request</button></div>`
  }</div></div>`;
};
V.profile = () => {
  if (!S.user) return V.search();
  const d = S.user;
  return `<div class="wrap" style="max-width:560px"><div class="card"><h2>My profile</h2>
<p><span class="pill-t">${d.g}</span> <strong>${esc(d.name)}</strong><br>${esc(d.email)} · ${d.phone}<br>${esc(d.area)}, ${esc(d.state)}</p>
${d.status === "pending" || d.status === "blocked" ? `<div class="demo">${d.status === "blocked" ? "An admin has blocked this profile." : "Your profile is waiting for admin approval. You will appear in search once approved."}</div><br>` : ""}<label class="tog"><input type="checkbox" ${d.avail ? "checked" : ""} onchange="setAvail(this.checked)">I'm available to donate</label>
<p class="note">${d.last === null ? "No donation recorded." : "Last donated " + d.last + " days ago."} You appear in search only when you're available and past the waiting period.</p>
<form onsubmit="saveLast(event)"><label>Update last donation date<input type="date" id="p_last" max="${new Date().toISOString().slice(0, 10)}"></label><button class="btn sm">Save date</button></form><br>
<button class="btn ghost sm" onclick="delMe()">Delete my data</button></div></div>`;
};
V.admin = () => {
  if (!S.user || !S.user.admin)
    return `<div class="wrap"><div class="card">Admin access only.</div></div>`;
  const pend = S.donors.filter((d) => d.status === "pending"),
    open = S.reports.filter((r) => !r.done),
    n = S.donors.filter(ok).length;
  const nm = (id) => {
    const d = S.donors.find((x) => x.id === id);
    return d
      ? esc(d.name) + " (" + d.g + ", " + esc(d.state) + ")"
      : "Deleted profile";
  };
  return `<div class="wrap"><h2>Admin panel</h2>
<p><span class="pill-t">${n} approved donors</span> <span class="pill-t">${pend.length} pending</span> <span class="pill-t">${open.length} open reports</span></p>
<h3>Waiting for approval</h3><div class="res">${pend.map((d) => `<div class="card donor"><div class="badge"><b>${d.g}</b></div><div class="info"><strong>${esc(d.name)}</strong><br>${esc(d.area)}, ${esc(d.state)} · age ${d.age} · ${esc(d.email)}<br><span class="note">Mobile ${d.phone}. Email verified.</span></div><div class="acts"><button class="btn sm" onclick="setStatus(${d.id},'approved')">Approve</button><button class="btn sm ghost" onclick="setStatus(${d.id},'blocked')">Reject</button></div></div>`).join("") || '<div class="card">No donors waiting. New sign-ups appear here.</div>'}</div><br>
<h3>Reports</h3><div class="res">${open.map((r) => `<div class="card donor"><div class="info"><strong>${nm(r.id)}</strong><br><span class="note">Reason: ${esc(r.why)}</span></div><div class="acts"><button class="btn sm" onclick="setStatus(${r.id},'blocked')">Block donor</button><button class="btn sm ghost" onclick="dismiss(${S.reports.indexOf(r)})">Dismiss</button></div></div>`).join("") || '<div class="card">No open reports.</div>'}</div></div>`;
};
async function setStatus(id, st) {
  const { error } = await sb
    .from("profiles")
    .update({ status: st })
    .eq("id", id);
  if (error) return toast(error.message);
  if (st === "blocked")
    await sb.from("reports").update({ resolved: true }).eq("donor_id", id);
  toast(
    st === "approved"
      ? "Donor approved. Now visible in search."
      : "Donor blocked.",
  );
  loadAdmin();
}
async function dismiss(i) {
  await sb
    .from("reports")
    .update({ resolved: true })
    .eq("id", S.reports[i].rid);
  toast("Report dismissed.");
  loadAdmin();
}
async function report(id, why) {
  if (!why) return;
  const { error } = await sb
    .from("reports")
    .insert({ donor_id: id, reporter_id: S.user.id, reason: why });
  S.rep = null;
  toast(error ? error.message : "Report sent to the admin team. Thank you.");
  render();
}
V.emergency = () => {
  const u = S.user,
    open = S.reqs.filter((r) => !r.done);
  const match = (r) =>
    u && !u.admin && u.state === r.c && CAN_GIVE[r.g].includes(u.g);
  return `<div class="wrap"><img class="banner" src="${IMG.emerg}" alt="A family member calling a donor, connected by a blood drop"><h2>Emergency requests</h2>
<div class="demo"><strong>Blood cannot be bought or sold.</strong> Never pay anyone for blood and report anyone who asks for money. Donors are screened at the hospital.</div><br>
${u && !u.admin ? `<form class="card" onsubmit="postReq(event)"><h3>Post a request</h3><div class="row"><label>Blood group<select id="r_g" required>${opts(G, "", "Select")}</select></label><label style="flex:1 1 220px">State${statePicker("r_c", u.state, "required")}</label></div><div class="row"><label>Hospital<input id="r_h" required maxlength="60"></label><label>Units needed<input id="r_u" type="number" min="1" max="10" value="1"></label></div><button class="btn">Post request</button></form><br>` : `<p class="note">Log in to post a request or offer help.</p>`}
<div class="res">${open.map((r) => `<div class="card donor"><div class="badge"><b>${r.g}</b></div><div class="info"><strong>${r.u} unit${r.u > 1 ? "s" : ""} needed at ${esc(r.h)}</strong><br>${esc(r.c)}${match(r) ? ' <span class="pill-t">You can help</span>' : ""}<br><span class="note">Posted by ${esc(r.by)}</span></div><div class="acts">${u ? `<a class="btn sm" href="tel:+91${r.phone}">Call ${r.phone}</a>` : `<button class="btn sm" onclick="startAuth('login','Log in to see the contact number.')">Log in to help</button>`}<a class="btn sm ghost" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent("Urgent: " + r.g + " blood needed at " + r.h + ", " + r.c + ". Contact via Mana Raktha Datha: " + SITE())}">Share</a>${u && u.id === r.uid ? `<button class="btn sm ghost" onclick="fulfil(${r.id})">Mark fulfilled</button>` : ""}</div></div>`).join("") || '<div class="card">No open requests right now.</div>'}</div></div>`;
};
async function postReq(e) {
  e.preventDefault();
  const v = (id) => $("#" + id).value.trim();
  if (!isValidState(v("r_c")))
    return toast("Please pick a state from the list.");
  const { error } = await sb
    .from("requests")
    .insert({
      user_id: S.user.id,
      blood_group: v("r_g"),
      state: v("r_c"),
      hospital: v("r_h"),
      units: +v("r_u") || 1,
      poster_name: S.user.name,
      phone: S.user.phone,
    });
  if (error) return toast(error.message);
  toast("Request posted. Share it on WhatsApp to reach donors faster.");
  S.rl = 0;
  render();
}
async function fulfil(id) {
  await sb.from("requests").update({ fulfilled: true }).eq("id", id);
  toast("Marked as fulfilled. Thank you!");
  S.rl = 0;
  render();
}
const mp = (r) => ({
  id: r.id,
  name: r.name,
  g: r.blood_group,
  state: r.state,
  area: r.area,
  sex: r.gender,
  age: r.age,
  phone: r.phone,
  avail: r.available !== false,
  status: r.status,
  admin: r.is_admin,
  email: r.email || "",
  last:
    r.days_since !== undefined
      ? r.days_since
      : r.last_donation
        ? Math.round((Date.now() - new Date(r.last_donation)) / 864e5)
        : null,
});
async function loadMe() {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    S.user = null;
    return;
  }
  const { data } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) {
    await sb.auth.signOut();
    S.user = null;
    return toast("No profile found. Please register first.");
  }
  S.user = { ...mp(data), email: user.email };
}
async function loadDonors() {
  const { data, error } = await sb.rpc("search_donors", {
    p_group: S.q.group,
    p_state: S.q.state,
    p_compat: S.q.compat,
  });
  if (error) toast(error.message);
  S.donors = (data || []).map(mp);
  render();
}
async function loadAdmin() {
  const a = await sb.from("profiles").select("*"),
    b = await sb.from("reports").select("*").eq("resolved", false);
  S.donors = (a.data || []).map(mp);
  S.reports = (b.data || []).map((r) => ({
    rid: r.id,
    id: r.donor_id,
    why: r.reason,
    done: false,
  }));
  render();
}
async function loadReqs() {
  const { data } = await sb
    .from("requests")
    .select("*")
    .eq("fulfilled", false)
    .order("created_at", { ascending: false });
  S.reqs = (data || []).map((r) => ({
    id: r.id,
    g: r.blood_group,
    c: r.state,
    h: r.hospital,
    u: r.units,
    by: r.poster_name,
    phone: r.phone,
    uid: r.user_id,
  }));
  render();
}
const TD = 'style="padding:8px;border-top:1px solid var(--line)"';
V.info =
  () => `<div class="wrap"><h2>Blood group chart</h2><p class="note">Who can give blood to whom (red cells).</p>
<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%"><tr><th align="left">Patient group</th><th align="left">Can receive from</th></tr>${G.map((g) => `<tr><td ${TD}><span class="pill-t">${g}</span></td><td ${TD}>${CAN_GIVE[g].join(", ")}</td></tr>`).join("")}</table></div><br>
<h2>Questions</h2>${[
    [
      "Who can donate?",
      "Healthy people aged 18 to 65, weighing above 45 kg. The doctor at the blood centre decides on the day.",
    ],
    [
      "How often can I donate?",
      "Men about every 90 days, women about every 120 days.",
    ],
    [
      "Is donating safe?",
      "Yes. Sterile single-use kits are used. Eat well, drink water and rest afterwards.",
    ],
    [
      "Can I sell or buy blood?",
      "No. It is illegal in India. Report anyone who asks for money.",
    ],
    [
      "Is my number safe?",
      "Only logged-in users can reveal it, up to 10 per day, and you can hide your profile any time.",
    ],
  ]
    .map(
      (q) =>
        `<details class="card" style="margin-bottom:8px"><summary><strong>${q[0]}</strong></summary><p>${q[1]}</p></details>`,
    )
    .join(
      "",
    )}<h2 style="margin-top:24px">Spread the word</h2><div class="card share"><img class="aware" src="${IMG.aware}" alt="A hand holding a blood drop with a heart"><div><p>Know someone who could donate? Share Mana Raktha Datha with family and friends on WhatsApp.</p><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent("Be a blood donor and help save lives. Join Mana Raktha Datha (మన రక్తదాత): " + SITE())}">Share on WhatsApp</a></div></div></div>`;
const doc = (t, b) =>
  `<div class="wrap doc"><h1>${t}</h1><p class="note">Last updated: ${ORG.updated}</p>${b}</div>`;
V.about = () =>
  doc(
    "About us",
    `<p><strong>${ORG.name}</strong> (మన రక్తదాత, "Our Blood Donor") is a free community website that helps families in Telangana and Andhra Pradesh find willing blood donors quickly.</p>
<h2>What we do</h2><p>Donors register with their blood group and state. When someone needs blood, they log in, search, and call a donor directly. There is also an emergency board for urgent requests.</p>
<h2>What we are not</h2><p>We are not a blood bank and we do not collect, test or store blood. We only connect people. The hospital or blood centre decides whether a donation is safe.</p>
<h2>Our promises</h2><ul><li>Free for donors and families, with no ads.</li><li>Your mobile number is shown only to logged-in users, a few at a time.</li><li>Blood is never sold on this site. We block anyone who asks for money.</li></ul>
<h2>Who runs this site</h2><p>${ORG.owner}, ${ORG.place}.</p><p><button class="btn" onclick="startAuth('register')">Become a donor</button></p>`,
  );
V.privacy = () =>
  doc(
    "Privacy Policy",
    `<p>This notice explains, in plain words, what personal data ${ORG.name} collects, why, and what you can do about it. It is run by ${ORG.owner}.</p>
<h2>What we collect</h2><ul><li>Name, email, mobile number, age, gender, blood group, state and area.</li><li>Your last donation date and whether you are available.</li><li>Emergency requests you post and reports you send.</li><li>Basic technical data such as IP address, kept by our hosting and database providers, and a login session in your browser.</li></ul>
<h2>Why we use it</h2><ul><li>To create your account and verify your email with a one-time code.</li><li>To list you in donor search (name, blood group, area and availability) if you registered as a donor.</li><li>To show your mobile number to a logged-in user only when they tap "Show number".</li><li>To keep the community safe by reviewing reports and approving new donors.</li></ul>
<h2>Who can see it</h2><p>Logged-in users can see donor names, blood groups and areas. Mobile numbers are shown only on request, with a daily limit per user. Our admins can see full profiles to review them. We do not sell your data or show ads.</p>
<h2>Service providers</h2><p>We use providers to run the site on our behalf: Supabase (database and login), Gmail (email) and ${"[hosting provider]"} (hosting).</p>
<h2>Your choices</h2><ul><li>Edit your details or switch off availability any time in My profile.</li><li>Withdraw consent and delete your data with "Delete my data" in My profile, or email ${ORG.email}.</li><li>Ask us what data we hold about you.</li></ul>
<h2>How long we keep it</h2><p>While your account is active. When you delete your data, your profile is removed. We may keep limited safety records, such as a report about misuse, for as long as needed to protect others.</p>
<h2>Security</h2><p>We limit who can access data, cap how many numbers can be revealed, and use encrypted connections. No system is perfectly secure, so please tell us at once if you notice misuse.</p>
<h2>Children</h2><p>This site is for people aged 18 and over. We do not knowingly collect data from children.</p>
<h2>Questions or complaints</h2><p>Write to ${ORG.email}. See the <a href="#contact" onclick="go('contact');return false">Contact page</a> for our grievance contact. We may update this notice and will change the date above when we do.</p>`,
  );
V.terms = () =>
  doc(
    "Terms of Use",
    `<p>By using ${ORG.name} you agree to these terms. If you do not agree, please do not use the site.</p>
<h2>The service</h2><p>We provide a directory that connects blood donors with people who need blood. We do not guarantee that a donor will be available, willing or suitable.</p>
<h2>Who can use it</h2><p>You must be 18 or older and give true information. Donors must keep their details, availability and last donation date up to date.</p>
<h2>Accounts and approval</h2><p>New donor profiles may need admin approval before they appear in search. We may refuse, hide or block an account that breaks these terms or puts others at risk.</p>
<h2>No buying or selling of blood</h2><p>Blood must not be bought or sold. Do not ask for or offer money for blood. Report anyone who does, and we will act on it.</p>
<h2>Use numbers responsibly</h2><ul><li>Use a donor's contact details only to ask about a blood donation.</li><li>No spam, harassment, scraping, or sharing the list with others.</li><li>Do not post fake or repeated emergency requests.</li></ul>
<h2>Health and safety</h2><p>Donation is subject to screening by a doctor at a hospital or blood centre. Nothing on this site is medical advice. See the <a href="#disclaimer" onclick="go('disclaimer');return false">Medical disclaimer</a>.</p>
<h2>Limits of our responsibility</h2><p>The site is provided free and "as is". To the extent the law allows, we are not responsible for what happens between users, or for losses from relying on the site.</p>
<h2>Governing law</h2><p>These terms are governed by the laws of India. Disputes are subject to the courts at ${ORG.place}.</p>
<h2>Changes and contact</h2><p>We may update these terms and will change the date above. Questions: ${ORG.email}.</p>`,
  );
V.disclaimer = () =>
  doc(
    "Medical and safety disclaimer",
    `<ul><li><strong>We are not a blood bank.</strong> We do not collect, test, store or supply blood.</li><li><strong>Not medical advice.</strong> Information here is general. Ask a doctor about your own health.</li><li><strong>Screening comes first.</strong> A doctor at a hospital or blood centre decides whether a person can donate and whether the blood is safe to use.</li><li><strong>Meet at a hospital or blood centre,</strong> not in private places. Tell a family member where you are going.</li><li><strong>Never pay for blood.</strong> It is illegal to sell blood in India. Report anyone who asks for money.</li><li><strong>We do not verify</strong> every claim donors make. Profiles are reviewed, but please use your judgement.</li></ul>
<h2>In a medical emergency</h2><p>Call <strong>108</strong> (ambulance) or <strong>112</strong> (national emergency) first. Then use this site to find donors.</p>`,
  );
V.contact = () =>
  doc(
    "Contact and grievance",
    `<div class="card"><p><strong>Email:</strong> ${ORG.email}<br><strong>Phone:</strong> ${ORG.phone}<br><strong>Address:</strong> ${ORG.place}</p></div>
<h2>Follow and join us</h2>${socials()}<h2>Report a problem</h2><p>To report a donor, tap Report on their card. To report a bad emergency request or any misuse, email us with details.</p>
<h2>Delete or correct your data</h2><p>Use My profile, or email us from your registered address.</p>
<h2>Grievance contact</h2><p>Name: [Grievance officer name]<br>Email: ${ORG.email}<br>We aim to acknowledge complaints within [48 hours] and resolve them within [15 days].</p>
<h2>Emergency?</h2><p>Call <strong>108</strong> or <strong>112</strong>.</p>`,
  );
const WAH =
  '<path fill="#fff" transform="translate(12 12) scale(.8) translate(-12 -12)" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><circle cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="1.7"/><path fill="#fff" d="M3.2 20.8l1.4-4.6 3.2 3.2z"/>';
const ICONS = {
  instagram:
    '<defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FEDA75"/><stop offset=".35" stop-color="#FA7E1E"/><stop offset=".6" stop-color="#D62976"/><stop offset=".8" stop-color="#962FBF"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs><circle cx="12" cy="12" r="12" fill="url(#ig)"/><rect x="6" y="6" width="12" height="12" rx="3.6" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="12" r="2.9" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="15.6" cy="8.4" r=".9" fill="#fff"/>',
  facebook:
    '<circle cx="12" cy="12" r="12" fill="#1877F2"/><path fill="#fff" d="M13.4 21.5v-7.6h2.5l.4-3h-2.9V9.1c0-.9.3-1.4 1.5-1.4h1.6V5c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.1H7.900v3h2.500v7.600z"/>',
  linkedin:
    '<circle cx="12" cy="12" r="12" fill="#0A66C2"/><circle cx="7.4" cy="7.6" r="1.4" fill="#fff"/><path fill="#fff" d="M6.2 10h2.4v8H6.2zM10.200 10h2.300v1.100c.4-.7 1.300-1.300 2.500-1.300 2.400 0 2.900 1.600 2.900 3.600V18h-2.400v-3.900c0-.9 0-2.100-1.300-2.100s-1.500 1-1.500 2V18h-2.500z"/>',
  channel: '<circle cx="12" cy="12" r="12" fill="#25D366"/>' + WAH,
  group:
    '<circle cx="12" cy="12" r="12" fill="#25D366"/>' +
    WAH +
    '<circle cx="19" cy="19" r="4.6" fill="#128C7E" stroke="#fff" stroke-width="1"/><circle cx="19" cy="17.800" r="1" fill="#fff"/><path fill="#fff" d="M17.200 20.900c0-1 .8-1.600 1.800-1.600s1.800.6 1.800 1.600z"/>',
};
const SLAB = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  channel: "WhatsApp channel",
  group: "WhatsApp group",
};
function socials() {
  return (
    '<div class="socs">' +
    Object.keys(ICONS)
      .map((k) => {
        const svg = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg><span>${SLAB[k]}</span>`;
        return SOCIAL[k]
          ? `<a class="soc" href="${SOCIAL[k]}" target="_blank" rel="noopener" aria-label="${SLAB[k]}">${svg}</a>`
          : `<button class="soc" onclick="toast('${SLAB[k]} link coming soon')" aria-label="${SLAB[k]}">${svg}</button>`;
      })
      .join("") +
    "</div>"
  );
}
function foot() {
  const L = (v, t) => `<button class="fl" onclick="go('${v}')">${t}</button>`;
  $("#foot").innerHTML =
    `<div class="fgrid"><div><div class="fb"><span class="lg"><img src="${IMG.logo}" alt=""></span>${ORG.name}</div><p>Neighbours helping neighbours find blood, fast. Free for everyone.</p>${socials()}</div>
<div><h4>Quick links</h4>${L("home", "Home")}${L("search", "Find donors")}${L("emergency", "Emergency")}<button class="fl" onclick="startAuth('register')">Register</button></div>
<div><h4>Learn</h4>${L("about", "About us")}${L("info", "Info")}${L("disclaimer", "Medical disclaimer")}</div>
<div><h4>Legal</h4>${L("privacy", "Privacy Policy")}${L("terms", "Terms of Use")}${L("contact", "Contact")}</div></div>
<div class="fbar">&copy; ${new Date().getFullYear()} ${ORG.name}. All rights reserved.<br>Not a blood bank. We only connect donors and people in need. In a medical emergency call 108 or 112.</div>`;
}
const TE = {
  "Privacy Policy": "గోప్యతా విధానం",
  "Terms of Use": "వినియోగ నిబంధనలు",
  "About us": "మా గురించి",
  Contact: "సంప్రదించండి",
  "Quick links": "త్వరిత లింకులు",
  Legal: "చట్టపరమైనవి",
  "Pick a blood group": "రక్తగ్రూప్ ఎంచుకోండి",
  "Spread the word": "మీ స్నేహితులకు తెలియజేయండి",
  "One donation can help save up to three lives":
    "ఒక్క రక్తదానం ముగ్గురి వరకు ప్రాణాలను కాపాడగలదు",
  Search: "వెతకండి",
  Profile: "ప్రొఫైల్",
  "Mana Raktha Datha": "మన రక్తదాత",
  Home: "హోమ్",
  "Find donors": "దాతలను వెతకండి",
  Emergency: "అత్యవసరం",
  Info: "సమాచారం",
  "My profile": "నా ప్రొఫైల్",
  "Log out": "లాగ్ అవుట్",
  "Log in": "లాగిన్",
  Register: "నమోదు",
  Admin: "అడ్మిన్",
  "Someone nearby has the blood group you need.":
    "మీకు కావలసిన రక్తగ్రూప్ ఉన్నవారు దగ్గరలోనే ఉన్నారు.",
  "Find a donor": "దాతను వెతకండి",
  "Become a donor": "దాత అవ్వండి",
  "How it works": "ఇది ఎలా పనిచేస్తుంది",
  "Tap a blood group to search": "వెతకడానికి రక్తగ్రూప్‌ను నొక్కండి",
  "Before you donate": "రక్తదానానికి ముందు",
  "Emergency requests": "అత్యవసర రక్త అభ్యర్థనలు",
  "Post a request": "అభ్యర్థన పోస్ట్ చేయండి",
  "Post request": "అభ్యర్థన పోస్ట్ చేయండి",
  "Show number": "నంబర్ చూపండి",
  Report: "రిపోర్ట్",
  Share: "షేర్",
  "Mark fulfilled": "పూర్తయింది",
  "Blood group chart": "రక్తగ్రూప్ చార్ట్",
  Questions: "ప్రశ్నలు",
  "Urgent need?": "అత్యవసరమా?",
};
function tr(r) {
  if (S.lang !== "te") return;
  const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const k = n.nodeValue.trim();
    if (TE[k]) n.nodeValue = n.nodeValue.replace(k, TE[k]);
  }
}
function render() {
  const k = JSON.stringify(S.q);
  if (S.user) {
    if (S.view === "search" && k !== S.qk) {
      S.qk = k;
      loadDonors();
    }
    if (S.view === "admin" && S.user.admin && !S.al) {
      S.al = 1;
      loadAdmin();
    }
    if (S.view === "emergency" && !S.rl) {
      S.rl = 1;
      loadReqs();
    }
  }
  renderNav();
  $("#app").innerHTML = S.view === "auth" ? V.auth() : V[S.view]();
  $("#lang").textContent = S.lang === "en" ? "తెలుగు" : "English";
  document.documentElement.lang = S.lang;
  foot();
  tr(document.body);
  anim();
}
function pick(g) {
  S.q.group = g;
  S.user
    ? go("search")
    : startAuth("register", "Register or log in to see donors for " + g + ".");
}
function startAuth(mode, msg) {
  S.auth = { mode, step: "form", data: null, otp: null };
  S.msg = msg || "";
  go("auth");
}
async function submitAuth(e) {
  e.preventDefault();
  const v = (id) => ($("#" + id) ? $("#" + id).value.trim() : "");
  const a = S.auth,
    email = v("f_email").toLowerCase();
  if (a.mode === "register" && !isValidState(v("f_state"))) {
    toast("Please pick your state from the list.");
    $("#f_state").focus();
    return;
  }
  let o = { shouldCreateUser: false };
  if (a.mode === "register")
    o = {
      shouldCreateUser: true,
      data: {
        name: v("f_name"),
        phone: v("f_phone"),
        age: +v("f_age"),
        blood_group: v("f_g"),
        gender: v("f_sex"),
        state: v("f_state"),
        area: v("f_area"),
        last_donation: v("f_last"),
      },
    };
  const { error } = await sb.auth.signInWithOtp({ email, options: o });
  if (error) return toast(otpError(error, a.mode));
  a.data = { email };
  S.msg = "";
  a.step = "otp";
  render();
}
/* Turns a Supabase error into something a non-technical user can act on.
   The free tier's few hundred emails a day mean the cap is a real case, and
   Supabase's raw wording ("Email rate limit exceeded") does not help. */
function otpError(err, mode) {
  const m = String(err?.message || "");
  if (/rate limit|too many|429/i.test(m))
    return 'Too many codes requested. Wait a minute and try again, or use "Send a new code" later.';
  if (/not authorized|not allowed/i.test(m) && mode === "login")
    return "No account found for this email. Please register first.";
  if (/email address not authorized|smtp|not.*configured/i.test(m))
    return "Email sending is not set up on this site yet. Please contact the team.";
  if (/signup is not allowed|disabled/i.test(m))
    return "New sign-ups are closed right now. Please try again later.";
  if (/already registered|already been registered/i.test(m))
    return "This email is already registered. Try logging in instead.";
  return m.length > 120 ? m.slice(0, 117) + "..." : m;
}
async function resend() {
  const { error } = await sb.auth.signInWithOtp({
    email: S.auth.data.email,
    options: { shouldCreateUser: false },
  });
  toast(error ? otpError(error, "login") : "A new code was sent.");
}
async function verifyOtp(e) {
  e.preventDefault();
  const { error } = await sb.auth.verifyOtp({
    email: S.auth.data.email,
    token: $("#code").value.trim(),
    type: "email",
  });
  if (error) return toast("Wrong or expired code. Request a new one.");
  await loadMe();
  if (!S.user) return go("home");
  toast("Welcome, " + S.user.name.split(" ")[0] + "! Your email is verified.");
  go(
    S.user.admin
      ? "admin"
      : S.user.status === "pending"
        ? "profile"
        : S.q.group
          ? "search"
          : "profile",
  );
}
async function logout() {
  await sb.auth.signOut();
  S.user = null;
  S.reveals.clear();
  toast("Logged out.");
  go("home");
}
async function reveal(id) {
  if (S.reveals.has(id)) return;
  const { data, error } = await sb.rpc("reveal_phone", { p_donor: id });
  if (error) return toast(error.message);
  S.donors.find((d) => d.id === id).phone = data;
  S.reveals.add(id);
  render();
}
async function setAvail(v) {
  const { error } = await sb
    .from("profiles")
    .update({ available: v })
    .eq("id", S.user.id);
  if (error) return toast(error.message);
  S.user.avail = v;
  toast(v ? "You are now visible in search." : "You are hidden from search.");
}
async function saveLast(e) {
  e.preventDefault();
  const v = $("#p_last").value;
  if (!v) return;
  const { error } = await sb
    .from("profiles")
    .update({ last_donation: v })
    .eq("id", S.user.id);
  if (error) return toast(error.message);
  S.user.last = Math.max(0, Math.round((Date.now() - new Date(v)) / 864e5));
  toast("Date saved.");
  render();
}
async function delMe() {
  if (!confirm("Delete your profile and data?")) return;
  await sb.from("profiles").delete().eq("id", S.user.id);
  await sb.auth.signOut();
  S.user = null;
  toast("Your data has been deleted.");
  go("home");
}
if (!READY) {
  $("#nav").innerHTML = "";
  $("#foot").innerHTML = "";
  $("#tabbar").innerHTML = "";
  document.getElementById("lang").style.display = "none";
  $("#app").innerHTML =
    `<div class="wrap" style="max-width:620px"><div class="card"><h2>Setup needed: connect Supabase</h2>
<p>This site is not connected to a database yet. Supabase keys are kept out of the code, in a local <code>.env</code> file.</p>
<ol style="padding-left:20px;line-height:1.9">
<li>Create a free project at <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a>.</li>
<li>In the SQL Editor, paste and run <code>supabase/schema.sql</code>.</li>
<li>Copy <code>.env.example</code> to <code>.env</code> and paste in your Project URL and anon public key
(never the <strong>service_role</strong> key).</li>
<li>Run <code>npm run setup</code>, then <code>npm run check</code> to confirm the connection.</li>
<li>Run <code>npm run dev</code> and open <code>http://localhost:5173</code>.</li></ol>
<p class="note">Already pasted keys into <code>js/config.js</code>? Move them into <code>.env</code> instead so they stay out of git.
Full walkthrough in <code>docs/SETUP.md</code>.</p>
</div></div>`;
} else {
  initStatePickers();
  render();
  loadMe().then(render);
}
