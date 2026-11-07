import { AppProvider, useApp } from "@/app/state";
import { Shell } from "@/components/Shell";
import { Toaster } from "@/components/ui/sonner";
import { InsightsScreen } from "@/screens/Insights";
import { HeatmapScreen } from "@/screens/Heatmap";
import { MenuScreen } from "@/screens/Menu";
import { ForecastScreen } from "@/screens/Forecast";
import { LiveOrdersScreen } from "@/screens/LiveOrders";
import { SettingsScreen } from "@/screens/Settings";

function Screens() {
  const { route, theme } = useApp();
  return (
    <Shell liveCount={9}>
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
