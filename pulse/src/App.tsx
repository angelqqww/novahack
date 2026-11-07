import { AppProvider, useApp } from "@/app/state";
import { Shell } from "@/components/Shell";
import { Toaster } from "@/components/ui/sonner";
import { InsightsScreen } from "@/screens/Insights";
import { HeatmapScreen } from "@/screens/Heatmap";
import { MenuScreen } from "@/screens/Menu";
import { ForecastScreen } from "@/screens/Forecast";
import { LiveOrdersScreen } from "@/screens/LiveOrders";
import { SettingsScreen } from "@/screens/Settings";
import { liveOrders } from "@/data/mock";

function Screens() {
  const { route, theme, ctx } = useApp();
  return (
    <Shell liveCount={liveOrders(ctx.now).length}>
      <div key={route} className="h-full animate-[fade-in_180ms_ease-out]">
        {route === "insights" && <InsightsScreen />}
        {route === "heatmap" && <HeatmapScreen />}
        {route === "menu" && <MenuScreen />}
        {route === "forecast" && <ForecastScreen />}
        {route === "live" && <LiveOrdersScreen />}
        {route === "settings" && <SettingsScreen />}
      </div>
      <Toaster theme={theme} />
    </Shell>
  );
}

export function App() {
  return (
    <AppProvider>
      <Screens />
    </AppProvider>
  );
}
