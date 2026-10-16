"""Fetch daily download counts for the SDKs in seeds/packages.csv and land them as CSV.

    python pipeline/extract.py              # the last 14 days, run every morning
    python pipeline/extract.py --backfill   # all the history each API keeps

One file per source per download day: data/raw/npm/2026-10-14.csv holds every npm
package for 14 October. Each run rewrites the days it fetched, so re-running is
safe and a day that was still empty yesterday gets filled in today.

A source is written all or nothing. If one package keeps failing, nothing for
that source is written and the script exits with an error, so a half-filled day
never replaces a complete one.
"""
from __future__ import annotations

import csv
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGES = ROOT / "seeds" / "packages.csv"
RAW = ROOT / "data" / "raw"

ROLLING_DAYS = 14
NPM_HISTORY_DAYS = 540          # npm keeps 18 months
NPM_BULK_DAYS = 365             # bulk requests (many packages at once) are capped at a year
PAUSE = {"npm": 1.0, "pypi": 2.5}   # seconds between requests; both APIs rate-limit
USER_AGENT = "data-pipeline-sdk-downloads (github.com/azadvoryanskiy)"


def get_json(url: str, source: str, attempts: int = 5) -> dict:
    """GET with polite pauses and backoff on 429 / 5xx."""
    for attempt in range(attempts):
        time.sleep(PAUSE[source])
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as err:
            if err.code not in (429, 500, 502, 503, 504) or attempt == attempts - 1:
                raise
            wait = int(err.headers.get("Retry-After") or 0) or 10 * 3 ** attempt
            print(f"  {source}: HTTP {err.code}, waiting {wait}s", flush=True)
            time.sleep(wait)
        except urllib.error.URLError:
            if attempt == attempts - 1:
                raise
            time.sleep(10 * 3 ** attempt)
    raise RuntimeError("unreachable")


def chunks(start: date, end: date, days: int):
    while start <= end:
        stop = min(start + timedelta(days=days - 1), end)
        yield start, stop
        start = stop + timedelta(days=1)


def fetch_npm(packages: list[str], start: date, end: date) -> list[tuple[str, str, int]]:
    rows = []
    bulk = [p for p in packages if not p.startswith("@")]      # scoped packages can't be bulk-queried
    single = [p for p in packages if p.startswith("@")]
    for lo, hi in chunks(start, end, NPM_BULK_DAYS):
        url = f"https://api.npmjs.org/downloads/range/{lo}:{hi}/{','.join(bulk)}"
        body = get_json(url, "npm")
        for package in bulk:
            for day in body[package]["downloads"]:
                rows.append((package, day["day"], day["downloads"]))
        for package in single:
            url = f"https://api.npmjs.org/downloads/range/{lo}:{hi}/{urllib.parse.quote(package, safe='@/')}"
            for day in get_json(url, "npm")["downloads"]:
                rows.append((package, day["day"], day["downloads"]))
    return rows


def fetch_pypi(packages: list[str], start: date, end: date) -> list[tuple[str, str, int]]:
    rows = []
    for package in packages:
        body = get_json(f"https://pypistats.org/api/packages/{package}/overall?mirrors=false", "pypi")
        for day in body["data"]:
            if day["category"] == "without_mirrors" and start.isoformat() <= day["date"] <= end.isoformat():
                rows.append((package, day["date"], day["downloads"]))
    return rows


def land(source: str, rows: list[tuple[str, str, int]], fetched_at: str) -> int:
    by_day = defaultdict(list)
    for package, day, downloads in rows:
        by_day[day].append((package, downloads))
    (RAW / source).mkdir(parents=True, exist_ok=True)
    for day, values in sorted(by_day.items()):
        with open(RAW / source / f"{day}.csv", "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["source", "package", "day", "downloads", "fetched_at"])
            for package, downloads in sorted(values):
                writer.writerow([source, package, day, downloads, fetched_at])
    return len(by_day)


def main(argv: list[str]) -> None:
    backfill = "--backfill" in argv
    yesterday = datetime.now(timezone.utc).date() - timedelta(days=1)   # today is never complete
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(PACKAGES) as f:
        packages = defaultdict(list)
        for row in csv.DictReader(f):
            packages[row["source"]].append(row["package"])

    plan = {
        "npm": (fetch_npm, yesterday - timedelta(days=NPM_HISTORY_DAYS - 1 if backfill else ROLLING_DAYS - 1)),
        # pypistats keeps about 180 days, so a backfill simply takes everything it returns
        "pypi": (fetch_pypi, yesterday - timedelta(days=200 if backfill else ROLLING_DAYS - 1)),
    }
    failed = []
    for source, (fetch, start) in plan.items():
        print(f"{source}: {len(packages[source])} packages, {start} to {yesterday}", flush=True)
        try:
            rows = fetch(packages[source], start, yesterday)
        except Exception as err:                       # all or nothing per source
            print(f"{source}: FAILED, nothing written ({err})", flush=True)
            failed.append(source)
            continue
        got = {package for package, _, _ in rows}
        missing = set(packages[source]) - got
        if missing:
            print(f"{source}: FAILED, no data for {sorted(missing)}; nothing written", flush=True)
            failed.append(source)
            continue
        days = land(source, rows, fetched_at)
        print(f"{source}: wrote {days} day files, {len(rows):,} rows", flush=True)
    if failed:
        sys.exit(f"extract failed for: {', '.join(failed)}")


if __name__ == "__main__":
    main(sys.argv[1:])
