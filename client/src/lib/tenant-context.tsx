import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
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
  assignedRoles: string[];
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
  assignedRoles: [],
});

const TENANT_STORAGE_KEY = "secureops_selected_tenant_id";

function getSavedTenantId(): number | null {
  try {
    const lsVal = localStorage.getItem(TENANT_STORAGE_KEY);
    if (lsVal) return parseInt(lsVal, 10);
    // One-time migration: promote legacy sessionStorage value to localStorage
    const ssVal = sessionStorage.getItem(TENANT_STORAGE_KEY);
    if (ssVal) {
      localStorage.setItem(TENANT_STORAGE_KEY, ssVal);
      sessionStorage.removeItem(TENANT_STORAGE_KEY);
      return parseInt(ssVal, 10);
    }
    return null;
  } catch {
    return null;
  }
}

function saveTenantId(id: number) {
  try {
    localStorage.setItem(TENANT_STORAGE_KEY, String(id));
  } catch {}
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [currentTenant, setCurrentTenantState] = useState<Tenant | null>(null);

  const setCurrentTenant = useCallback((tenant: Tenant) => {
    setCurrentTenantState(tenant);
    saveTenantId(tenant.id);
  }, []);

  const { data: userProfile, isSuccess: profileLoaded } = useQuery<{ role: string; tenantId: number | null; isPlatformAdmin?: boolean; isMSS?: boolean; isAdmin?: boolean; canSwitchRoles?: boolean; assignedRoles?: string[] }>({
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
          const savedId = getSavedTenantId();
          const savedTenant = savedId ? tenants.find(t => t.id === savedId) : null;
          if (savedTenant) {
            setCurrentTenantState(savedTenant);
            return;
          }
          const userTenant = userProfile?.tenantId ? tenants.find(t => t.id === userProfile.tenantId) : null;
          setCurrentTenant(userTenant || tenants[0]);
        }
        return;
      }
      const savedId = getSavedTenantId();
      const savedTenant = savedId ? tenants.find(t => t.id === savedId) : null;
      if (savedTenant) {
        setCurrentTenantState(savedTenant);
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
        assignedRoles: userProfile?.assignedRoles || [],
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
