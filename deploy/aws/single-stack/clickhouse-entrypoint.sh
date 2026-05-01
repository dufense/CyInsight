#!/bin/bash
set -e

# Ensure config directories exist and are writable
mkdir -p /etc/clickhouse-server/config.d
mkdir -p /var/lib/clickhouse/metadata/s3_warm

# Generate network config to bind to all interfaces (critical for ALB health checks)
cat > /etc/clickhouse-server/config.d/network.xml << XMLEOF
<clickhouse>
  <listen_host>0.0.0.0</listen_host>
  <listen_host>::</listen_host>
  <listen_try>1</listen_try>
</clickhouse>
XMLEOF

# NOTE: S3 tiering is temporarily disabled because ClickHouse 24.8 segfaults
# when initializing the S3 disk with use_environment_credentials in Fargate.
# Re-enable after testing with a staging environment.
# See: clickhouse-entrypoint.sh in git history for the S3 config.

# Ensure the main config.xml exists. The base image has it at /etc/clickhouse-server/config.xml
# but ClickHouse may look in the current working directory. Create a symlink if needed.
if [ ! -f /var/lib/clickhouse/config.xml ] && [ -f /etc/clickhouse-server/config.xml ]; then
    ln -sf /etc/clickhouse-server/config.xml /var/lib/clickhouse/config.xml
fi

# Ensure proper ownership
chown -R clickhouse:clickhouse /var/lib/clickhouse /etc/clickhouse-server/config.d 2>/dev/null || true

echo "ClickHouse configs generated. Starting server..."

# IMPORTANT: Do NOT pass arguments to the base entrypoint.
# The base /entrypoint.sh expects NO arguments to run the full server setup.
exec /entrypoint.sh
