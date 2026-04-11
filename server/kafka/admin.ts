import { getKafkaInstance } from "./producer";
import { getTopicConfigs, TOPIC_DEFINITIONS } from "./topics";

export async function ensureTopicsExist(replicationFactor?: number): Promise<boolean> {
  const kafka = getKafkaInstance();
  if (!kafka) {
    console.log("[Kafka Admin] Kafka not configured, skipping topic creation");
    return false;
  }

  const admin = kafka.admin();
  try {
    await admin.connect();

    const existingTopics = await admin.listTopics();
    const topicConfigs = getTopicConfigs(replicationFactor);
    const toCreate = topicConfigs.filter((t) => !existingTopics.includes(t.topic));

    if (toCreate.length === 0) {
      console.log(`[Kafka Admin] All ${topicConfigs.length} topics already exist`);
      await admin.disconnect();
      return true;
    }

    console.log(
      `[Kafka Admin] Creating ${toCreate.length} topics: ${toCreate.map((t) => t.topic).join(", ")}`
    );

    await admin.createTopics({
      waitForLeaders: true,
      timeout: 30000,
      topics: toCreate,
    });

    console.log(`[Kafka Admin] Successfully created ${toCreate.length} topics`);
    await admin.disconnect();
    return true;
  } catch (err: any) {
    console.error(`[Kafka Admin] Topic creation failed: ${err.message}`);
    try {
      await admin.disconnect();
    } catch {}
    return false;
  }
}

export async function getTopicHealth(): Promise<{
  available: boolean;
  topics: Array<{
    name: string;
    partitions: number;
    description: string;
    exists: boolean;
  }>;
}> {
  const kafka = getKafkaInstance();
  if (!kafka) {
    return {
      available: false,
      topics: TOPIC_DEFINITIONS.map((d) => ({
        name: d.topic,
        partitions: d.numPartitions,
        description: d.description,
        exists: false,
      })),
    };
  }

  const admin = kafka.admin();
  try {
    await admin.connect();
    const existingTopics = await admin.listTopics();
    await admin.disconnect();

    return {
      available: true,
      topics: TOPIC_DEFINITIONS.map((d) => ({
        name: d.topic,
        partitions: d.numPartitions,
        description: d.description,
        exists: existingTopics.includes(d.topic),
      })),
    };
  } catch (err: any) {
    return {
      available: false,
      topics: TOPIC_DEFINITIONS.map((d) => ({
        name: d.topic,
        partitions: d.numPartitions,
        description: d.description,
        exists: false,
      })),
    };
  }
}

export async function getConsumerGroupLag(
  groupId: string
): Promise<Record<string, number>> {
  const kafka = getKafkaInstance();
  if (!kafka) return {};

  const admin = kafka.admin();
  try {
    await admin.connect();
    const offsets = await admin.fetchOffsets({ groupId });
    const lag: Record<string, number> = {};

    for (const topicOffset of offsets) {
      const topicOffsets = await admin.fetchTopicOffsets(topicOffset.topic);
      let totalLag = 0;
      for (const partition of topicOffsets) {
        const committed = offsets.find(
          (o) => o.topic === topicOffset.topic
        );
        if (committed) {
          const high = parseInt(partition.high || "0", 10);
          const current = parseInt(topicOffset.offset || "0", 10);
          totalLag += Math.max(0, high - current);
        }
      }
      lag[topicOffset.topic] = totalLag;
    }

    await admin.disconnect();
    return lag;
  } catch {
    return {};
  }
}
