import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Tenant } from "@shared/schema";

interface TenantWithChildren extends Tenant {
  children: Tenant[];
}

interface TenantContextType {
  tenants: Tenant[];
  hierarchy: TenantWithChildren[];
  currentTenant: Tenant | null;
  setCurrentTenant: (tenant: Tenant) => void;
  isLoading: boolean;
  userRole: string;
  parentMSSP: Tenant | null;
}

const TenantContext = createContext<TenantContextType>({
  tenants: [],
  hierarchy: [],
  currentTenant: null,
  setCurrentTenant: () => {},
  isLoading: true,
  userRole: "customer",
  parentMSSP: null,
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);

  const { data: userProfile, isSuccess: profileLoaded } = useQuery<{ role: string; tenantId: number | null }>({
    queryKey: ["/api/user/profile"],
  });

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
    enabled: profileLoaded,
  });

  const { data: hierarchy = [] } = useQuery<TenantWithChildren[]>({
    queryKey: ["/api/tenants/hierarchy"],
    enabled: profileLoaded,
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

  const parentMSSP = hierarchy.length > 0 ? hierarchy[0] : null;

  return (
    <TenantContext.Provider
      value={{
        tenants,
        hierarchy,
        currentTenant,
        setCurrentTenant,
        isLoading: tenantsLoading,
        userRole: userProfile?.role || "customer",
        parentMSSP,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
