export interface DataPlaneRegion {
  id: string;
  name: string;
  location: string;
  cloudProvider: string;
  dbConnectionString: string;
  storageEndpoint: string;
  kafkaBrokers: string[];
  status: "active" | "standby" | "degraded";
  isPrimary: boolean;
  metadata?: Record<string, any>;
}

const DEFAULT_REGIONS: DataPlaneRegion[] = [
  {
    id: "in-west-1",
    name: "India (Mumbai)",
    location: "Mumbai, India",
    cloudProvider: "AWS",
    dbConnectionString: process.env.DP_IN_WEST_1_DB_URL || "",
    storageEndpoint: process.env.DP_IN_WEST_1_STORAGE_URL || "",
    kafkaBrokers: (process.env.DP_IN_WEST_1_KAFKA_BROKERS || "").split(",").filter(Boolean),
    status: "active",
    isPrimary: true,
    metadata: { awsRegion: "ap-south-1", timezone: "Asia/Kolkata" },
  },
  {
    id: "us-east-1",
    name: "US (Virginia)",
    location: "Virginia, USA",
    cloudProvider: "AWS",
    dbConnectionString: process.env.DP_US_EAST_1_DB_URL || "",
    storageEndpoint: process.env.DP_US_EAST_1_STORAGE_URL || "",
    kafkaBrokers: (process.env.DP_US_EAST_1_KAFKA_BROKERS || "").split(",").filter(Boolean),
    status: "active",
    isPrimary: false,
    metadata: { awsRegion: "us-east-1", timezone: "America/New_York" },
  },
  {
    id: "ke-east-1",
    name: "Kenya (Nairobi)",
    location: "Nairobi, Kenya",
    cloudProvider: "AWS",
    dbConnectionString: process.env.DP_KE_EAST_1_DB_URL || "",
    storageEndpoint: process.env.DP_KE_EAST_1_STORAGE_URL || "",
    kafkaBrokers: (process.env.DP_KE_EAST_1_KAFKA_BROKERS || "").split(",").filter(Boolean),
    status: "active",
    isPrimary: false,
    metadata: { awsRegion: "af-south-1", timezone: "Africa/Nairobi" },
  },
  {
    id: "sa-central-1",
    name: "Saudi Arabia (Riyadh)",
    location: "Riyadh, Saudi Arabia",
    cloudProvider: "AWS",
    dbConnectionString: process.env.DP_SA_CENTRAL_1_DB_URL || "",
    storageEndpoint: process.env.DP_SA_CENTRAL_1_STORAGE_URL || "",
    kafkaBrokers: (process.env.DP_SA_CENTRAL_1_KAFKA_BROKERS || "").split(",").filter(Boolean),
    status: "active",
    isPrimary: false,
    metadata: { awsRegion: "me-central-1", timezone: "Asia/Riyadh" },
  },
  {
    id: "bh-east-1",
    name: "Bahrain (Manama)",
    location: "Manama, Bahrain",
    cloudProvider: "AWS",
    dbConnectionString: process.env.DP_BH_EAST_1_DB_URL || "",
    storageEndpoint: process.env.DP_BH_EAST_1_STORAGE_URL || "",
    kafkaBrokers: (process.env.DP_BH_EAST_1_KAFKA_BROKERS || "").split(",").filter(Boolean),
    status: "active",
    isPrimary: false,
    metadata: { awsRegion: "me-south-1", timezone: "Asia/Bahrain" },
  },
];

class DataPlaneRegistry {
  private regions: Map<string, DataPlaneRegion> = new Map();

  constructor() {
    for (const region of DEFAULT_REGIONS) {
      this.regions.set(region.id, { ...region });
    }
  }

  getAllRegions(): DataPlaneRegion[] {
    return Array.from(this.regions.values());
  }

  getRegion(regionId: string): DataPlaneRegion | undefined {
    return this.regions.get(regionId);
  }

  updateRegion(regionId: string, updates: Partial<DataPlaneRegion>): DataPlaneRegion | undefined {
    const existing = this.regions.get(regionId);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, id: regionId };
    this.regions.set(regionId, updated);
    return updated;
  }

  getRegionHealth(regionId: string): {
    regionId: string;
    status: string;
    dbConnected: boolean;
    storageConnected: boolean;
    kafkaConnected: boolean;
    lastChecked: string;
  } | undefined {
    const region = this.regions.get(regionId);
    if (!region) return undefined;

    return {
      regionId: region.id,
      status: region.status,
      dbConnected: !!region.dbConnectionString,
      storageConnected: !!region.storageEndpoint,
      kafkaConnected: region.kafkaBrokers.length > 0,
      lastChecked: new Date().toISOString(),
    };
  }

  getValidRegionIds(): string[] {
    return Array.from(this.regions.keys());
  }
}

export class DataPlaneRouter {
  private registry: DataPlaneRegistry;

  constructor(registry: DataPlaneRegistry) {
    this.registry = registry;
  }

  getRegionForTenant(tenantDataRegion: string | null | undefined): DataPlaneRegion | undefined {
    if (!tenantDataRegion) {
      return this.registry.getAllRegions().find(r => r.isPrimary);
    }
    const region = this.registry.getRegion(tenantDataRegion);
    if (region && region.status !== "degraded") {
      return region;
    }
    return this.registry.getAllRegions().find(r => r.isPrimary);
  }

  getActiveRegions(): DataPlaneRegion[] {
    return this.registry.getAllRegions().filter(r => r.status === "active");
  }
}

export const dataPlaneRegistry = new DataPlaneRegistry();
export const dataPlaneRouter = new DataPlaneRouter(dataPlaneRegistry);
