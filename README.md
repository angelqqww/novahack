# novahack

Three DoorDash × Nova hackathon projects about restaurant order flow during a rush. All three run on
simulated data.

| Folder | What it is | Stack |
|---|---|---|
| [`pulse/`](pulse) | **Pulse**: a merchant analytics tablet app. Busy-hour heatmap, menu performance with food photos, demand forecast + smart shopping list, and a live order queue ranked by AI priority. | React, TypeScript, Tailwind, shadcn/ui, Recharts (Vite) |
| [`one-line/`](one-line) | **One Line**: a single kitchen screen for walk-in + DoorDash orders, with a scheduler that says when to start each order, batching, and a demo control panel. | Next.js, TypeScript, Tailwind |
| [`kitchen_assist/`](kitchen_assist) | **kitchen_assist**: models and a simulator. Prep-time and lateness models rank tickets by who gets hurt most by waiting, plus batching and "Busy" tablet logic, evaluated against oldest-first and promised-first. | Python 3.11, pandas, scikit-learn, LightGBM |

## Run

Pulse (opens at http://localhost:5173):

```bash
cd pulse && npm install && npm run dev
```

One Line (opens at http://localhost:3000; open `/control`, load the demo, then `/kitchen`):

```bash
cd one-line && npm install && npm run dev
```

kitchen_assist (run from this folder, the repo root):

```bash
python3.11 -m venv kitchen_assist/.venv && kitchen_assist/.venv/bin/pip install -r kitchen_assist/requirements.txt
```
```bash
kitchen_assist/.venv/bin/python -m kitchen_assist.evaluate
```
```bash
kitchen_assist/.venv/bin/python -m kitchen_assist.demo
```

Each folder has its own README with details, demo scripts and how to swap in real data.

## Deploy Pulse to Vercel

Import this repo on vercel.com, set **Root Directory** to `pulse`, and deploy. Vercel detects Vite
automatically.
