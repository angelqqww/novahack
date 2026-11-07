"""Before/after report: three policies on the 6 held-out days, all stores.

Run:  python -m kitchen_assist.evaluate      (generates data and trains models if needed)
Writes kitchen_assist/results/summary.md
"""
from __future__ import annotations

import pandas as pd

from kitchen_assist.data.generate import load_or_generate
from kitchen_assist.features import TRAIN_DAYS
from kitchen_assist.models import lateness, prep_time
from kitchen_assist.paths import RESULTS
from kitchen_assist.simulate import POLICIES, DayResult, make_predictor, replay, simulate_day


def summarize(results: dict[str, list[DayResult]]) -> pd.DataFrame:
    rows = []
    for policy, days in results.items():
        t = pd.concat([d.tickets for d in days])
        dd = t[t["channel"] == "doordash"]
        rows.append(
            {
                "policy": policy,
                "orders": len(t),
                "late orders": int(t["late"].sum()),
                "late %": 100 * t["late"].mean(),
                "Dasher wait min": dd["dasher_wait_sec"].mean() / 60,
                "shelf time min": t["shelf_time_sec"].mean() / 60,
                "refunds": int(t["refund"].sum()),
                "walkouts": int(t["walkout"].sum()),
                "Busy minutes": sum(d.busy_minutes for d in days),
                "declined (paused)": sum(d.declined for d in days),
            }
        )
    return pd.DataFrame(rows).set_index("policy")


def to_markdown(df: pd.DataFrame) -> str:
    cols = list(df.columns)
    head = "| policy | " + " | ".join(cols) + " |\n|---|" + "---:|" * len(cols)
    lines = [head]
    for name, r in df.iterrows():
        cells = [f"{v:.1f}" if isinstance(v, float) else f"{v:,}" for v in r.to_list()]
        lines.append(f"| {name} | " + " | ".join(cells) + " |")
    return "\n".join(lines)


def main() -> None:
    df = load_or_generate()
    prep_model, prep_report = prep_time.train_and_save(df)
    risk_model, risk_report = lateness.train_and_save(df, prep_model)
    test = df[df["day_index"] >= TRAIN_DAYS]
    print(f"Replaying {len(test):,} held-out orders ({test['store_id'].nunique()} stores x {test['day_index'].nunique()} days) under {len(POLICIES)} policies...")
    predictor = make_predictor(prep_model, risk_model)
    results = replay(test, POLICIES, predictor)
    # Same ranking/batching, Busy switched off: shows how much comes from ordering alone.
    results["kitchen_assist (no Busy)"] = [simulate_day(d, "kitchen_assist", predictor, use_busy=False) for _, d in test.groupby(["store_id", "date"])]
    table = summarize(results)
    print()
    print(table.round(2).to_string())
    print()
    print(prep_time.format_report(prep_report))
    print()
    print(lateness.format_report(risk_report))
    RESULTS.mkdir(parents=True, exist_ok=True)
    md = "\n\n".join(
        [
            "# kitchen_assist — results on the 6 held-out days (3 stores)",
            "Synthetic data. Same orders and random draws for every policy.",
            to_markdown(table),
            "```\n" + prep_time.format_report(prep_report) + "\n```",
            "```\n" + lateness.format_report(risk_report) + "\n```",
        ]
    )
    (RESULTS / "summary.md").write_text(md + "\n")
    print(f"\nSaved {RESULTS / 'summary.md'}")


if __name__ == "__main__":
    main()
