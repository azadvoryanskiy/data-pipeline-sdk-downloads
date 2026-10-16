// Renders the dashboard from data/dashboard.json, the one file the pipeline exports.

const C = {
  ink: "#f5f5f4", soft: "#d4d4d8", muted: "#8b8b93", grid: "rgba(255,255,255,0.07)",
  accent: "#ff6a3d", dim: "#52525b",
  series: ["#3987e5", "#ff6a3d", "#199e70", "#c98500", "#9085e9"],
};
const fmtDay = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtNum = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(Math.round(n));
const pct = (x) => (x > 0 ? "+" : "") + (x * 100).toFixed(0) + "%";
const axisText = { color: C.muted, fontFamily: "Inter", fontSize: 11 };
const tooltip = { backgroundColor: "#1c1c20", borderColor: "rgba(255,255,255,0.12)", textStyle: { color: C.ink, fontFamily: "Inter", fontSize: 12 } };
const charts = [];

function chart(id) {
  const c = echarts.init(document.getElementById(id), null, { renderer: "svg" });
  charts.push(c);
  return c;
}

function status(d) {
  const npm = d.health.find((h) => h.source === "npm");
  const pypi = d.health.find((h) => h.source === "pypi");
  const failed = (d.tests.fail || 0) + (d.tests.error || 0);
  const warned = d.tests.warn || 0;
  const run = new Date(d.generated_at);
  const pills = [
    [failed ? "warn" : "", `${d.tests.pass || 0} of ${d.tests.total} tests passed${warned ? `, ${warned} warning` : ""}`],
    ["", `Last run ${run.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}, ${run.toISOString().slice(11, 16)} UTC`],
    ["", `npm data through ${fmtDay(npm.last_complete_day)}`],
    ["", `PyPI data through ${fmtDay(pypi.last_complete_day)}`],
  ];
  document.getElementById("status").innerHTML = pills
    .map(([cls, text]) => `<span class="pill"><span class="dot ${cls}"></span>${text}</span>`).join("");
  document.getElementById("test-count").textContent = `${d.tests.total} dbt tests`;
}

function kpis(d) {
  const npm = d.health.find((h) => h.source === "npm");
  const pypi = d.health.find((h) => h.source === "pypi");
  const days = (h) => Math.round((Date.parse(h.last_day_landed) - Date.parse(h.first_day)) / 864e5) + 1;
  const tiles = [
    ["SDKs tracked", d.totals.packages, `${d.totals.products} products on npm and PyPI`],
    ["Rows in the warehouse", d.totals.rows.toLocaleString("en-US"), `${days(npm)} days of npm, ${days(pypi)} of PyPI`],
    ["Values flagged", d.totals.flagged, `${npm.lost_days} lost npm days, ${npm.dropouts} dropouts, ${npm.days_not_published_yet} days not out yet`],
    ["Counting changes caught", d.breaks.length, d.breaks.map((b) => `${b.source === "pypi" ? "PyPI" : "npm"}, week of ${fmtDay(b.break_week)}`).join("; ") || "none"],
  ];
  document.getElementById("kpis").innerHTML = tiles
    .map(([label, value, note]) => `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="note">${note}</div></div>`)
    .join("");
}

function growth(d) {
  const rows = d.growth.filter((g) => g.growth !== null).sort((a, b) => a.growth - b.growth);
  const values = rows.map((r) => r.growth).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  const day = (iso, shift) => new Date(Date.parse(iso + "T00:00:00Z") + shift * 864e5).toISOString().slice(0, 10);
  const last = d.growth[0].last_week;                       // Monday of the latest complete week
  const span = (from, to) => `${fmtDay(day(last, from))} – ${fmtDay(day(last, to))}`;
  document.getElementById("growth-sub").textContent =
    `Average daily downloads, npm and PyPI added: ${span(-14, 6)} against ${span(-35, -15)}. ` +
    `Orange = faster than the typical tool (${pct(median)}). Both windows sit after the PyPI counting change.`;
  chart("growth").setOption({
    grid: { left: 92, right: 48, top: 8, bottom: 24 },
    tooltip: { ...tooltip, trigger: "item", formatter: (p) => {
      const r = rows[p.dataIndex];
      return `<b>${r.product}</b> · ${r.category}<br>${fmtNum(r.avg_daily_before)} → ${fmtNum(r.avg_daily_now)} a day<br><b>${pct(r.growth)}</b>`;
    } },
    xAxis: { type: "value", axisLabel: { ...axisText, formatter: (v) => pct(v) }, splitLine: { lineStyle: { color: C.grid } } },
    yAxis: { type: "category", data: rows.map((r) => r.product), axisLabel: { ...axisText, color: C.soft, fontSize: 12 },
             axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      type: "bar", barWidth: 12,
      data: rows.map((r) => ({ value: r.growth, itemStyle: { color: r.growth > median ? C.accent : C.dim,
                                                            borderRadius: r.growth >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4] } })),
      label: { show: true, position: "right", color: C.soft, fontFamily: "Inter", fontSize: 11, formatter: (p) => pct(p.value) },
    }],
  });
}

function weekly(d) {
  const categories = [...new Set(Object.values(d.weekly).map((s) => s.category))];
  const tabs = document.getElementById("tabs");
  const c = chart("weekly");
  const breakWeek = d.breaks.find((b) => b.source === "pypi")?.break_week;

  function draw(category) {
    [...tabs.children].forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === category)));
    const products = Object.entries(d.weekly).filter(([, s]) => s.category === category)
      .sort((a, b) => b[1].points.at(-1)[1] - a[1].points.at(-1)[1]);
    c.setOption({
      color: C.series,
      grid: { left: 56, right: 18, top: 62, bottom: 30 },
      legend: { top: 0, left: 0, textStyle: { color: C.soft, fontFamily: "Inter", fontSize: 12 }, icon: "roundRect", itemWidth: 12, itemHeight: 4, itemGap: 18 },
      tooltip: { ...tooltip, trigger: "axis", valueFormatter: (v) => fmtNum(v) + " a day" },
      xAxis: { type: "time", axisLabel: axisText, axisLine: { lineStyle: { color: C.grid } }, splitLine: { show: false } },
      yAxis: { type: "value", axisLabel: { ...axisText, formatter: fmtNum }, splitLine: { lineStyle: { color: C.grid } } },
      series: products.map(([name, s], i) => ({
        name, type: "line", data: s.points, showSymbol: false, lineStyle: { width: 2 },
        markLine: i === 0 && breakWeek ? {
          silent: true, symbol: "none", lineStyle: { color: C.muted, type: "dashed", width: 1 },
          label: { color: C.muted, fontFamily: "Inter", fontSize: 11, formatter: "PyPI changed its counting", position: "end" },
          data: [{ xAxis: breakWeek }],
        } : undefined,
      })),
    }, { notMerge: true });
  }

  tabs.innerHTML = categories.map((cat) => `<button type="button">${cat}</button>`).join("");
  tabs.addEventListener("click", (e) => { if (e.target.tagName === "BUTTON") draw(e.target.textContent); });
  draw(categories.includes("Product analytics") ? "Product analytics" : categories[0]);
}

function quality(d) {
  const days = d.npm_days;
  const flagged = days.filter((x) => x.missing);
  const lastComplete = d.health.find((h) => h.source === "npm").last_complete_day;
  const lost = flagged.filter((x) => x.day < lastComplete).length;
  const notYet = flagged.length - lost;
  document.getElementById("quality-sub").textContent =
    `Total downloads per day across the 18 npm packages, last 90 days. Grey is what the API sent; orange is what the ` +
    `marts use. On ${lost} days npm lost the data and every package read 0; the last ${notYet} days npm hasn't published ` +
    `yet. The pipeline flags both instead of counting a crash, and refetches the recent days every morning.`;
  chart("quality").setOption({
    grid: { left: 56, right: 18, top: 36, bottom: 30 },
    legend: { top: 0, left: 0, textStyle: { color: C.soft, fontFamily: "Inter", fontSize: 12 }, icon: "roundRect", itemWidth: 12, itemHeight: 4, itemGap: 18 },
    tooltip: { ...tooltip, trigger: "axis", valueFormatter: (v) => (v === null || v === undefined ? "flagged" : fmtNum(v)) },
    xAxis: { type: "time", axisLabel: axisText, axisLine: { lineStyle: { color: C.grid } } },
    yAxis: { type: "value", axisLabel: { ...axisText, formatter: fmtNum }, splitLine: { lineStyle: { color: C.grid } } },
    series: [
      { name: "As the API sent it", type: "line", data: days.map((x) => [x.day, x.raw]), showSymbol: false,
        lineStyle: { width: 1.5, color: C.dim }, itemStyle: { color: C.dim } },
      { name: "After the pipeline's checks", type: "line", data: days.map((x) => [x.day, x.clean]), showSymbol: false,
        connectNulls: false, lineStyle: { width: 2, color: C.accent }, itemStyle: { color: C.accent },
        markArea: { silent: true, itemStyle: { color: "rgba(255,106,61,0.08)" },
                    data: flagged.map((x) => [{ xAxis: x.day }, { xAxis: x.day }]) } },
    ],
  });
}

fetch("data/dashboard.json")
  .then((r) => r.json())
  .then((d) => { status(d); kpis(d); growth(d); weekly(d); quality(d); })
  .catch((err) => { document.getElementById("status").textContent = "Could not load the data: " + err; });

window.addEventListener("resize", () => charts.forEach((c) => c.resize()));
