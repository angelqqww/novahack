import { AlertTriangle, Bike, Clock, Flame, Pause, Play, Store } from "lucide-react";
import type { Channel, Priority } from "@/lib/types";
import { Chip } from "../ui";
import { PRIORITY_STYLE } from "../format";


export function ChannelBadge({ channel, size = "md" }: { channel: Channel; size?: "sm" | "md" }) {
  const s = size === "sm" ? "!px-2.5 !py-0.5 !text-xs" : "";
  return channel === "doordash" ? (
    <Chip tone="red" className={s}>
      <Bike size={size === "sm" ? 13 : 16} strokeWidth={2.5} /> DoorDash
    </Chip>
  ) : (
    <Chip tone="blue" className={s}>
      <Store size={size === "sm" ? 13 : 16} strokeWidth={2.5} /> Walk-in
    </Chip>
  );
}

const P_ICON = { late: Flame, start_now: Play, upcoming: Clock, hold: Pause };

export function PriorityChip({ priority, size = "md" }: { priority: Priority; size?: "sm" | "md" }) {
  const Icon = P_ICON[priority];
  const st = PRIORITY_STYLE[priority];
  return (
    <Chip tone={st.chip} className={`uppercase tracking-wide ${size === "sm" ? "!px-2.5 !py-0.5 !text-xs" : ""}`}>
      <Icon size={size === "sm" ? 12 : 15} strokeWidth={3} fill={priority === "late" || priority === "start_now" ? "currentColor" : "none"} /> {st.label}
    </Chip>
  );
}

export function Flag({ text }: { text: string }) {
  const danger = /ALLERG|SEPARATE/.test(text);
  return danger ? (
    <Chip tone="redSolid" className="uppercase tracking-wide">
      <AlertTriangle size={15} strokeWidth={3} /> {text}
    </Chip>
  ) : (
    <Chip tone="gray" className="uppercase tracking-wide">
      {text}
    </Chip>
  );
}
