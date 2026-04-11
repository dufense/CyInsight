import { useState, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Loader2 } from "lucide-react";

const EmbeddedInventoryLazy = lazy(() => import("@/pages/asset-inventory"));

function EmbeddedInventory({ tenantId }: { tenantId: number }) {
  return <EmbeddedInventoryLazy embedded />;
}

export default function AssetExplorerTab({ tenantId }: { tenantId: number }) {
  const [, navigate] = useLocation();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Full asset inventory with multi-dimensional search, filtering, and correlation.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/asset-inventory")} data-testid="button-open-full-inventory">
          <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
          Open Full Inventory
        </Button>
      </div>
      <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
        <EmbeddedInventory tenantId={tenantId} />
      </Suspense>
    </div>
  );
}