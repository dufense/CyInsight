# CyInsight AWS Deployment Guide
## Complete Architecture & Cost Analysis for India (ap-south-1)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Deployment Option 1: Cost-Optimized Starter](#option-1-cost-optimized-starter)
4. [Deployment Option 2: Balanced Production](#option-2-balanced-production)
5. [Deployment Option 3: Enterprise Scale](#option-3-enterprise-scale)
6. [Comparison Matrix](#comparison-matrix)
7. [Decision Framework](#decision-framework)
8. [Implementation Steps](#implementation-steps)
9. [Post-Deployment Operations](#post-deployment-operations)
10. [Cost Optimization Strategies](#cost-optimization-strategies)

---

## Executive Summary

This guide presents **three deployment approaches** for CyInsight on AWS India (ap-south-1), each designed for different business stages, scale requirements, and budget constraints.

### Quick Reference

| Option | Monthly Cost | Tenants | Events/Sec | Best For |
|--------|-------------|---------|-----------|----------|
| **Starter** | ₹35K-50K | 1-10 | <1,000 | MVP, POC, Small Production |
| **Balanced** | ₹1.2L-1.8L | 10-50 | 5K-20K | Growing MSSP, Production |
| **Enterprise** | ₹3.5L-5L+ | 50-500+ | 20K-100K+ | Established MSSP, Multi-region |

---

## Architecture Overview

### Three-Plane Architecture

CyInsight follows a **three-plane distributed architecture**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CyInsight Platform Architecture                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────┐                                                    │
│   │   LOG SOURCES       │  CrowdStrike, Palo Alto, Microsoft Sentinel, etc. │
│   └──────────┬──────────┘                                                    │
│              │                                                               │
│              ▼                                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    RECEIVER & ANALYTICS PLANE                        │   │
│   │  ┌─────────────┐  ┌─────────┐  ┌─────────────┐  ┌──────────────┐   │   │
│   │  │ API Gateway │─►│  Kafka  │─►│ Normalizer  │─►│ Sigma Engine │   │   │
│   │  │   (ALB)     │  │  (MSK)  │  │  Service    │  │              │   │   │
│   │  └─────────────┘  └─────────┘  └─────────────┘  └──────┬───────┘   │   │
│   │                                                         │          │   │
│   │  ┌─────────────┐  ┌─────────┐  ┌─────────────┐         │          │   │
│   │  │  Enrichment │◄─│  Risk   │◄─│   Router    │◄────────┘          │   │
│   │  │   Service   │  │ Engine  │  │             │                    │   │
│   │  └──────┬──────┘  └────┬────┘  └──────┬──────┘                    │   │
│   └─────────┼──────────────┼──────────────┼───────────────────────────┘   │
│             │              │              │                                 │
│             ▼              ▼              ▼                                 │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      MANAGEMENT PLANE                                │   │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐   │   │
│   │  │ API Server  │  │   Admin     │  │   Report    │  │  Incident │   │   │
│   │  │  (Express)  │  │   Portal    │  │  Generator  │  │  Engine   │   │   │
│   │  └──────┬──────┘  └─────────────┘  └─────────────┘  └─────┬─────┘   │   │
│   │         │                                                │         │   │
│   │         └────────────────┬───────────────────────────────┘         │   │
│   │                          ▼                                          │   │
│   │  ┌─────────────────────────────────────────────────────────────┐   │   │
│   │  │              PostgreSQL (Aurora/Aurora Serverless)           │   │   │
│   │  └─────────────────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│             │                                                               │
│             ▼                                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        DATA PLANE                                    │   │
│   │                                                                      │   │
│   │   ┌─────────────┐   ┌─────────────┐   ┌─────────────────────────┐   │   │
│   │   │ TimescaleDB │   │ ClickHouse │   │ S3 + Glacier            │   │   │
│   │   │ (Hot 90d)   │   │ (30d index) │   │ (Warm/Cold/Archive)     │   │   │
│   │   └─────────────┘   └─────────────┘   └─────────────────────────┘   │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Purpose | Technology |
|-----------|---------|------------|
| **API Gateway** | HTTP/HTTPS ingress, SSL termination | AWS ALB |
| **Kafka** | Event streaming, decoupling | Amazon MSK |
| **Normalizer** | Field mapping, schema conversion | Node.js ECS |
| **Sigma Engine** | Detection rules, alerting | Node.js ECS |
| **Enrichment** | MITRE ATT&CK, IOC scoring | Node.js ECS |
| **API Server** | REST API, authentication | Express.js ECS |
| **PostgreSQL** | Configuration, metadata | Amazon RDS/Aurora |
| **ClickHouse** | Log search, analytics | self-managed ClickHouse |
| **S3** | Long-term storage | Amazon S3 + Glacier |

---

## Option 1: Cost-Optimized Starter

### Overview
**Monthly Cost**: ₹35,000-50,000  
**Target**: MVP, POC, Small Production (1-10 tenants)  
**Best For**: Startups, budget-constrained deployments, proof of concept

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│              Option 1: Cost-Optimized Starter Architecture              │
│                     AWS India (ap-south-1)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Internet                                                                │
│     │                                                                    │
│     ▼                                                                    │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    APPLICATION LOAD BALANCER                    │    │
│  │                        (HTTP/HTTPS)                             │    │
│  └────────────────────────────┬───────────────────────────────────┘    │
│                               │                                          │
│                               ▼                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                         ECS FARGATE                             │    │
│  │                                                                 │    │
│  │  ┌─────────────────────────────────────────────────────────┐   │    │
│  │  │              Combined All-in-One Container               │   │    │
│  │  │                                                          │   │    │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │   │    │
│  │  │  │ Management  │  │  Receiver   │  │ Data Plane  │      │   │    │
│  │  │  │   API       │  │   Plane     │  │  Services   │      │   │    │
│  │  │  │  (5000)     │  │  (5001)     │  │  (5002)     │      │   │    │
│  │  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │   │    │
│  │  │         └─────────────────┼─────────────────┘             │   │    │
│  │  │                           │                               │   │    │
│  │  │              ┌────────────┴────────────┐                  │   │    │
│  │  │              │   Shared Resources       │                  │   │    │
│  │  │              │  (2 tasks, 2 vCPU/4GB)   │                  │   │    │
│  │  │              └─────────────────────────┘                  │   │    │
│  │  └─────────────────────────────────────────────────────────┘   │    │
│  │                                                                 │    │
│  │  Configuration:                                                 │    │
│  │  • 2 Fargate tasks (min)                                        │    │
│  │  • 2 vCPU / 4 GB RAM per task                                   │    │
│  │  • Fargate Spot enabled (60% savings)                           │    │
│  │  • Auto-scaling: 2-6 tasks                                      │    │
│  │                                                                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                               │                                          │
│           ┌───────────────────┼───────────────────┐                      │
│           │                   │                   │                      │
│           ▼                   ▼                   ▼                      │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                 │
│  │  RDS         │   │  ElastiCache │   │ ClickHouse │                 │
│  │ PostgreSQL   │   │  Redis       │   │  (Single)    │                 │
│  │              │   │  (Single)    │   │              │                 │
│  │ • db.t3.med  │   │              │   │ • 2 vCPU     │                 │
│  │ • Single-AZ  │   │ • t3.micro   │   │ • 4 GB       │                 │
│  │ • 100 GB     │   │ • 1 node     │   │ • EFS 100GB  │                 │
│  │ • No replica │   │ • No cluster │   │ • No replica │                 │
│  └──────────────┘   └──────────────┘   └──────────────┘                 │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                         S3 BUCKET                               │    │
│  │              (Data lake, reports, backups)                      │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Network: 2 AZs, 1 NAT Gateway (cost-optimized)                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Resource Configuration

| Service | Instance Type | Specs | Monthly Cost (₹) |
|---------|--------------|-------|------------------|
| **ECS Fargate** | Fargate Spot | 2 tasks × 2 vCPU × 4GB | ₹15,000-20,000 |
| **RDS PostgreSQL** | db.t3.medium | 2 vCPU, 4GB, Single-AZ | ₹6,000-9,000 |
| **ElastiCache Redis** | cache.t3.micro | 1 node, Single-AZ | ₹2,000-2,500 |
| **ClickHouse** | Fargate + EFS | 1 task × 2 vCPU/4GB, 100GB | ₹4,000-6,000 |
| **Application LB** | ALB | 1 ALB + LCU | ₹3,000-3,500 |
| **NAT Gateway** | - | 1 NAT GW | ₹3,000-3,200 |
| **S3** | Standard | 500GB + transfers | ₹1,500-2,000 |
| **CloudWatch** | Logs | 10GB/day, 7-day retention | ₹1,500-2,000 |
| **Other** | - | Secrets, IAM, etc. | ₹1,000-1,500 |
| **TOTAL** | | | **₹34,000-47,700** |
| **With Fargate Spot** | | | **₹30,000-42,000** |

### Key Characteristics

#### ✅ Advantages

1. **Low Entry Cost**: Start at ₹35K/month vs ₹2L+ for full architecture
2. **Fast Deployment**: Single CloudFormation stack, ~30 minutes
3. **Simplified Operations**: Fewer moving parts, easier troubleshooting
4. **Easy Upgrade Path**: Can migrate to Option 2/3 without data loss
5. **Pay-as-You-Grow**: Add capacity incrementally

#### ❌ Limitations

1. **No High Availability**: 
   - Single-AZ RDS = downtime during AZ failure (~2-4 hours/year)
   - Single-node ClickHouse = data loss risk if EFS/node fails
   - No automatic failover

2. **Limited Scale**:
   - Max ~5,000 events/second before bottlenecks
   - Max ~10 tenants
   - No horizontal scaling of data plane

3. **Maintenance Windows**:
   - Database maintenance requires downtime
   - Cannot support zero-downtime deployments

4. **No Data Residency**:
   - Cannot support multi-region tenant requirements
   - All data in single region

### When to Choose Option 1

**✅ Choose this if:**
- You are building an MVP or POC
- Budget is constrained (< ₹50K/month)
- You have < 10 tenants currently
- Downtime of 1-2 hours/month is acceptable
- You plan to upgrade within 6-12 months
- You are validating product-market fit

**❌ Don't choose if:**
- You need 99.9%+ SLA commitments
- You have compliance requirements (SOC2, ISO 27001)
- You expect rapid growth (>100% in 3 months)
- You need multi-region data residency
- You have enterprise clients requiring HA

### Upgrade Path to Option 2

```
Month 1-3:  Option 1 (Starter)
    │
    │ Trigger: >10 tenants OR >5,000 events/sec OR need HA
    ▼
Month 4:    Begin Migration
    │
    ├─ Step 1: Create Multi-AZ RDS standby
    ├─ Step 2: Add second ClickHouse replica
    ├─ Step 3: Separate planes to different ECS services
    └─ Step 4: Add MSK Kafka cluster
    │
    ▼
Month 5-6:  Option 2 (Balanced Production)
```

---

## Option 2: Balanced Production

### Overview
**Monthly Cost**: ₹1,20,000-1,80,000  
**Target**: Growing MSSP (10-50 tenants)  
**Best For**: Production workloads requiring HA and scalability

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                Option 2: Balanced Production Architecture                   │
│                        AWS India (ap-south-1)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Internet                                                                    │
│     │                                                                        │
│     ▼                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    APPLICATION LOAD BALANCERS                         │   │
│  │                                                                       │   │
│  │  ┌─────────────────────────┐    ┌─────────────────────────────────┐   │   │
│  │  │   Public ALB (Mgmt)     │    │   Internal ALB (Data Plane)     │   │   │
│  │  │   HTTPS, WAF-enabled    │    │   Internal VPC only             │   │   │
│  │  └────────────┬────────────┘    └─────────────────────────────────┘   │   │
│  │               │                                                       │   │
│  └───────────────┼───────────────────────────────────────────────────────┘   │
│                  │                                                            │
│     ┌────────────┼────────────┬────────────────────────────────┐             │
│     │            │            │                                │             │
│     ▼            ▼            ▼                                ▼             │
│  ┌────────┐ ┌──────────┐ ┌──────────┐                  ┌──────────────┐     │
│  │ MANAGE │ │ RECEIVER │ │  DATA    │                  │   MSK        │     │
│  │  MENT  │ │  PLANE   │ │  PLANE   │                  │   KAFKA      │     │
│  │ PLANE  │ │          │ │          │                  │              │     │
│  │        │ │          │ │          │                  │  ┌────────┐  │     │
│  │ ┌────┐ │ │ ┌──────┐ │ │ ┌──────┐ │                  │  │Broker 1│  │     │
│  │ │API │ │ │ │API   │ │ │ │Events│ │                  │  │  m5.l  │  │     │
│  │ │Svr │ │ │ │Gatew │ │ │ │Store │ │                  │  └────┬───┘  │     │
│  │ │    │ │ │ │way   │ │ │ │      │ │                  │  ┌────┴───┐  │     │
│  │ └────┘ │ │ └──────┘ │ │ └──────┘ │                  │  │Broker 2│  │     │
│  │        │ │          │ │          │                  │  │  m5.l  │  │     │
│  │ ┌────┐ │ │ ┌──────┐ │ │ ┌──────┐ │                  │  └────┬───┘  │     │
│  │ │Adm │ │ │ │Norm  │◄┼─┼►│Search│ │                  │  ┌────┴───┐  │     │
│  │ │Port│ │ │ │alizer│ │ │ │ Open │ │                  │  │Broker 3│  │     │
│  │ │    │ │ │ │      │ │ │ │Search│ │                  │  │  m5.l  │  │     │
│  │ └────┘ │ │ └──────┘ │ │ └──────┘ │                  │  └────────┘  │     │
│  │        │ │          │ │          │                  │              │     │
│  │ ┌────┐ │ │ ┌──────┐ │ │ ┌──────┐ │                  │ 3 nodes,     │     │
│  │ │Repo│ │ │ │Sigma │ │ │ │S3    │ │                  │ 500GB each   │     │
│  │ │rts │ │ │ │Eng  │ │ │ │Data  │ │                  │ 3-AZ HA      │     │
│  │ │    │ │ │ │      │ │ │ │Lake  │ │                  │              │     │
│  │ └────┘ │ │ └──────┘ │ │ └──────┘ │                  └──────────────┘     │
│  │        │ │          │ │          │                                        │
│  │ 2-6    │ │  2-10    │ │  2-8     │                                        │
│  │ tasks  │ │  tasks   │ │  tasks   │                                        │
│  └────────┘ └──────────┘ └──────────┘                                        │
│       │           │           │                                              │
│       └───────────┼───────────┘                                              │
│                   ▼                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      SHARED DATA STORES                               │   │
│  │                                                                       │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │   │
│  │  │ Aurora Serverless│  │ ElastiCache      │  │ ClickHouse      │    │   │
│  │  │ PostgreSQL       │  │ Redis Cluster    │  │ Domain           │    │   │
│  │  │                  │  │                  │  │                  │    │   │
│  │  │ • 1-16 ACU       │  │ • 2+ nodes       │  │ • 2 shards x 2   │    │   │
│  │  │ • Multi-AZ       │  │ • Cluster mode   │  │   replicas       │    │   │
│  │  │ • Auto-scaling   │  │ • Multi-AZ       │  │ • S3 cold tier   │    │   │
│  │  │ • Read replica   │  │ • Failover       │  │ • 3-AZ ZooKeeper │    │   │
│  │  │                  │  │                  │  │                  │    │   │
│  │  │ Cost: ₹35K       │  │ Cost: ₹18K       │  │ Cost: ₹42K       │    │   │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘    │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Network: 3-tier VPC, 3 AZs, 2 NAT Gateways, VPC Endpoints                  │
│  Security: Security groups, NACLs, AWS WAF, encryption at rest & transit    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Resource Configuration

| Service | Instance Type | Specs | HA | Monthly Cost (₹) |
|---------|--------------|-------|----|------------------|
| **ECS Mgmt** | Fargate Spot | 2-6 tasks, 1 vCPU/2GB | Multi-AZ | ₹18,000 |
| **ECS Receiver** | Fargate Spot | 2-10 tasks, 2 vCPU/4GB | Multi-AZ | ₹35,000 |
| **ECS Data** | Fargate Spot | 2-8 tasks, 2 vCPU/4GB | Multi-AZ | ₹28,000 |
| **Aurora Serverless** | - | 1-16 ACU, Multi-AZ | ✅ Yes | ₹35,000 |
| **Amazon MSK** | kafka.m5.large | 3 brokers, 500GB each | 3-AZ | ₹45,000 |
| **ClickHouse** | r6g.large | 2 shards x 2 replicas + 3 ZK | ✅ Yes | ₹42,000 |
| **ElastiCache** | cache.r6g.large | Cluster mode, 2+ nodes | ✅ Yes | ₹18,000 |
| **ALB** | - | 2 ALBs (public + internal) | Multi-AZ | ₹7,000 |
| **EFS** | Elastic | 100GB | Multi-AZ | ₹3,500 |
| **S3** | Intelligent-Tiering | 2TB | Cross-region opt | ₹4,500 |
| **NAT Gateway** | - | 2 NAT GWs | Multi-AZ | ₹6,400 |
| **Data Transfer** | - | 500GB/mo | - | ₹7,500 |
| **CloudWatch** | - | Enhanced + X-Ray | - | ₹8,000 |
| **WAF** | - | Basic rules | - | ₹2,500 |
| **TOTAL** | | | | **₹2,60,200** |
| **Optimized** | | Fargate Spot + Reserved | | **₹1,55,000** |
| **Conservative** | | No spot, on-demand | | **₹1,80,000** |

### Key Characteristics

#### ✅ Advantages

1. **True High Availability**:
   - Multi-AZ Aurora with automatic failover (< 60 seconds)
   - 3-node Kafka cluster (tolerates 1 node failure)
   - 2+ shard ClickHouse with replica shards
   - Redis cluster with failover

2. **Auto-Scaling**:
   - ECS services scale based on CPU/Memory (2-50 tasks)
   - Aurora Serverless scales 1-16 ACU automatically
   - MSK storage auto-scales up to 4TB per broker

3. **Three-Plane Separation**:
   - Independent scaling of Management, Receiver, and Data planes
   - Plane isolation for security and resource management
   - Independent deployment of each plane

4. **Data Lifecycle Management**:
   - Hot: 0-90 days (TimescaleDB)
   - Warm: 91-365 days (S3 Standard-IA)
   - Cold: 1-3 years (S3 Glacier)
   - Archive: 3+ years (S3 Glacier Deep Archive)

5. **Production SLA**: 99.9% uptime achievable

6. **Multi-Region Ready**: Can add Bahrain, Kenya, or other data planes

#### ❌ Considerations

1. **Higher Complexity**:
   - 12+ CloudFormation stacks vs 1 in Option 1
   - Requires understanding of 3-plane architecture
   - More components to monitor and troubleshoot

2. **Operational Overhead**:
   - Requires dedicated DevOps/SRE (~0.5 FTE)
   - Need for 24/7 on-call rotation
   - Regular maintenance and patching

3. **Higher Cost Floor**:
   - Even at idle, ~₹80K/month minimum
   - Cannot scale to zero like Option 1

### When to Choose Option 2

**✅ Choose this if:**
- You have 10-50 active tenants
- You need 99.9% uptime SLA
- You process 5,000-20,000 events/second
- Budget of ₹1-2L/month is acceptable
- You have DevOps capability in-house
- You need data residency compliance
- You have enterprise clients

**❌ Don't choose if:**
- Budget is < ₹1L/month
- You don't have DevOps resources
- You are still in product-market fit phase
- Your traffic is highly unpredictable
- You have < 5 tenants

### Upgrade Path to Option 3

```
Current: Option 2 (Single Region - India)
    │
    │ Trigger: >50 tenants OR need multi-region OR compliance requirement
    ▼
Phase 1: Add Data Plane in Bahrain (me-south-1)
    │
    ├─ Deploy VPC in Bahrain
    ├─ Deploy Data Plane ECS in Bahrain
    ├─ Configure cross-region VPC peering
    └─ Update management plane federation
    │
Phase 2: Add Data Plane in Kenya (af-south-1)
    │
    ├─ Same as Bahrain deployment
    └─ Configure Transit Gateway for routing
    │
Phase 3: Enterprise Features
    │
    ├─ Enable GuardDuty, Security Hub
    ├─ Configure AWS Config compliance
    ├─ Set up cross-region backup
    └─ Implement AWS Organizations
    │
Result: Option 3 (Multi-Region Enterprise)
```

---

## Option 3: Enterprise Scale

### Overview
**Monthly Cost**: ₹3,50,000-5,00,000+ (per region)  
**Target**: Established MSSP (50-500+ tenants)  
**Best For**: Enterprise clients, multi-region, compliance-heavy

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                     Option 3: Enterprise Multi-Region Architecture                       │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│                              GLOBAL TRAFFIC MANAGEMENT                                   │
│                         ┌─────────────────────────────────┐                              │
│                         │    Amazon Route 53 + Global     │                              │
│                         │    Accelerator / CloudFront     │                              │
│                         └───────────────┬─────────────────┘                              │
│                                         │                                                │
│           ┌─────────────────────────────┼─────────────────────────────┐                  │
│           │                             │                             │                  │
│           ▼                             ▼                             ▼                  │
│  ┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐          │
│  │   INDIA REGION      │    │   BAHRAIN REGION    │    │    KENYA REGION     │          │
│  │   (ap-south-1)      │    │   (me-south-1)      │    │   (af-south-1)      │          │
│  │                     │    │                     │    │                     │          │
│  │  ┌───────────────┐  │    │  ┌───────────────┐  │    │  ┌───────────────┐  │          │
│  │  │ Mgmt Plane    │  │    │  │ Data Plane    │  │    │  │ Data Plane    │  │          │
│  │  │ (Primary)     │  │◄───┼──┤ (Federated)   │  │◄───┼──┤ (Federated)   │  │          │
│  │  │               │  │    │  │               │  │    │  │               │  │          │
│  │  │ • 4-20 tasks  │  │    │  │ • 4-20 tasks  │  │    │  │ • 4-20 tasks  │  │          │
│  │  │ • Aurora Global│  │    │  │ • Aurora      │  │    │  │ • Aurora      │  │          │
│  │  │ • MSK (5 brkr)│  │    │  │   (regional)  │  │    │  │   (regional)  │  │          │
│  │  │ • CH (6 node) │  │    │  │ • CH (6 node) │  │    │  │ • CH (6 node) │  │          │
│  │  └───────────────┘  │    │  └───────────────┘  │    │  └───────────────┘  │          │
│  │                     │    │                     │    │                     │          │
│  │  ┌───────────────┐  │    │  ┌───────────────┐  │    │  ┌───────────────┐  │          │
│  │  │ Data Plane    │  │    │  │ S3 Bucket     │  │    │  │ S3 Bucket     │  │          │
│  │  │ (Local)       │  │    │  │ (Regional)    │  │    │  │ (Regional)    │  │          │
│  │  └───────────────┘  │    │  └───────────────┘  │    │  └───────────────┘  │          │
│  │                     │    │                     │    │                     │          │
│  └─────────────────────┘    └─────────────────────┘    └─────────────────────┘          │
│           │                             │                             │                  │
│           └─────────────────────────────┼─────────────────────────────┘                  │
│                                         │                                                │
│                              ┌──────────┴──────────┐                                     │
│                              │  AWS Transit        │                                     │
│                              │  Gateway            │                                     │
│                              │  (Cross-region)     │                                     │
│                              └─────────────────────┘                                     │
│                                                                                          │
│  Enterprise Security & Compliance:                                                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │ GuardDuty    │ │ Security Hub │ │   Macie      │ │ CloudTrail   │ │ AWS Config   │   │
│  │ (Threats)    │ │ (Compliance) │ │ (Data Prtct) │ │ (Audit Logs) │ │ (Rules)      │   │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │
│                                                                                          │
│  Backup & DR:                                                                            │
│  ┌────────────────────────────────────────────────────────────────────────────────┐     │
│  │  AWS Backup ──► Cross-region backup copy ──► S3 Glacier Deep Archive           │     │
│  │  RPO: 1 hour | RTO: 4 hours                                                     │     │
│  └────────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                          │
│  Support: AWS Enterprise Support with Technical Account Manager (TAM)                   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Per-Region Resource Configuration (India Example)

| Service | Instance Type | Specs | HA | Monthly Cost (₹) |
|---------|--------------|-------|----|------------------|
| **ECS Mgmt** | Fargate Spot | 4-20 tasks, 2 vCPU/4GB | Multi-AZ | ₹45,000 |
| **ECS Receiver** | Fargate Spot | 5-50 tasks, 2 vCPU/4GB | Multi-AZ | ₹75,000 |
| **ECS Data** | Fargate Spot | 4-20 tasks, 2 vCPU/4GB | Multi-AZ | ₹55,000 |
| **Aurora Global** | - | 4-128 ACU, cross-region replica | Global | ₹1,25,000 |
| **Amazon MSK** | kafka.m5.xlarge | 5 brokers, 1TB each | 3-AZ | ₹1,50,000 |
| **ClickHouse** | r6g.xlarge | 6 shards x 2 replicas + 3 ZK | 3-AZ | ₹1,80,000 |
| **ElastiCache** | cache.r6g.xlarge | 6 nodes cluster | Multi-AZ | ₹45,000 |
| **ALB** | - | 3 ALBs per region | Multi-AZ | ₹12,000 |
| **Transit GW** | - | Cross-region connectivity | - | ₹25,000 |
| **EFS** | Elastic | 500GB | Multi-AZ | ₹15,000 |
| **S3** | Intelligent-Tiering | 10TB per region | Cross-region | ₹25,000 |
| **Data Transfer** | - | 5TB/mo cross-region | - | ₹45,000 |
| **CloudWatch** | - | Full observability | - | ₹25,000 |
| **NAT Gateway** | - | 3 per region | Multi-AZ | ₹28,800 |
| **GuardDuty** | - | Threat detection | - | ₹15,000 |
| **Security Hub** | - | Compliance checks | - | Included |
| **WAF + Shield** | - | Advanced DDoS protection | - | ₹25,000 |
| **Enterprise Support** | - | TAM, 15-min response | - | ₹50,000 |
| **TOTAL per region** | | | | **₹9,42,800** |
| **TOTAL (3 regions)** | | | | **₹28,28,400** |
| **Optimized** | | Savings plans + Reserved | | **₹15,00,000** |

### Key Characteristics

#### ✅ Advantages

1. **Global High Availability**:
   - Multi-region active-active or hot-standby
   - Automatic failover between regions
   - Data replication across regions

2. **Enterprise SLA**: 99.99% uptime achievable

3. **Compliance Ready**:
   - SOC2 Type II
   - ISO 27001
   - RBI (India)
   - PDPL (Bahrain)
   - KDPA (Kenya)
   - GDPR (for EU data)

4. **Unlimited Scale**:
   - 100,000+ events/second
   - 500+ tenants
   - Petabyte-scale storage

5. **Advanced Security**:
   - GuardDuty for threat detection
   - Security Hub for compliance
   - Macie for data protection
   - AWS WAF + Shield Advanced

6. **Data Residency**:
   - Tenant data stays in their region
   - Compliant with local regulations
   - Cross-border data controls

7. **Enterprise Support**:
   - AWS TAM (Technical Account Manager)
   - 15-minute response time
   - Architecture reviews

#### ❌ Considerations

1. **Very High Cost**: ₹15L+/month for 3-region deployment
2. **Complexity**: 50+ CloudFormation stacks
3. **Team Requirements**: Minimum 2-3 DevOps/SRE engineers
4. **Long Lead Times**: 1-2 weeks for full deployment
5. **Vendor Lock-in**: Deep AWS integration
6. **Management Overhead**: Dedicated platform team needed

### When to Choose Option 3

**✅ Choose this if:**
- You have 100+ enterprise tenants
- You process 50,000+ events/second
- You need multi-region data residency
- You have compliance requirements (SOC2, ISO 27001, etc.)
- Budget of ₹15L+/month is approved
- You have dedicated platform/DevOps team (3+ people)
- You need 99.99% SLA
- You serve enterprise clients with strict requirements

**❌ Don't choose if:**
- You have < 50 tenants
- Budget is < ₹5L/month
- You don't have dedicated DevOps resources
- You are not yet profitable
- Your growth is steady/predictable
- You don't need multi-region

---

## Comparison Matrix

### Side-by-Side Comparison

| Criteria | Option 1: Starter | Option 2: Balanced | Option 3: Enterprise |
|----------|------------------|-------------------|---------------------|
| **Monthly Cost** | ₹35K-50K | ₹1.2L-1.8L | ₹15L+ (3 regions) |
| **Initial Setup Cost** | ₹50K | ₹2L | ₹5L+ |
| **Year 1 TCO** | ₹10.5L | ₹30L | ₹95L+ |
| **Tenants Supported** | 1-10 | 10-50 | 50-500+ |
| **Events/Second** | < 1,000 | 5K-20K | 20K-100K+ |
| **Availability** | 99% | 99.9% | 99.99% |
| **RTO** | Hours | Minutes | Seconds |
| **RPO** | Hours | Minutes | Seconds |
| **HA/DR** | None | Multi-AZ | Multi-region |
| **Data Residency** | No | Yes (1 region) | Yes (multi-region) |
| **Compliance** | Basic | Standard | Enterprise |
| **Deploy Time** | 30 min | 2-3 hours | 1-2 weeks |
| **Ops Overhead** | 0.1 FTE | 0.5 FTE | 2-3 FTE |
| **Auto-scaling** | Limited | Full | Full + Predictive |
| **Upgrade Path** | To 2/3 | To 3 | N/A |
| **Support** | Basic | Business | Enterprise |

### Feature Comparison

| Feature | Starter | Balanced | Enterprise |
|---------|---------|----------|------------|
| **Multi-AZ RDS** | ❌ | ✅ | ✅ |
| **Read Replicas** | ❌ | ✅ | ✅ Global |
| **Auto-scaling** | Manual | Target tracking | Predictive |
| **MSK Kafka** | Self-hosted | Managed 3-node | Managed 5-node |
| **ClickHouse HA** | ❌ | 2-node | 6-node |
| **Redis Cluster** | ❌ | ✅ | ✅ Multi-region |
| **Separate Planes** | ❌ | ✅ | ✅ |
| **Data Lifecycle** | Manual | Automatic | Automatic + AI |
| **Cross-region** | ❌ | ❌ | ✅ |
| **WAF** | ❌ | Basic | Advanced + Shield |
| **GuardDuty** | ❌ | ❌ | ✅ |
| **Security Hub** | ❌ | ❌ | ✅ |
| **AWS TAM** | ❌ | ❌ | ✅ |

---

## Decision Framework

### Decision Tree

```
START
  │
  ├── What is your monthly budget?
  │   │
  │   ├── < ₹50K ───────────────────────────────► Option 1 (Starter)
  │   │
  │   ├── ₹50K - ₹1L
  │   │   │
  │   │   ├── Tenants < 10? ────────────────────► Option 1 (Starter)
  │   │   │
  │   │   └── Tenants ≥ 10? ────────────────────► Option 2 (Balanced)
  │   │
  │   ├── ₹1L - ₹5L
  │   │   │
  │   │   ├── Need multi-region? ───────────────► Option 3 (Enterprise)
  │   │   │   │
  │   │   │   └── Start with 1 region first
  │   │   │
  │   │   └── Single region only? ──────────────► Option 2 (Balanced)
  │   │
  │   └── > ₹5L
  │       │
  │       ├── Tenants > 50? ────────────────────► Option 3 (Enterprise)
  │       │
  │       └── Tenants ≤ 50? ────────────────────► Option 2 (Balanced)
  │
  └── What is your uptime requirement?
      │
      ├── < 99% acceptable ─────────────────────► Option 1 (Starter)
      │
      ├── 99% - 99.9% ──────────────────────────► Option 2 (Balanced)
      │
      └── > 99.9% ──────────────────────────────► Option 3 (Enterprise)
```

### Risk Assessment Matrix

| Risk Factor | Starter | Balanced | Enterprise |
|-------------|---------|----------|------------|
| **Outgrow in 6 months** | 🔴 High | 🟡 Low | 🟢 Very Low |
| **Budget overrun** | 🟢 Low | 🟡 Medium | 🔴 High |
| **Operational complexity** | 🟢 Low | 🟡 Medium | 🔴 High |
| **Downtime risk** | 🔴 High | 🟡 Low | 🟢 Very Low |
| **Security incidents** | 🔴 High | 🟡 Medium | 🟢 Low |
| **Compliance failures** | 🔴 High | 🟡 Medium | 🟢 Low |
| **Migration effort later** | 🟡 Medium | 🟢 Low | N/A |

---

## Implementation Steps

### For Option 1 (Starter)

See: `/deploy/aws/single-stack/README.md`

Quick start:
```bash
cd deploy/aws/single-stack
./deploy.sh
```

### For Option 2 (Balanced)

See: `/deploy/docs/MULTI-REGION-HA-DEPLOYMENT.md`

Deploy order:
1. VPC (01-vpc.yml)
2. Aurora (02-aurora-management.yml)
3. MSK (03-msk-kafka.yml)
4. ClickHouse (08-clickhouse-cluster.yml)
5. Data Lake (05-data-lake.yml)
6. Management ECS (06-management-ecs.yml)
7. Data Plane ECS (07-data-plane-ecs.yml)

### For Option 3 (Enterprise)

Contact AWS Solutions Architect for:
- Custom architecture review
- Reserved capacity planning
- Enterprise support onboarding
- Multi-region design

---

## Post-Deployment Operations

### Monitoring Checklist

| Component | Metric | Alert Threshold | Check Frequency |
|-----------|--------|-----------------|-----------------|
| ECS CPU | CPUUtilization | > 80% | 5 min |
| ECS Memory | MemoryUtilization | > 80% | 5 min |
| RDS | DatabaseConnections | > 80% max | 5 min |
| RDS | CPUUtilization | > 80% | 5 min |
| MSK | UnderReplicatedPartitions | > 0 | 1 min |
| MSK | DiskUsage | > 80% | 5 min |
| ClickHouse | cluster_replica_unavailable | = 1 | 1 min |
| ClickHouse | MemoryUsagePercent | > 85% | 5 min |
| ALB | UnHealthyHostCount | > 0 | 1 min |
| S3 | BucketSizeBytes | > 80% limit | Daily |

### Backup Strategy

| Component | Method | Frequency | Retention |
|-----------|--------|-----------|-----------|
| RDS | Automated snapshots | Daily | 35 days |
| RDS | Manual snapshots | Weekly | 90 days |
| S3 | Versioning | Continuous | 7 years |
| ClickHouse | Manual snapshots | Daily | 30 days |
| EFS | AWS Backup | Daily | 30 days |

---

## Cost Optimization Strategies

### Universal Strategies (All Options)

1. **Use Fargate Spot**: 60-70% compute savings
2. **S3 Intelligent-Tiering**: Automatic storage class optimization
3. **Reserved Capacity**: 1-3 year commitments for 30-50% savings
4. **VPC Endpoints**: Reduce NAT Gateway data processing charges
5. **Right-sizing**: Regular review with AWS Compute Optimizer

### Option-Specific Strategies

#### Option 1 (Starter)
- Use Single-AZ RDS (saves ₹9K/month)
- Single NAT Gateway (saves ₹3K/month)
- 7-day log retention (reduce CloudWatch costs)
- No MSK (use self-hosted Kafka on ECS)

#### Option 2 (Balanced)
- Fargate Spot 4:1 ratio
- Aurora Serverless (scale to zero when possible)
- S3 lifecycle policies for data tiering
- 1-year reserved for MSK/ClickHouse

#### Option 3 (Enterprise)
- 3-year Savings Plans for Fargate
- 3-year reserved capacity for databases
- Cross-region data transfer optimization
- AWS Enterprise Discount Program (EDP)

---

## Summary & Recommendations

### Our Recommendation

**For most CyInsight deployments in India, we recommend Option 2 (Balanced Production)** with these considerations:

1. **Start with Option 1** if:
   - Pre-revenue or MVP stage
   - < 5 confirmed tenants
   - Budget constrained
   - Validating product-market fit

2. **Go directly to Option 2** if:
   - 5+ paying tenants committed
   - Need enterprise readiness demonstration
   - ₹1-2L/month budget approved
   - Have basic DevOps capability

3. **Consider Option 3** only if:
   - Established MSSP with 50+ tenants
   - Enterprise clients requiring multi-region
   - Dedicated DevOps team (3+ people)
   - Compliance mandates (SOC2, ISO 27001)

### Hybrid Approach (Recommended for Growth)

Start with **Option 2 architecture** but with **Option 1 sizing**:

```yaml
Month 1-3 (Ramp-up):
  aurora: 1-4 ACU (vs 1-16)
  ecs_mgmt: 2 tasks (vs 2-6)
  ecs_receiver: 2 tasks (vs 2-10)
  ecs_data: 2 tasks (vs 2-8)
  msk: 3 × kafka.m5.large (vs m5.xlarge)
  clickhouse: 2 × r6g.large (vs r6g.xlarge)
  Cost: ₹80,000-1,00,000/month

Month 4+ (Scale as needed):
  Auto-scale based on metrics
  Full capacity: ₹1,50,000-2,00,000/month
```

This gives you the **architecture of Option 2** with the **cost profile of Option 1**, enabling seamless scaling without re-architecture.

---

## Next Steps

1. **Review this guide** with your team
2. **Select your deployment option** based on the decision framework
3. **Set up AWS account** and configure CLI
4. **Execute deployment** using the provided scripts
5. **Configure monitoring** and alerting
6. **Plan for growth** and future upgrades

For support during deployment, refer to:
- `/deploy/aws/single-stack/README.md` (Option 1)
- `/deploy/docs/MULTI-REGION-HA-DEPLOYMENT.md` (Option 2/3)
- AWS Documentation for specific services
