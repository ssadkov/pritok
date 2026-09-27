#!/usr/bin/env bash
# Drives a setup-only sandbox bond to maturity through the web app's action API,
# i.e. the same path as the role-screen buttons. Needs the web app running with DEMO_SIGNING=1.
# Usage: scripts/drive-sandbox.sh <bond-address> [base-url]
set -uo pipefail

BOND=$1
BASE=${2:-http://localhost:3100}
API="$BASE/api/bond/$BOND"

view() { curl -s -m 60 "$API"; }
field() { view | python -c "import sys,json; d=json.load(sys.stdin); print($1)"; }

act() { # act "<label>" '<json>'
  local out
  out=$(curl -s -m 120 -X POST "$API/act" -H "Content-Type: application/json" -d "$2" |
    python -c "import sys,json; d=json.load(sys.stdin); print('ok ' + d['sig'] if 'sig' in d else 'REJECTED: ' + d.get('error','?'))")
  echo "$(date +%H:%M:%S)  $1 — $out"
}

wait_ts() { # wait_ts "<label>" <python expr for a unix ts>
  local ts
  ts=$(field "$2")
  echo "$(date +%H:%M:%S)  … waiting for $1"
  until [ "$(field "d['now']")" -ge "$ts" ]; do sleep 10; done
}

ev() { echo "[e for e in d['events'] if e['actionId']==$1][0]"; }
C2=1; C3=2; C4=3; MAT=4
FUND=$(field "[i['address'] for i in d['demo']['investors'] if i['key']=='fund'][0]")
AIGERIM=$(field "[i['address'] for i in d['demo']['investors'] if i['key']=='aigerim'][0]")

# Amortization is declared on the first coupon whose record date is still ahead.
C_PR=$(field "[e['actionId'] for e in d['events'] if e['kind']==0 and e['recordTs']>d['now']][0]")
act "Issuer declares 20% amortization on the date of coupon #$C_PR" "{\"type\":\"declarePartialRedemption\",\"couponActionId\":$C_PR,\"bps\":2000}"
PR=$(field "max(e['actionId'] for e in d['events'])")

# Pay every coupon up to the amortization date in full, with one default-and-cure on the way.
for C in 0 1 2 3; do
  [ "$C" -gt "$C_PR" ] && break
  # Already fully paid out (e.g. coupon 1 driven by hand): nothing to do.
  [ "$(field "int($(ev $C)['claimed'] == $(ev $C)['required'])")" = 1 ] && continue
  REQ=$(field "$(ev $C)['required']")
  FUNDED=$(field "$(ev $C)['funded']")
  LEFT=$((REQ - FUNDED))
  if [ "$C" -eq "$C_PR" ] && [ "$LEFT" -gt 0 ]; then
    act "Issuer funds only 75% of coupon #$C" "{\"type\":\"fund\",\"actionId\":$C,\"amount\":$((LEFT * 3 / 4))}"
  elif [ "$LEFT" -gt 0 ]; then
    act "Issuer funds coupon #$C" "{\"type\":\"fund\",\"actionId\":$C,\"amount\":$LEFT}"
  fi
  wait_ts "coupon #$C payment date" "$(ev $C)['payTs']"
  if [ "$C" -eq "$C_PR" ]; then
    act "Aigerim tries the underfunded coupon #$C" "{\"type\":\"claim\",\"who\":\"aigerim\",\"actionId\":$C}"
    act "Anyone marks coupon #$C defaulted" "{\"type\":\"markDefault\",\"actionId\":$C}"
    REST=$(( $(field "$(ev $C)['required']") - $(field "$(ev $C)['funded']") ))
    act "Issuer pays the remaining debt on coupon #$C" "{\"type\":\"fund\",\"actionId\":$C,\"amount\":$REST}"
  fi
  for who in aigerim bolat; do
    act "$who claims coupon #$C" "{\"type\":\"claim\",\"who\":\"$who\",\"actionId\":$C}"
  done
  if [ "$C" -eq "$C_PR" ]; then
    act "Fund sends coupon #$C to the bank" "{\"type\":\"claimToBank\",\"who\":\"fund\",\"actionId\":$C}"
    act "Paying agent confirms Fund's bank transfer" "{\"type\":\"confirmBank\",\"owner\":\"$FUND\",\"actionId\":$C,\"reference\":\"PP-000533\"}"
    for who in aigerim bolat fund; do
      act "$who claims amortization" "{\"type\":\"claim\",\"who\":\"$who\",\"actionId\":$PR}"
    done
  else
    act "fund claims coupon #$C" "{\"type\":\"claim\",\"who\":\"fund\",\"actionId\":$C}"
  fi
done

for C in 3 4; do
  LEFT=$(( $(field "$(ev $C)['required']") - $(field "$(ev $C)['funded']") ))
  [ "$LEFT" -gt 0 ] && act "Issuer funds #$C" "{\"type\":\"fund\",\"actionId\":$C,\"amount\":$LEFT}"
done
wait_ts "maturity record date" "$(ev $MAT)['recordTs']"
act "Fund → Aigerim after maturity record (must be rejected)" "{\"type\":\"transfer\",\"who\":\"fund\",\"to\":\"$AIGERIM\",\"units\":1}"
wait_ts "maturity" "$(ev $MAT)['payTs']"
for who in aigerim bolat fund; do
  act "$who redeems (burn + principal + coupon 4)" "{\"type\":\"redeem\",\"who\":\"$who\"}"
done

echo
field "'supply', d['supply'], 'reserved', d['reserved'], 'claims', len(d['claims'])"
field "'\n'.join(f\"#{e['actionId']} kind {e['kind']} per {e['amountPerUnit']/100:.0f} funded {e['funded']/100:.0f} claimed {e['claimed']/100:.0f} required {e['required']/100:.0f}\" for e in d['events'])"
