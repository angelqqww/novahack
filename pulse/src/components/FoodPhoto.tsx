import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

/** The merchant's menu photo: skeleton until loaded, soft fade-in, graceful fallback. */
export function FoodPhoto({ src, alt, className, rounded = "rounded-xl" }: { src: string; alt: string; className?: string; rounded?: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-muted", rounded, className)}>
      {state === "loading" && <div className="skeleton absolute inset-0" />}
      {state === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <UtensilsCrossed className="h-6 w-6" />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
          className={cn("h-full w-full object-cover transition-opacity duration-200", state === "ok" ? "opacity-100" : "opacity-0")}
        />
      )}
    </div>
  );
}
