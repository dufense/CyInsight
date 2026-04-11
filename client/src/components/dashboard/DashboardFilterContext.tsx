import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface ActiveFilter {
  type: string;
  value: string;
  label: string;
}

interface DashboardFilterContextValue {
  filter: ActiveFilter | null;
  setFilter: (f: ActiveFilter | null) => void;
  toggleFilter: (f: ActiveFilter) => void;
  clearFilter: () => void;
  isFiltered: (type: string, value: string) => boolean;
  dimOpacity: (type: string, value: string) => number;
}

const DashboardFilterContext = createContext<DashboardFilterContextValue>({
  filter: null,
  setFilter: () => undefined,
  toggleFilter: () => undefined,
  clearFilter: () => undefined,
  isFiltered: () => true,
  dimOpacity: () => 1,
});

export function DashboardFilterProvider({ children }: { children: ReactNode }) {
  const [filter, setFilterState] = useState<ActiveFilter | null>(null);

  const setFilter = useCallback((f: ActiveFilter | null) => setFilterState(f), []);

  const toggleFilter = useCallback((f: ActiveFilter) => {
    setFilterState(prev =>
      prev?.type === f.type && prev?.value === f.value ? null : f
    );
  }, []);

  const clearFilter = useCallback(() => setFilterState(null), []);

  const isFiltered = useCallback(
    (type: string, value: string) =>
      filter === null || (filter.type === type && filter.value === value),
    [filter]
  );

  const dimOpacity = useCallback(
    (type: string, value: string) =>
      filter === null
        ? 1
        : filter.type === type && filter.value === value
          ? 1
          : 0.3,
    [filter]
  );

  return (
    <DashboardFilterContext.Provider
      value={{ filter, setFilter, toggleFilter, clearFilter, isFiltered, dimOpacity }}
    >
      {children}
    </DashboardFilterContext.Provider>
  );
}

export function useDashboardFilter() {
  return useContext(DashboardFilterContext);
}
