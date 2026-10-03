import { useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EngineeringBackButton() {
  const router = useRouter();

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
      return;
    }

    void router.navigate({ to: "/workbench" });
  };

  return (
    <Button type="button" variant="ghost" size="sm" onClick={goBack}>
      <ArrowLeft />
      Back
    </Button>
  );
}
