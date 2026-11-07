import { Toaster as Sonner } from "sonner";

// shadcn/ui Sonner toaster, themed.
export function Toaster({ theme }: { theme: "light" | "dark" }) {
  return (
    <Sonner
      theme={theme}
      position="bottom-center"
      offset={24}
      toastOptions={{
        classNames: {
          toast: "!rounded-2xl !border !border-border !bg-card !text-foreground !shadow-[var(--shadow-sheet)] !px-5 !py-4 !text-[15px] !font-medium !gap-3",
          description: "!text-muted-foreground",
          actionButton: "!bg-foreground !text-background !rounded-full !h-10 !px-4 !font-semibold",
        },
      }}
    />
  );
}
