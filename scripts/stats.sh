#!/usr/bin/env bash
# Usage: scripts/stats.sh [days=7]   (needs .stats_token or $STATS_TOKEN)
set -euo pipefail
DAYS="${1:-7}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN="${STATS_TOKEN:-$(cat "$DIR/.stats_token")}"
URL="${GS_MCP_URL:-https://mcp.globalshopaholics.com}/stats?days=${DAYS}"
curl -fsS -H "Authorization: Bearer $TOKEN" "$URL" | python3 -c "$(cat <<'PY'
import json,sys
d=json.load(sys.stdin); t=d["totals"]
print("GS MCP usage, last %d day(s) (UTC, since %s): %d requests, %d ok, %d error" % (d["days"], d["since_utc"], t.get("total",0), t.get("ok",0), t.get("error",0)))
for title,p in [("Methods","method:"),("Tools","tool:"),("Clients (initialize)","client:"),("User-agent","ua:"),("Countries","country:")]:
    rows=sorted(((k[len(p):],v) for k,v in t.items() if k.startswith(p)),key=lambda x:-x[1])
    if rows:
        print("\n"+title)
        for k,v in rows[:15]: print("  %6d  %s" % (v,k))
print("\nPer day:")
for day,c in sorted(d["per_day"].items()): print("  %s  %d" % (day,c.get("total",0)))
PY
)"
