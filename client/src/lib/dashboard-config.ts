import { useState, useCallback, useEffect } from "react";

export type WidgetSize = "compact" | "expanded";

export interface WidgetMeta {
  id: string;
  title: string;
  category: string;
  defaultSize: WidgetSize;
  dashboardMode: string;
}

export interface WidgetState {
  visible: boolean;
  size: WidgetSize;
  collapsed: boolean;
}

export type LayoutConfig = Record<string, WidgetState>;

const STORAGE_PREFIX = "dashboard_layout_";

const WIDGET_CATALOG: WidgetMeta[] = [
  { id: "exec_security_posture", title: "Security Posture", category: "Executive", defaultSize: "compact", dashboardMode: "executive" },
  { id: "exec_incident_trend", title: "Incident Trend", category: "Executive", defaultSize: "expanded", dashboardMode: "executive" },
  { id: "exec_attack_radar", title: "Attack Vector Radar", category: "Executive", defaultSize: "compact", dashboardMode: "executive" },
  { id: "exec_events_timeline", title: "Events Timeline", category: "Executive", defaultSize: "expanded", dashboardMode: "executive" },
  { id: "exec_new_alerts", title: "New Alerts", category: "Executive", defaultSize: "compact", dashboardMode: "executive" },
  { id: "exec_recent_incidents", title: "Recent Incidents", category: "Executive", defaultSize: "compact", dashboardMode: "executive" },
  { id: "exec_threat_map", title: "Global Threat Map", category: "Executive", defaultSize: "expanded", dashboardMode: "executive" },

  { id: "ciso_risk_gauges", title: "Risk Gauges", category: "CISO", defaultSize: "compact", dashboardMode: "ciso" },
  { id: "ciso_exec_briefing", title: "Executive Intelligence Briefing", category: "CISO", defaultSize: "expanded", dashboardMode: "ciso" },
  { id: "ciso_compliance_radar", title: "NIST CSF Coverage", category: "CISO", defaultSize: "compact", dashboardMode: "ciso" },
  { id: "ciso_attack_radar", title: "Attack Vector Radar", category: "CISO", defaultSize: "compact", dashboardMode: "ciso" },
  { id: "ciso_coverage_matrix", title: "Threat Vector Distribution", category: "CISO", defaultSize: "expanded", dashboardMode: "ciso" },
  { id: "ciso_sla_compliance", title: "MITRE ATT&CK Heatmap", category: "CISO", defaultSize: "compact", dashboardMode: "ciso" },

  { id: "soc_severity_heatmap", title: "Severity by Domain", category: "SOC Operations", defaultSize: "expanded", dashboardMode: "soc_ops" },
  { id: "soc_attack_radar", title: "Attack Vector Radar", category: "SOC Operations", defaultSize: "compact", dashboardMode: "soc_ops" },
  { id: "soc_severity_trend", title: "Severity Trend", category: "SOC Operations", defaultSize: "compact", dashboardMode: "soc_ops" },
  { id: "soc_severity_dist", title: "Event Severity Distribution", category: "SOC Operations", defaultSize: "compact", dashboardMode: "soc_ops" },
  { id: "soc_attack_vector", title: "Attack Vector Classification", category: "SOC Operations", defaultSize: "compact", dashboardMode: "soc_ops" },
  { id: "soc_recent_incidents", title: "Recent Incidents (SOC)", category: "SOC Operations", defaultSize: "compact", dashboardMode: "soc_ops" },
  { id: "soc_remediation_actions", title: "Remediation Actions", category: "SOC Operations", defaultSize: "expanded", dashboardMode: "soc_ops" },
  { id: "soc_log_metrics", title: "Log & Event Metrics", category: "SOC Operations", defaultSize: "compact", dashboardMode: "soc_ops" },
  { id: "soc_ingestion_trend", title: "Event Ingestion Trend", category: "SOC Operations", defaultSize: "expanded", dashboardMode: "soc_ops" },
  { id: "soc_top_log_sources", title: "Top Log Sources", category: "SOC Operations", defaultSize: "compact", dashboardMode: "soc_ops" },
  { id: "soc_source_type_dist", title: "Source Type Distribution", category: "SOC Operations", defaultSize: "compact", dashboardMode: "soc_ops" },

  { id: "threat_mitre_matrix", title: "MITRE ATT&CK Tactics", category: "Threat Landscape", defaultSize: "expanded", dashboardMode: "threat_landscape" },
  { id: "threat_kill_chain", title: "Cyber Kill Chain", category: "Threat Landscape", defaultSize: "expanded", dashboardMode: "threat_landscape" },
  { id: "threat_attack_radar", title: "Attack Vector Radar", category: "Threat Landscape", defaultSize: "expanded", dashboardMode: "threat_landscape" },
];

export function getWidgetCatalog(dashboardMode?: string): WidgetMeta[] {
  if (!dashboardMode) return WIDGET_CATALOG;
  return WIDGET_CATALOG.filter(w => w.dashboardMode === dashboardMode);
}

function getDefaultLayout(dashboardMode: string): LayoutConfig {
  const layout: LayoutConfig = {};
  WIDGET_CATALOG.filter(w => w.dashboardMode === dashboardMode).forEach(w => {
    layout[w.id] = { visible: true, size: w.defaultSize, collapsed: false };
  });
  return layout;
}

function loadLayout(dashboardMode: string): LayoutConfig {
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + dashboardMode);
    if (stored) {
      const parsed = JSON.parse(stored) as LayoutConfig;
      const defaults = getDefaultLayout(dashboardMode);
      Object.keys(defaults).forEach(key => {
        if (!parsed[key]) parsed[key] = defaults[key];
      });
      return parsed;
    }
  } catch {}
  return getDefaultLayout(dashboardMode);
}

function saveLayout(dashboardMode: string, layout: LayoutConfig) {
  try {
    localStorage.setItem(STORAGE_PREFIX + dashboardMode, JSON.stringify(layout));
  } catch {}
}

export function useDashboardLayout(dashboardMode: string) {
  const [layout, setLayout] = useState<LayoutConfig>(() => loadLayout(dashboardMode));

  useEffect(() => {
    setLayout(loadLayout(dashboardMode));
  }, [dashboardMode]);

  const updateLayout = useCallback((newLayout: LayoutConfig) => {
    setLayout(newLayout);
    saveLayout(dashboardMode, newLayout);
  }, [dashboardMode]);

  const isVisible = useCallback((widgetId: string) => {
    return layout[widgetId]?.visible !== false;
  }, [layout]);

  const isCollapsed = useCallback((widgetId: string) => {
    return layout[widgetId]?.collapsed === true;
  }, [layout]);

  const getSize = useCallback((widgetId: string) => {
    return layout[widgetId]?.size || "compact";
  }, [layout]);

  const toggleVisibility = useCallback((widgetId: string) => {
    const newLayout = { ...layout };
    if (!newLayout[widgetId]) {
      const meta = WIDGET_CATALOG.find(w => w.id === widgetId);
      newLayout[widgetId] = { visible: true, size: meta?.defaultSize || "compact", collapsed: false };
    } else {
      newLayout[widgetId] = { ...newLayout[widgetId], visible: !newLayout[widgetId].visible };
    }
    updateLayout(newLayout);
  }, [layout, updateLayout]);

  const toggleCollapsed = useCallback((widgetId: string) => {
    const newLayout = { ...layout };
    if (newLayout[widgetId]) {
      newLayout[widgetId] = { ...newLayout[widgetId], collapsed: !newLayout[widgetId].collapsed };
      updateLayout(newLayout);
    }
  }, [layout, updateLayout]);

  const toggleSize = useCallback((widgetId: string) => {
    const newLayout = { ...layout };
    if (newLayout[widgetId]) {
      newLayout[widgetId] = {
        ...newLayout[widgetId],
        size: newLayout[widgetId].size === "compact" ? "expanded" : "compact",
      };
      updateLayout(newLayout);
    }
  }, [layout, updateLayout]);

  const resetToDefault = useCallback(() => {
    const defaults = getDefaultLayout(dashboardMode);
    updateLayout(defaults);
  }, [dashboardMode, updateLayout]);

  const setWidgetVisibility = useCallback((widgetId: string, visible: boolean) => {
    const newLayout = { ...layout };
    if (!newLayout[widgetId]) {
      const meta = WIDGET_CATALOG.find(w => w.id === widgetId);
      newLayout[widgetId] = { visible, size: meta?.defaultSize || "compact", collapsed: false };
    } else {
      newLayout[widgetId] = { ...newLayout[widgetId], visible };
    }
    updateLayout(newLayout);
  }, [layout, updateLayout]);

  const hasCustomizations = useCallback(() => {
    const defaults = getDefaultLayout(dashboardMode);
    return JSON.stringify(layout) !== JSON.stringify(defaults);
  }, [layout, dashboardMode]);

  return {
    layout,
    isVisible,
    isCollapsed,
    getSize,
    toggleVisibility,
    toggleCollapsed,
    toggleSize,
    resetToDefault,
    setWidgetVisibility,
    hasCustomizations,
  };
}
