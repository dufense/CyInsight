import * as crypto from "crypto";

export type CloudStorageProvider = "s3" | "azure" | "gcs" | "minio";

export type StorageTier = "hot" | "warm" | "cold" | "archive";

export interface StorageMetadata {
  tenantId?: number;
  region?: string;
  eventType?: string;
  tier?: StorageTier;
  contentType?: string;
  [key: string]: any;
}

export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date;
  metadata?: StorageMetadata;
  etag?: string;
}

export interface StorageStats {
  totalObjects: number;
  totalSizeBytes: number;
  byTier: Record<StorageTier, { objects: number; sizeBytes: number }>;
  byTenant: Record<string, { objects: number; sizeBytes: number }>;
}

export interface RetentionPolicy {
  hotDays: number;
  warmDays: number;
  coldDays: number;
  archiveAfterDays: number;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  hotDays: 90,
  warmDays: 365,
  coldDays: 1095,
  archiveAfterDays: 1095,
};

function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number; maxDelayMs?: number } = {}
): Promise<T> {
  const { retries = 3, baseDelayMs = 500, maxDelayMs = 8000 } = opts;
  return fn().catch(async (err: any) => {
    const isRetryable =
      err?.code === "ECONNRESET" ||
      err?.code === "ETIMEDOUT" ||
      err?.code === "ENOTFOUND" ||
      err?.name === "TimeoutError" ||
      err?.name === "NetworkingError" ||
      err?.message?.includes("timeout") ||
      err?.message?.includes("ECONNREFUSED") ||
      err?.message?.includes("Temporary failure") ||
      err?.statusCode >= 500;
    if (retries <= 0 || !isRetryable) throw err;
    const delay = Math.min(baseDelayMs * Math.pow(2, 3 - retries), maxDelayMs);
    await new Promise(r => setTimeout(r, delay));
    return withRetry(fn, { retries: retries - 1, baseDelayMs, maxDelayMs });
  });
}

export interface CloudStorageConfig {
  provider: CloudStorageProvider;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  accountName?: string;
  accountKey?: string;
  connectionString?: string;
  projectId?: string;
  keyFilePath?: string;
  bucket?: string;
  forcePathStyle?: boolean;
}

function getConfigFromEnv(): CloudStorageConfig {
  const provider = (process.env.CLOUD_STORAGE_PROVIDER || "minio") as CloudStorageProvider;

  const base: CloudStorageConfig = {
    provider,
    region: process.env.CLOUD_STORAGE_REGION || "us-east-1",
    bucket: process.env.CLOUD_STORAGE_BUCKET || "secureops-data",
  };

  switch (provider) {
    case "s3":
      return {
        ...base,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        endpoint: process.env.AWS_S3_ENDPOINT,
      };
    case "minio":
      return {
        ...base,
        endpoint: process.env.MINIO_ENDPOINT || "http://localhost:9000",
        accessKeyId: process.env.MINIO_ACCESS_KEY || "minioadmin",
        secretAccessKey: process.env.MINIO_SECRET_KEY || "minioadmin",
        forcePathStyle: true,
      };
    case "azure":
      return {
        ...base,
        accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME,
        accountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY,
        connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
      };
    case "gcs":
      return {
        ...base,
        projectId: process.env.GCP_PROJECT_ID,
        keyFilePath: process.env.GCP_KEY_FILE_PATH,
      };
    default:
      return base;
  }
}

interface ICloudStorageBackend {
  upload(bucket: string, key: string, data: Buffer | string, metadata?: StorageMetadata): Promise<{ etag: string }>;
  download(bucket: string, key: string): Promise<{ data: Buffer; metadata?: StorageMetadata }>;
  list(bucket: string, prefix?: string, maxKeys?: number, continuationToken?: string): Promise<{
    objects: StorageObject[];
    nextToken?: string;
    isTruncated: boolean;
  }>;
  delete(bucket: string, key: string): Promise<void>;
  generatePresignedUrl(bucket: string, key: string, expirySeconds?: number): Promise<string>;
  headObject(bucket: string, key: string): Promise<StorageObject | null>;
  ensureBucket(bucket: string): Promise<void>;
}

class S3Backend implements ICloudStorageBackend {
  private config: CloudStorageConfig;
  private s3Client: any;
  private initialized = false;

  constructor(config: CloudStorageConfig) {
    this.config = config;
  }

  private async getClient() {
    if (!this.initialized) {
      try {
        const { S3Client } = await import("@aws-sdk/client-s3");
        const clientConfig: any = {
          region: this.config.region || "us-east-1",
        };
        if (this.config.endpoint) {
          clientConfig.endpoint = this.config.endpoint;
        }
        if (this.config.accessKeyId && this.config.secretAccessKey) {
          clientConfig.credentials = {
            accessKeyId: this.config.accessKeyId,
            secretAccessKey: this.config.secretAccessKey,
          };
        }
        if (this.config.forcePathStyle) {
          clientConfig.forcePathStyle = true;
        }
        this.s3Client = new S3Client(clientConfig);
        this.initialized = true;
      } catch {
        throw new Error("@aws-sdk/client-s3 is not installed. Install it with: npm install @aws-sdk/client-s3");
      }
    }
    return this.s3Client;
  }

  async upload(bucket: string, key: string, data: Buffer | string, metadata?: StorageMetadata): Promise<{ etag: string }> {
    const client = await this.getClient();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const body = typeof data === "string" ? Buffer.from(data) : data;
    const flatMeta: Record<string, string> = {};
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        if (v !== undefined && v !== null) flatMeta[k] = String(v);
      }
    }
    const result = await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: metadata?.contentType || "application/octet-stream",
      Metadata: flatMeta,
    }));
    return { etag: result.ETag || crypto.createHash("md5").update(body).digest("hex") };
  }

  async download(bucket: string, key: string): Promise<{ data: Buffer; metadata?: StorageMetadata }> {
    const client = await this.getClient();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as any) {
      chunks.push(Buffer.from(chunk));
    }
    return {
      data: Buffer.concat(chunks),
      metadata: result.Metadata as StorageMetadata,
    };
  }

  async list(bucket: string, prefix?: string, maxKeys = 1000, continuationToken?: string): Promise<{
    objects: StorageObject[];
    nextToken?: string;
    isTruncated: boolean;
  }> {
    const client = await this.getClient();
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const params: any = { Bucket: bucket, MaxKeys: maxKeys };
    if (prefix) params.Prefix = prefix;
    if (continuationToken) params.ContinuationToken = continuationToken;
    const result = await client.send(new ListObjectsV2Command(params));
    const objects: StorageObject[] = (result.Contents || []).map((obj: any) => ({
      key: obj.Key,
      size: obj.Size || 0,
      lastModified: obj.LastModified || new Date(),
      etag: obj.ETag,
    }));
    return {
      objects,
      nextToken: result.NextContinuationToken,
      isTruncated: result.IsTruncated || false,
    };
  }

  async delete(bucket: string, key: string): Promise<void> {
    const client = await this.getClient();
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async generatePresignedUrl(bucket: string, key: string, expirySeconds = 3600): Promise<string> {
    const client = await this.getClient();
    try {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      return await getSignedUrl(client, command, { expiresIn: expirySeconds });
    } catch {
      const endpoint = this.config.endpoint || `https://s3.${this.config.region}.amazonaws.com`;
      return `${endpoint}/${bucket}/${key}?expires=${expirySeconds}`;
    }
  }

  async headObject(bucket: string, key: string): Promise<StorageObject | null> {
    const client = await this.getClient();
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return {
        key,
        size: result.ContentLength || 0,
        lastModified: result.LastModified || new Date(),
        metadata: result.Metadata as StorageMetadata,
        etag: result.ETag,
      };
    } catch {
      return null;
    }
  }

  async ensureBucket(bucket: string): Promise<void> {
    const client = await this.getClient();
    const { HeadBucketCommand, CreateBucketCommand } = await import("@aws-sdk/client-s3");
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      try {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      } catch (createErr: any) {
        if (!createErr.name?.includes("BucketAlreadyOwnedByYou") && !createErr.name?.includes("BucketAlreadyExists")) {
          throw createErr;
        }
      }
    }
  }
}

class AzureBlobBackend implements ICloudStorageBackend {
  private config: CloudStorageConfig;

  constructor(config: CloudStorageConfig) {
    this.config = config;
  }

  private async getContainerClient(containerName: string) {
    try {
      const { BlobServiceClient, StorageSharedKeyCredential } = await import("@azure/storage-blob");
      let serviceClient: any;
      if (this.config.connectionString) {
        serviceClient = BlobServiceClient.fromConnectionString(this.config.connectionString);
      } else if (this.config.accountName && this.config.accountKey) {
        const cred = new StorageSharedKeyCredential(this.config.accountName, this.config.accountKey);
        serviceClient = new BlobServiceClient(`https://${this.config.accountName}.blob.core.windows.net`, cred);
      } else {
        throw new Error("Azure storage requires either connectionString or accountName+accountKey");
      }
      return serviceClient.getContainerClient(containerName);
    } catch (e: any) {
      if (e.message?.includes("Cannot find module") || e.code === "MODULE_NOT_FOUND") {
        throw new Error("@azure/storage-blob is not installed. Install it with: npm install @azure/storage-blob");
      }
      throw e;
    }
  }

  async upload(bucket: string, key: string, data: Buffer | string, metadata?: StorageMetadata): Promise<{ etag: string }> {
    const container = await this.getContainerClient(bucket);
    const blockBlob = container.getBlockBlobClient(key);
    const body = typeof data === "string" ? Buffer.from(data) : data;
    const flatMeta: Record<string, string> = {};
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        if (v !== undefined && v !== null) flatMeta[k.replace(/[^a-zA-Z0-9]/g, "_")] = String(v);
      }
    }
    const result = await blockBlob.upload(body, body.length, {
      blobHTTPHeaders: { blobContentType: metadata?.contentType || "application/octet-stream" },
      metadata: flatMeta,
    });
    return { etag: result.etag || crypto.createHash("md5").update(body).digest("hex") };
  }

  async download(bucket: string, key: string): Promise<{ data: Buffer; metadata?: StorageMetadata }> {
    const container = await this.getContainerClient(bucket);
    const blockBlob = container.getBlockBlobClient(key);
    const downloadResponse = await blockBlob.download(0);
    const chunks: Buffer[] = [];
    for await (const chunk of downloadResponse.readableStreamBody as any) {
      chunks.push(Buffer.from(chunk));
    }
    const props = await blockBlob.getProperties();
    return {
      data: Buffer.concat(chunks),
      metadata: props.metadata as StorageMetadata,
    };
  }

  async list(bucket: string, prefix?: string, maxKeys = 1000): Promise<{
    objects: StorageObject[];
    nextToken?: string;
    isTruncated: boolean;
  }> {
    const container = await this.getContainerClient(bucket);
    const objects: StorageObject[] = [];
    let count = 0;
    const options: any = {};
    if (prefix) options.prefix = prefix;
    for await (const blob of container.listBlobsFlat(options)) {
      if (count >= maxKeys) break;
      objects.push({
        key: blob.name,
        size: blob.properties.contentLength || 0,
        lastModified: blob.properties.lastModified || new Date(),
        etag: blob.properties.etag,
      });
      count++;
    }
    return { objects, isTruncated: false };
  }

  async delete(bucket: string, key: string): Promise<void> {
    const container = await this.getContainerClient(bucket);
    const blockBlob = container.getBlockBlobClient(key);
    await blockBlob.delete();
  }

  async generatePresignedUrl(bucket: string, key: string, expirySeconds = 3600): Promise<string> {
    const container = await this.getContainerClient(bucket);
    const blockBlob = container.getBlockBlobClient(key);
    try {
      const { BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } = await import("@azure/storage-blob");
      if (this.config.accountName && this.config.accountKey) {
        const cred = new StorageSharedKeyCredential(this.config.accountName, this.config.accountKey);
        const sasToken = generateBlobSASQueryParameters({
          containerName: bucket,
          blobName: key,
          permissions: BlobSASPermissions.parse("r"),
          startsOn: new Date(),
          expiresOn: new Date(Date.now() + expirySeconds * 1000),
        }, cred).toString();
        return `${blockBlob.url}?${sasToken}`;
      }
    } catch {}
    return blockBlob.url;
  }

  async headObject(bucket: string, key: string): Promise<StorageObject | null> {
    const container = await this.getContainerClient(bucket);
    const blockBlob = container.getBlockBlobClient(key);
    try {
      const props = await blockBlob.getProperties();
      return {
        key,
        size: props.contentLength || 0,
        lastModified: props.lastModified || new Date(),
        metadata: props.metadata as StorageMetadata,
        etag: props.etag,
      };
    } catch {
      return null;
    }
  }

  async ensureBucket(bucket: string): Promise<void> {
    const container = await this.getContainerClient(bucket);
    try {
      await container.createIfNotExists();
    } catch {}
  }
}

class GCSBackend implements ICloudStorageBackend {
  private config: CloudStorageConfig;

  constructor(config: CloudStorageConfig) {
    this.config = config;
  }

  private async getStorage() {
    try {
      const { Storage } = await import("@google-cloud/storage");
      const options: any = {};
      if (this.config.projectId) options.projectId = this.config.projectId;
      // If keyFilePath is set, use it; otherwise rely on Application Default Credentials
      // (GKE Workload Identity, GCE metadata server, GOOGLE_APPLICATION_CREDENTIALS env var).
      if (this.config.keyFilePath) options.keyFilename = this.config.keyFilePath;
      return new Storage(options);
    } catch (e: any) {
      if (e.message?.includes("Cannot find module") || e.code === "MODULE_NOT_FOUND") {
        throw new Error("@google-cloud/storage is not installed. Install it with: npm install @google-cloud/storage");
      }
      throw e;
    }
  }

  async upload(bucket: string, key: string, data: Buffer | string, metadata?: StorageMetadata): Promise<{ etag: string }> {
    const storage = await this.getStorage();
    const file = storage.bucket(bucket).file(key);
    const body = typeof data === "string" ? Buffer.from(data) : data;
    const flatMeta: Record<string, string> = {};
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        if (v !== undefined && v !== null) flatMeta[k] = String(v);
      }
    }
    await file.save(body, {
      contentType: metadata?.contentType || "application/octet-stream",
      metadata: { metadata: flatMeta },
    });
    const [fileMeta] = await file.getMetadata();
    return { etag: (fileMeta as any).etag || crypto.createHash("md5").update(body).digest("hex") };
  }

  async download(bucket: string, key: string): Promise<{ data: Buffer; metadata?: StorageMetadata }> {
    const storage = await this.getStorage();
    const file = storage.bucket(bucket).file(key);
    const [contents] = await file.download();
    const [fileMeta] = await file.getMetadata();
    return {
      data: contents,
      metadata: ((fileMeta as any).metadata || {}) as StorageMetadata,
    };
  }

  async list(bucket: string, prefix?: string, maxKeys = 1000): Promise<{
    objects: StorageObject[];
    nextToken?: string;
    isTruncated: boolean;
  }> {
    const storage = await this.getStorage();
    const options: any = { maxResults: maxKeys };
    if (prefix) options.prefix = prefix;
    const [files] = await storage.bucket(bucket).getFiles(options);
    const objects: StorageObject[] = files.map((file: any) => ({
      key: file.name,
      size: parseInt(file.metadata?.size || "0"),
      lastModified: new Date(file.metadata?.updated || Date.now()),
      etag: file.metadata?.etag,
    }));
    return { objects, isTruncated: false };
  }

  async delete(bucket: string, key: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.bucket(bucket).file(key).delete();
  }

  async generatePresignedUrl(bucket: string, key: string, expirySeconds = 3600): Promise<string> {
    const storage = await this.getStorage();
    const [url] = await storage.bucket(bucket).file(key).getSignedUrl({
      action: "read",
      expires: Date.now() + expirySeconds * 1000,
    });
    return url;
  }

  async headObject(bucket: string, key: string): Promise<StorageObject | null> {
    const storage = await this.getStorage();
    try {
      const [exists] = await storage.bucket(bucket).file(key).exists();
      if (!exists) return null;
      const [fileMeta] = await storage.bucket(bucket).file(key).getMetadata();
      return {
        key,
        size: parseInt((fileMeta as any).size || "0"),
        lastModified: new Date((fileMeta as any).updated || Date.now()),
        metadata: ((fileMeta as any).metadata || {}) as StorageMetadata,
        etag: (fileMeta as any).etag,
      };
    } catch {
      return null;
    }
  }

  async ensureBucket(bucket: string): Promise<void> {
    const storage = await this.getStorage();
    const [exists] = await storage.bucket(bucket).exists();
    if (!exists) {
      try {
        await storage.createBucket(bucket);
      } catch {}
    }
  }
}

class InMemoryBackend implements ICloudStorageBackend {
  private store = new Map<string, { data: Buffer; metadata: StorageMetadata; lastModified: Date }>();

  private fullKey(bucket: string, key: string) {
    return `${bucket}/${key}`;
  }

  async upload(bucket: string, key: string, data: Buffer | string, metadata?: StorageMetadata): Promise<{ etag: string }> {
    const body = typeof data === "string" ? Buffer.from(data) : data;
    const etag = crypto.createHash("md5").update(body).digest("hex");
    this.store.set(this.fullKey(bucket, key), {
      data: body,
      metadata: metadata || {},
      lastModified: new Date(),
    });
    return { etag };
  }

  async download(bucket: string, key: string): Promise<{ data: Buffer; metadata?: StorageMetadata }> {
    const obj = this.store.get(this.fullKey(bucket, key));
    if (!obj) throw new Error(`Object not found: ${bucket}/${key}`);
    return { data: obj.data, metadata: obj.metadata };
  }

  async list(bucket: string, prefix?: string, maxKeys = 1000): Promise<{
    objects: StorageObject[];
    nextToken?: string;
    isTruncated: boolean;
  }> {
    const fullPrefix = prefix ? `${bucket}/${prefix}` : `${bucket}/`;
    const objects: StorageObject[] = [];
    const entries = Array.from(this.store.entries());
    for (const [k, v] of entries) {
      if (k.startsWith(fullPrefix)) {
        objects.push({
          key: k.slice(bucket.length + 1),
          size: v.data.length,
          lastModified: v.lastModified,
          metadata: v.metadata,
        });
        if (objects.length >= maxKeys) break;
      }
    }
    return { objects, isTruncated: objects.length >= maxKeys };
  }

  async delete(bucket: string, key: string): Promise<void> {
    this.store.delete(this.fullKey(bucket, key));
  }

  async generatePresignedUrl(bucket: string, key: string, expirySeconds = 3600): Promise<string> {
    return `memory://${bucket}/${key}?expires=${expirySeconds}`;
  }

  async headObject(bucket: string, key: string): Promise<StorageObject | null> {
    const obj = this.store.get(this.fullKey(bucket, key));
    if (!obj) return null;
    return {
      key,
      size: obj.data.length,
      lastModified: obj.lastModified,
      metadata: obj.metadata,
    };
  }

  async ensureBucket(_bucket: string): Promise<void> {}
}

export class CloudStorageService {
  private backend: ICloudStorageBackend;
  private config: CloudStorageConfig;
  private defaultBucket: string;

  constructor(config?: CloudStorageConfig) {
    this.config = config || getConfigFromEnv();
    this.defaultBucket = this.config.bucket || "secureops-data";

    switch (this.config.provider) {
      case "s3":
      case "minio":
        this.backend = new S3Backend(this.config);
        break;
      case "azure":
        this.backend = new AzureBlobBackend(this.config);
        break;
      case "gcs":
        this.backend = new GCSBackend(this.config);
        break;
      default:
        console.log(`[CloudStorage] No cloud provider configured, using in-memory backend`);
        this.backend = new InMemoryBackend();
    }

    console.log(`[CloudStorage] Initialized with provider: ${this.config.provider}, bucket: ${this.defaultBucket}`);
  }

  getProvider(): CloudStorageProvider {
    return this.config.provider;
  }

  getDefaultBucket(): string {
    return this.defaultBucket;
  }

  async upload(bucket: string, key: string, data: Buffer | string, metadata?: StorageMetadata): Promise<{ etag: string }> {
    return withRetry(() => this.backend.upload(bucket, key, data, metadata));
  }

  async download(bucket: string, key: string): Promise<{ data: Buffer; metadata?: StorageMetadata }> {
    return withRetry(() => this.backend.download(bucket, key));
  }

  async list(bucket: string, prefix?: string, maxKeys?: number, continuationToken?: string): Promise<{
    objects: StorageObject[];
    nextToken?: string;
    isTruncated: boolean;
  }> {
    return withRetry(() => this.backend.list(bucket, prefix, maxKeys, continuationToken));
  }

  async delete(bucket: string, key: string): Promise<void> {
    return withRetry(() => this.backend.delete(bucket, key));
  }

  async generatePresignedUrl(bucket: string, key: string, expirySeconds?: number): Promise<string> {
    return withRetry(() => this.backend.generatePresignedUrl(bucket, key, expirySeconds));
  }

  async headObject(bucket: string, key: string): Promise<StorageObject | null> {
    return withRetry(() => this.backend.headObject(bucket, key));
  }

  async ensureBucket(bucket: string): Promise<void> {
    return withRetry(() => this.backend.ensureBucket(bucket));
  }

  getTierForAge(ageDays: number, policy: RetentionPolicy = DEFAULT_RETENTION_POLICY): StorageTier {
    if (ageDays <= policy.hotDays) return "hot";
    if (ageDays <= policy.warmDays) return "warm";
    if (ageDays <= policy.coldDays) return "cold";
    return "archive";
  }

  buildArchiveKey(tenantId: number, eventType: string, date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `tenants/${tenantId}/${year}/${month}/${day}/${eventType}.json`;
  }

  async archiveEvents(bucket: string, tenantId: number, events: any[], date: Date, eventType: string): Promise<{ key: string; etag: string; count: number }> {
    const key = this.buildArchiveKey(tenantId, eventType, date);
    const data = JSON.stringify(events, null, 0);
    const tier = this.getTierForAge(
      Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
    );
    const { etag } = await this.upload(bucket, key, data, {
      tenantId,
      eventType,
      tier,
      contentType: "application/json",
      eventCount: events.length,
      dateRange: date.toISOString().split("T")[0],
    });
    return { key, etag, count: events.length };
  }

  async listArchivedData(bucket: string, tenantId: number, options?: {
    startDate?: Date;
    endDate?: Date;
    eventType?: string;
    maxKeys?: number;
  }): Promise<StorageObject[]> {
    const prefix = `tenants/${tenantId}/`;
    const result = await this.list(bucket, prefix, options?.maxKeys || 1000);
    let objects = result.objects;

    if (options?.startDate || options?.endDate || options?.eventType) {
      objects = objects.filter(obj => {
        const parts = obj.key.split("/");
        if (parts.length < 6) return true;
        const year = parseInt(parts[2]);
        const month = parseInt(parts[3]) - 1;
        const day = parseInt(parts[4]);
        const objDate = new Date(year, month, day);

        if (options.startDate && objDate < options.startDate) return false;
        if (options.endDate && objDate > options.endDate) return false;
        if (options.eventType && !obj.key.includes(options.eventType)) return false;

        return true;
      });
    }

    return objects;
  }

  async getStorageStats(bucket: string, tenantId?: number): Promise<StorageStats> {
    const prefix = tenantId ? `tenants/${tenantId}/` : "tenants/";
    const result = await this.list(bucket, prefix, 10000);

    const stats: StorageStats = {
      totalObjects: 0,
      totalSizeBytes: 0,
      byTier: {
        hot: { objects: 0, sizeBytes: 0 },
        warm: { objects: 0, sizeBytes: 0 },
        cold: { objects: 0, sizeBytes: 0 },
        archive: { objects: 0, sizeBytes: 0 },
      },
      byTenant: {},
    };

    for (const obj of result.objects) {
      stats.totalObjects++;
      stats.totalSizeBytes += obj.size;

      const parts = obj.key.split("/");
      const tId = parts.length >= 2 ? parts[1] : "unknown";
      if (!stats.byTenant[tId]) {
        stats.byTenant[tId] = { objects: 0, sizeBytes: 0 };
      }
      stats.byTenant[tId].objects++;
      stats.byTenant[tId].sizeBytes += obj.size;

      const ageDays = Math.floor((Date.now() - obj.lastModified.getTime()) / (1000 * 60 * 60 * 24));
      const tier = this.getTierForAge(ageDays);
      stats.byTier[tier].objects++;
      stats.byTier[tier].sizeBytes += obj.size;
    }

    return stats;
  }
}

let cloudStorageInstance: CloudStorageService | null = null;

export function getCloudStorage(): CloudStorageService {
  if (!cloudStorageInstance) {
    cloudStorageInstance = new CloudStorageService();
  }
  return cloudStorageInstance;
}

export function createCloudStorage(config: CloudStorageConfig): CloudStorageService {
  return new CloudStorageService(config);
}
