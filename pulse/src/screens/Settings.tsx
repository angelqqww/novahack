import { Clock, Database, FlaskConical, Image, Moon, Power, RotateCw } from "lucide-react";
import { useApp, type SimState } from "@/app/state";
import { Card } from "@/components/Card";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { MENU, PHOTO_CREDIT_NOTE } from "@/data/mock";
import { totalOrdersAnalyzed, weeksOfData } from "@/lib/analytics";
import { fmtInt } from "@/lib/format";

export function SettingsScreen() {
  const { theme, setTheme, online, setOnline, demoClock, setDemoClock, dataMode, setDataMode, sim, setSim, refresh, ctx } = useApp();
  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4">
        <Card title="Display">
          <Row icon={<Moon className="h-5 w-5" />} label="Dark mode" hint="Easier on the eyes in a dim kitchen.">
            <Switch checked={theme === "dark"} onCheckedChange={(v) => setTheme(v ? "dark" : "light")} aria-label="Dark mode" />
          </Row>
        </Card>
        <Card title="Store">
          <Row icon={<Power className="h-5 w-5" />} label="Accepting orders" hint={online ? "Your store is online." : "Paused. New orders are on hold."}>
            <Switch checked={online} onCheckedChange={setOnline} aria-label="Accepting orders" />
          </Row>
        </Card>

        <Card title="Data" className="col-span-2">
          <Row icon={<Database className="h-5 w-5" />} label="Order history" hint={`${weeksOfData(ctx)} weeks · ${fmtInt(totalOrdersAnalyzed(ctx))} orders analyzed`}>
            <Segmented
              aria-label="History length"
              value={dataMode}
              onChange={setDataMode}
              options={[
                { value: "full", label: "12 weeks" },
                { value: "learning", label: "New store (3 weeks)" },
              ]}
            />
          </Row>
          <Row icon={<RotateCw className="h-5 w-5" />} label="Refresh data" hint="Re-run the analysis with the latest orders.">
            <Button variant="outline" onClick={refresh}>
              Refresh
            </Button>
          </Row>
        </Card>

        <Card title="Demo controls" className="col-span-2">
          <Row icon={<Clock className="h-5 w-5" />} label="Demo clock" hint="Start the day at 5:40 PM, right before the dinner rush. Turn off to use the real time.">
            <Switch checked={demoClock} onCheckedChange={setDemoClock} aria-label="Demo clock" />
          </Row>
          <Row icon={<FlaskConical className="h-5 w-5" />} label="Card states" hint="Preview how every card looks while loading, with no data, or offline.">
            <Segmented<SimState>
              aria-label="Card states"
              value={sim}
              onChange={setSim}
              options={[
                { value: "live", label: "Live" },
                { value: "loading", label: "Loading" },
                { value: "empty", label: "Empty" },
                { value: "error", label: "Error" },
              ]}
            />
          </Row>
        </Card>

        <Card title="About" className="col-span-2">
          <Row icon={<Image className="h-5 w-5" />} label="Menu photos" hint={PHOTO_CREDIT_NOTE}>
            <span className="text-sm text-muted-foreground">{MENU.length} items</span>
          </Row>
          <p className="mt-2 text-sm text-muted-foreground">Pulse v1.0 · Demo data for {""}Sakura Ramen House. All numbers are simulated from 12 weeks of realistic order patterns.</p>
        </Card>
      </div>
    </div>
  );
}

function Row({ icon, label, hint, children }: { icon: React.ReactNode; label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-16 items-center gap-4 border-b border-border py-3 last:border-b-0">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{label}</div>
        <div className="text-sm text-muted-foreground">{hint}</div>
      </div>
      {children}
    </div>
  );
}
