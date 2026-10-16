"""Write the dashboard's data file from the dbt marts.

    python pipeline/export.py

Reads data/warehouse.duckdb (built by `dbt build`) and target/run_results.json
(the test results of that build) and writes site/data/dashboard.json, the only
file the dashboard page loads.
"""
from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
WAREHOUSE = ROOT / "data" / "warehouse.duckdb"
RUN_RESULTS = ROOT / "target" / "run_results.json"
OUT = ROOT / "site" / "data" / "dashboard.json"


def rows(con, sql):
    result = con.sql(sql)
    names = result.columns
    return [dict(zip(names, r)) for r in result.fetchall()]


def iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def test_summary() -> dict:
    """Counts of dbt tests by status from the last build."""
    if not RUN_RESULTS.exists():
        return {}
    results = json.loads(RUN_RESULTS.read_text())["results"]
    tests = [r for r in results if r["unique_id"].startswith("test.")]
    return dict(Counter(r["status"] for r in tests)) | {"total": len(tests)}


def main() -> None:
    con = duckdb.connect(str(WAREHOUSE), read_only=True)
    con.execute("SET TimeZone = 'UTC'")

    health = rows(con, "select * from pipeline_health order by source")
    growth = rows(con, "select * from product_growth order by growth desc nulls last")
    breaks = rows(con, "select * from int_source_breaks order by break_week")
    weekly = rows(con, """
        select product, category, week, round(avg_daily_downloads) as avg_daily
        from product_weekly order by product, week""")
    npm_days = rows(con, """
        select day, sum(downloads) as raw, sum(clean_downloads) as clean,
               bool_or(is_missing_day) as missing, count(*) filter (where is_dropout) as dropouts
        from fct_downloads_daily
        where source = 'npm' and day >= (select max(day) from fct_downloads_daily) - 89
        group by day order by day""")
    totals = con.sql("""
        select count(*) as rows, count(distinct source || package) as packages,
               count(distinct product) as products,
               count(*) filter (where is_missing_day or is_dropout) as flagged
        from fct_downloads_daily""").fetchone()

    series = {}
    for r in weekly:
        series.setdefault(r["product"], {"category": r["category"], "points": []})
        series[r["product"]]["points"].append([iso(r["week"]), r["avg_daily"]])

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "totals": dict(zip(["rows", "packages", "products", "flagged"], totals)),
        "tests": test_summary(),
        "health": [{k: iso(v) for k, v in h.items()} for h in health],
        "growth": [{k: iso(v) for k, v in g.items()} for g in growth],
        "breaks": [{k: iso(v) for k, v in b.items()} for b in breaks],
        "weekly": series,
        "npm_days": [{k: iso(v) for k, v in d.items()} for d in npm_days],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":"), default=str))
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
