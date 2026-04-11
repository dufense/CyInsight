ALTER TABLE "security_integrations" ADD CONSTRAINT "security_integrations_tenant_platform_key" UNIQUE("tenant_id","platform_key");
