// FIPS -> USPS code mapping
const FIPS_TO_CODE = {
  "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC",
  "12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY",
  "22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT",
  "31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH",
  "40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT",
  "50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY","72":"PR"
};
const STATUS_LABEL = {
  supervision_required: "Supervision required",
  conditional_independence: "Conditional independence",
  independent: "Independent practice",
};

async function loadData() {
  const [topo, states] = await Promise.all([
    fetch("assets/states-10m.json").then(r => r.json()),
    fetch("data/states.json").then(r => r.json()),
  ]);
  return { topo, states };
}

function renderMap({ topo, states }) {
  const svg = d3.select("#us-map");
  const g = topojson.feature(topo, topo.objects.states);
  const path = d3.geoPath();
  const tooltip = document.getElementById("tooltip");
  const mapWrap = document.querySelector(".map-wrap");

  svg.selectAll("path.state")
    .data(g.features)
    .enter()
    .append("path")
    .attr("class", d => {
      const code = FIPS_TO_CODE[String(d.id).padStart(2, "0")];
      const st = states[code];
      return "state " + (st ? st.status : "unknown");
    })
    .attr("data-code", d => FIPS_TO_CODE[String(d.id).padStart(2, "0")] || "")
    .attr("data-name", d => d.properties.name)
    .attr("d", path)
    .on("mousemove", (event, d) => {
      const code = FIPS_TO_CODE[String(d.id).padStart(2, "0")];
      const st = states[code];
      tooltip.querySelector(".t-name").textContent = d.properties.name;
      tooltip.querySelector(".t-status").textContent = st ? (STATUS_LABEL[st.status] || "Under review") : "Under review";
      const rect = mapWrap.getBoundingClientRect();
      tooltip.style.left = (event.clientX - rect.left + 14) + "px";
      tooltip.style.top = (event.clientY - rect.top + 14) + "px";
      tooltip.style.opacity = 1;
    })
    .on("mouseleave", () => { tooltip.style.opacity = 0; })
    .on("click", (event, d) => {
      const code = FIPS_TO_CODE[String(d.id).padStart(2, "0")];
      if (code) window.location.href = "state.html?s=" + code;
    });

  // Puerto Rico fallback — us-atlas states-10m includes PR; if missing from render, it's fine.
  renderStatesGrid(states);
}

function renderStatesGrid(states) {
  const grid = document.getElementById("states-grid");
  if (!grid) return;
  const order = Object.values(states).sort((a, b) => a.name.localeCompare(b.name));
  grid.innerHTML = order.map(s => `
    <a href="state.html?s=${s.code}">
      <span>${s.name}</span>
      <span class="state-status ${s.status}">${(STATUS_LABEL[s.status] || "Under review").split(" ")[0]}</span>
    </a>
  `).join("");
}

// -------- State detail page --------
function renderStatePage({ states }) {
  const params = new URLSearchParams(location.search);
  const code = (params.get("s") || "").toUpperCase();
  const s = states[code];
  const el = document.getElementById("state-content");
  if (!el) return;

  if (!s) {
    el.innerHTML = `<div class="wrap state-hero"><div class="crumb"><a href="/">← All states</a></div><h1>State not found</h1><p>No data for code <code>${code}</code>.</p></div>`;
    document.title = "Not found · Tiger Medical";
    return;
  }

  document.title = `${s.name} — Supervision rules · Tiger Medical`;

  const clinicianKeys = ["PA","NP","PMHNP","CRNA","CNM","CNS"];
  const clinicianLabels = { PA:"Physician Assistants", NP:"Nurse Practitioners", PMHNP:"Psychiatric Mental Health NPs", CRNA:"CRNAs", CNM:"Certified Nurse-Midwives", CNS:"Clinical Nurse Specialists" };

  const summaryHtml = s.summary
    ? `<p class="state-summary">${s.summary}</p>`
    : `<p class="state-summary" style="color:var(--mute);font-style:italic">Detailed summary for ${s.name} is under compliance review. The status badge above reflects current top-line classification; cited detail will appear here as our research completes.</p>`;

  const agreementHtml = s.agreement_name
    ? `<div class="callout"><strong>What ${s.name} calls the document:</strong> ${s.agreement_name}.</div>`
    : "";

  const tabsHtml = clinicianKeys.map((k, i) => `<button class="${i===0?"active":""}" data-tab="${k}">${clinicianLabels[k]}</button>`).join("");
  const panelsHtml = clinicianKeys.map((k, i) => renderClinicianPanel(k, clinicianLabels[k], s.clinician_types[k] || {}, i===0)).join("");

  const citationsHtml = (s.citations && s.citations.length)
    ? `<div class="citations"><h3>Citations</h3><ol>${s.citations.map(c => `<li>${c.text}${c.cite ? ` — <em>${c.cite}</em>` : ""}</li>`).join("")}</ol></div>`
    : `<div class="citations"><h3>Citations</h3><p style="font-size:13px;color:var(--faint);font-style:italic">Statutory citations will be added as our compliance research completes for ${s.name}.</p></div>`;

  el.innerHTML = `
    <div class="wrap state-hero">
      <div class="crumb"><a href="/">← All states</a></div>
      <h1>${s.name}</h1>
      <span class="status-badge ${s.status}">${STATUS_LABEL[s.status] || "Under review"}</span>
      ${summaryHtml}
      ${agreementHtml}
    </div>
    <div class="wrap">
      <div class="clinician-tabs">${tabsHtml}</div>
      ${panelsHtml}
      ${citationsHtml}
    </div>
  `;

  // Tab switching
  el.querySelectorAll(".clinician-tabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      el.querySelectorAll(".clinician-tabs button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      el.querySelectorAll(".clinician-panel").forEach(p => p.style.display = "none");
      el.querySelector('.clinician-panel[data-key="'+btn.dataset.tab+'"]').style.display = "block";
    });
  });
}

function renderClinicianPanel(key, label, data, visible) {
  const rows = [
    ["Status", data.status ? (STATUS_LABEL[data.status] || data.status) : null],
    ["Physician ratio cap", data.ratio_cap],
    ["Proximity rule", data.proximity],
    ["Chart review", data.chart_review],
    ["Meeting cadence", data.meeting_cadence],
    ["Prescribing authority", data.prescribing],
    ["Transition hours (if conditional)", data.transition_hours],
  ];
  return `
    <div class="clinician-panel" data-key="${key}" style="display:${visible?"block":"none"}">
      <table class="rule-table">
        ${rows.map(([lbl, val]) => `
          <tr>
            <td class="label">${lbl}</td>
            <td class="val ${val ? "" : "empty"}">${val || "Under review"}</td>
          </tr>
        `).join("")}
      </table>
    </div>
  `;
}

// -------- Boot --------
(async () => {
  try {
    const page = document.body.dataset.page;
    if (page === "state") {
      const states = await fetch("data/states.json").then(r => r.json());
      renderStatePage({ states });
    } else {
      renderMap(await loadData());
    }
  } catch (e) {
    console.error(e);
    const err = document.getElementById("states-grid") || document.getElementById("state-content");
    if (err) err.innerHTML = '<p style="color:#b00;padding:20px">Error loading data. Please refresh.</p>';
  }
})();
