import logo from "@/assets/bat-burst-logo-final.jpg";
import { cn } from "@/lib/utils";

export function BrandLogo({ className }: { className?: string }) {
  return <img src={logo} alt="Bat Burst 7.5" width={1584} height={864} className={cn("h-auto w-52 shrink-0", className)} />;
}