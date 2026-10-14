import logo from "@/assets/bat-burst-logo-header.jpg";
import { cn } from "@/lib/utils";

export function BrandLogo({ className }: { className?: string }) {
  return <img src={logo} alt="Bat Burst 7.5" width={1540} height={275} className={cn("h-auto w-52 shrink-0", className)} />;
}