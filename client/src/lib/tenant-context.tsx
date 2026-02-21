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
  isPlatformAdmin: boolean;
  isMSS: boolean;
  isAdmin: boolean;
  canSwitchRoles: boolean;
}

const TenantContext = createContext<TenantContextType>({
  tenants: [],
  hierarchy: [],
  currentTenant: null,
  setCurrentTenant: () => {},
  isLoading: true,
  userRole: "customer",
  parentMSSP: null,
  isPlatformAdmin: false,
  isMSS: false,
  isAdmin: false,
  canSwitchRoles: false,
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);

  const { data: userProfile, isSuccess: profileLoaded } = useQuery<{ role: string; tenantId: number | null; isPlatformAdmin?: boolean; isMSS?: boolean; isAdmin?: boolean; canSwitchRoles?: boolean }>({
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
    if (tenants.length > 0) {
      if (currentTenant) {
        const stillValid = tenants.find(t => t.id === currentTenant.id);
        if (!stillValid) {
          const userTenant = userProfile?.tenantId ? tenants.find(t => t.id === userProfile.tenantId) : null;
          setCurrentTenant(userTenant || tenants[0]);
        }
        return;
      }
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

  const isPlatAdmin = userProfile?.isPlatformAdmin || false;
  const parentMSSP = isPlatAdmin
    ? (currentTenant ? hierarchy.find(h => h.id === currentTenant.parentId || h.id === currentTenant.id) || hierarchy[0] : hierarchy[0])
    : (hierarchy.length > 0 ? hierarchy[0] : null);

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
        isPlatformAdmin: userProfile?.isPlatformAdmin || false,
        isMSS: userProfile?.isMSS || false,
        isAdmin: userProfile?.isAdmin || false,
        canSwitchRoles: userProfile?.canSwitchRoles || false,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
