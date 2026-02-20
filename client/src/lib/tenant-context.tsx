import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Tenant } from "@shared/schema";

interface TenantContextType {
  tenants: Tenant[];
  currentTenant: Tenant | null;
  setCurrentTenant: (tenant: Tenant) => void;
  isLoading: boolean;
  userRole: string;
}

const TenantContext = createContext<TenantContextType>({
  tenants: [],
  currentTenant: null,
  setCurrentTenant: () => {},
  isLoading: true,
  userRole: "customer",
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
  });

  const { data: userProfile } = useQuery<{ role: string; tenantId: number | null }>({
    queryKey: ["/api/user/profile"],
  });

  useEffect(() => {
    if (tenants.length > 0 && !currentTenant) {
      if (userProfile?.tenantId) {
        const userTenant = tenants.find(t => t.id === userProfile.tenantId);
        if (userTenant) {
          setCurrentTenant(userTenant);
          return;
        }
      }
      setCurrentTenant(tenants[0]);
    }
  }, [tenants, currentTenant, userProfile]);

  return (
    <TenantContext.Provider
      value={{
        tenants,
        currentTenant,
        setCurrentTenant,
        isLoading: tenantsLoading,
        userRole: userProfile?.role || "customer",
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
