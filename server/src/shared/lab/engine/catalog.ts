// The shared component catalog for the lab platform.
//
// Every block a lab can use is described once here: its family (which course it
// belongs to), its role (what it does in a request path), its configurable
// properties (with range, default, unit and the panel group they show in), and
// the size catalogs its size pickers draw from. The board, the scoring model and
// the authoring validator all read this file. Links are allowed by role, so a new
// family (Kubernetes, Docker, Linux) is mostly new entries here, not new code.
//
// Prices and capacities are illustrative and dated (one region, on-demand, late
// 2026). Use them to compare the shapes of designs, not to quote a real bill.

export type Family = "hld" | "aws" | "k8s" | "docker" | "linux";
export const FAMILIES: readonly Family[] = ["hld", "aws", "k8s", "docker", "linux"];

export type Role =
  | "client"
  | "dns"
  | "cdn"
  | "firewall"
  | "limiter"
  | "balancer"
  | "gateway"
  | "compute"
  | "function"
  | "worker"
  | "cache"
  | "database"
  | "nosql"
  | "search"
  | "queue"
  | "stream"
  | "storage";

export type ComponentKind =
  // Generic building blocks for the high-level design course
  | "client"
  | "dns"
  | "cdn"
  | "waf"
  | "rate-limiter"
  | "load-balancer"
  | "api-gateway"
  | "app-server"
  | "worker"
  | "cache"
  | "database"
  | "nosql"
  | "search"
  | "queue"
  | "stream"
  | "object-storage"
  // AWS services for the AWS course
  | "aws-route53"
  | "aws-cloudfront"
  | "aws-waf"
  | "aws-alb"
  | "aws-nlb"
  | "aws-api-gateway"
  | "aws-ec2-asg"
  | "aws-fargate"
  | "aws-lambda"
  | "aws-elasticache"
  | "aws-rds"
  | "aws-dynamodb"
  | "aws-opensearch"
  | "aws-sqs"
  | "aws-kinesis"
  | "aws-s3"
  // Kubernetes objects for the Kubernetes course
  | "k8s-ingress"
  | "k8s-service"
  | "k8s-deployment"
  | "k8s-statefulset"
  // Containers for the Docker course
  | "docker-proxy"
  | "docker-container"
  | "docker-postgres"
  // One host's services for the Linux course
  | "linux-nginx"
  | "linux-service"
  | "linux-postgres";

export type PortDir = "in" | "out";

export interface PortDef {
  id: string;
  dir: PortDir;
  accepts: ComponentKind[];
}

export type SizeSet = "generic" | "ec2" | "fargate" | "rds" | "elasticache" | "opensearch" | "pod" | "container" | "host";
export type PropertyGroup = "Capacity" | "Scaling" | "Resilience" | "Behaviour";

export interface PropertyDef {
  id: string;
  label: string;
  type: "size" | "count" | "ratio" | "enum" | "toggle";
  min?: number;
  max?: number;
  step?: number;
  default: number | string;
  unit: string;
  options?: string[];
  /** Which size catalog a size picker draws from. */
  sizeSet?: SizeSet;
  group?: PropertyGroup;
  /** One line shown as a tooltip in the config panel. */
  help?: string;
}

/** A managed, elastic service: priced per hour plus per million requests. */
export interface ManagedPricing {
  capacity: number;
  pricePerHour: number;
  pricePerMillion: number;
}

export interface ComponentDef {
  kind: ComponentKind;
  label: string;
  family: Family;
  role: Role;
  /** The product or engine name shown under the label. */
  vendor: string;
  icon: string;
  ports: PortDef[];
  properties: PropertyDef[];
  managed?: ManagedPricing;
}

export interface SizeTier {
  id: string;
  set: SizeSet;
  family: "general" | "compute" | "memory";
  vcpu: number;
  memoryGb: number;
  capacityRule: string;
  pricePerHour: number;
}

// Which role may send requests to which. Links follow the request, not the data.
const ROLE_NEXT: Record<Role, Role[]> = {
  client: ["dns", "cdn", "firewall", "limiter", "balancer", "gateway"],
  dns: [],
  cdn: ["firewall", "limiter", "balancer", "gateway", "compute", "storage"],
  firewall: ["cdn", "limiter", "balancer", "gateway", "compute"],
  limiter: ["balancer", "gateway", "compute", "function"],
  balancer: ["balancer", "compute", "function"],
  gateway: ["balancer", "compute", "function", "queue", "stream", "nosql", "storage"],
  compute: ["function", "cache", "database", "nosql", "search", "queue", "stream", "storage"],
  function: ["cache", "database", "nosql", "search", "queue", "stream", "storage"],
  worker: ["cache", "database", "nosql", "search", "queue", "storage"],
  queue: ["worker", "function"],
  stream: ["worker", "function"],
  // A cache may load from a database on a miss (read-through). Linking it is optional:
  // an app server linked to both a cache and a database is cache-aside, with the same maths.
  cache: ["database", "nosql"],
  database: [],
  nosql: [],
  search: [],
  storage: [],
};

// ---- property builders ---------------------------------------------------

const size = (sizeSet: SizeSet, defaultId: string): PropertyDef => ({
  id: "size",
  label: "Machine size",
  type: "size",
  sizeSet,
  default: defaultId,
  unit: "tier",
  group: "Capacity",
});
const count = (id: string, label: string, unit: string, def: number, min: number, max: number, group: PropertyGroup = "Capacity", help?: string): PropertyDef => ({
  id, label, type: "count", min, max, step: 1, default: def, unit, group, help,
});
const ratio = (id: string, label: string, def: number, group: PropertyGroup = "Behaviour", help?: string): PropertyDef => ({
  id, label, type: "ratio", min: 0, max: 1, step: 0.05, default: def, unit: "fraction", group, help,
});
const toggle = (id: string, label: string, def: 0 | 1, group: PropertyGroup, help?: string): PropertyDef => ({
  id, label, type: "toggle", default: def, unit: "on/off", group, help,
});
const choice = (id: string, label: string, options: string[], def: string, group: PropertyGroup = "Behaviour", help?: string): PropertyDef => ({
  id, label, type: "enum", options, default: def, unit: "option", group, help,
});
const azs = (def: number, min = 1): PropertyDef =>
  count("azs", "Zones (separate data centres)", "zones", def, min, 3, "Resilience", "Spreading across zones means one zone going down does not stop the service.");
const scaling = (on: 0 | 1, min: number, max: number, target: number): PropertyDef[] => [
  toggle("autoscale", "Add machines automatically (autoscaling)", on, "Scaling", "Adds or removes machines to stay near the target busyness."),
  count("minCount", "Fewest machines", "machines", min, 1, 100, "Scaling"),
  count("maxCount", "Most machines", "machines", max, 1, 200, "Scaling"),
  ratio("targetUtil", "Aim to stay this busy (target utilisation)", target, "Scaling", "Add machines before this level. Waiting time starts to climb near 70% busy."),
];

// ---- the catalog -----------------------------------------------------------

type Entry = Omit<ComponentDef, "kind" | "ports">;

const ENTRIES: Record<ComponentKind, Entry> = {
  // Generic high-level design blocks
  client: { label: "Client", family: "hld", role: "client", vendor: "Users", icon: "client",
    properties: [count("load", "Traffic sent (offered load)", "req/s", 1000, 1, 10_000_000)] },
  dns: { label: "DNS", family: "hld", role: "dns", vendor: "Resolver", icon: "dns",
    managed: { capacity: 1_000_000, pricePerHour: 0.001, pricePerMillion: 0 },
    properties: [count("ttl", "Record TTL", "seconds", 300, 1, 86_400, "Behaviour")] },
  cdn: { label: "CDN", family: "hld", role: "cdn", vendor: "Edge cache", icon: "cdn",
    managed: { capacity: 1_000_000, pricePerHour: 0.02, pricePerMillion: 0.75 },
    properties: [ratio("hitRate", "Answered nearby (edge hit rate)", 0.8, "Behaviour", "A hit is answered close to the user. Only misses reach your servers.")] },
  waf: { label: "Firewall", family: "hld", role: "firewall", vendor: "WAF", icon: "firewall",
    managed: { capacity: 1_000_000, pricePerHour: 0.007, pricePerMillion: 0.6 },
    properties: [ratio("blockRate", "Blocked share", 0.02, "Behaviour", "Share of traffic dropped as malicious.")] },
  "rate-limiter": { label: "Rate limiter", family: "hld", role: "limiter", vendor: "Token bucket", icon: "limiter",
    managed: { capacity: 1_000_000, pricePerHour: 0.01, pricePerMillion: 0 },
    properties: [count("limit", "Limit", "req/s", 5000, 10, 1_000_000, "Behaviour", "Requests above this are rejected, protecting what sits behind it.")] },
  "load-balancer": { label: "Load balancer", family: "hld", role: "balancer", vendor: "L7 LB", icon: "balancer",
    properties: [size("generic", "general-small"), count("zones", "Zones (separate data centres)", "zones", 1, 1, 3, "Resilience")] },
  "api-gateway": { label: "API gateway", family: "hld", role: "gateway", vendor: "Gateway", icon: "gateway",
    properties: [size("generic", "general-small"), count("count", "Machines (instances)", "machines", 2, 1, 50)] },
  "app-server": { label: "App server", family: "hld", role: "compute", vendor: "Compute", icon: "compute",
    properties: [size("generic", "compute-small"), count("count", "Machines (instances)", "machines", 2, 1, 50), ...scaling(0, 2, 10, 0.6), azs(1)] },
  worker: { label: "Worker", family: "hld", role: "worker", vendor: "Consumer", icon: "worker",
    properties: [size("generic", "compute-small"), count("count", "Workers", "workers", 2, 1, 100), count("batchSize", "Items saved per trip (batch size)", "events", 1, 1, 1000, "Behaviour", "How many items (clicks, posts, events) go to the store in one trip. Saving many at once turns thousands of writes a second into a few."), ...scaling(0, 1, 20, 0.7)] },
  cache: { label: "Cache", family: "hld", role: "cache", vendor: "Redis", icon: "cache",
    properties: [size("generic", "memory-small"), count("count", "Machines (nodes)", "nodes", 1, 1, 20), ratio("hitRate", "Answered by the cache (hit rate)", 0.85, "Behaviour", "A hit means the database is never asked. A miss goes on to the database."), azs(1)] },
  database: { label: "Database", family: "hld", role: "database", vendor: "PostgreSQL", icon: "database",
    properties: [
      size("generic", "memory-medium"),
      count("replicas", "Read-only copies (read replicas)", "copies", 0, 0, 5, "Capacity", "Extra copies that share the reads. Every write still goes to the main copy (the primary)."),
      ratio("readRatio", "Share that only reads", 0.8, "Behaviour", "Reads look data up. Writes change it."),
      toggle("multiAz", "Extra copy that takes over (failover standby)", 0, "Resilience", "A standby copy in a second zone takes over if the main copy's zone fails. It doubles the main copy's cost."),
    ] },
  nosql: { label: "NoSQL store", family: "hld", role: "nosql", vendor: "Key-value", icon: "nosql",
    properties: [size("generic", "memory-medium"), count("count", "Machines (nodes)", "nodes", 3, 1, 30), azs(1)] },
  search: { label: "Search", family: "hld", role: "search", vendor: "Index", icon: "search",
    properties: [size("generic", "memory-medium"), count("count", "Machines (nodes)", "nodes", 2, 1, 20), azs(1)] },
  queue: { label: "Queue", family: "hld", role: "queue", vendor: "Broker", icon: "queue",
    managed: { capacity: 100_000, pricePerHour: 0.01, pricePerMillion: 0.04 },
    properties: [count("maxInFlight", "Most messages handled at once (max in flight)", "messages", 1000, 1, 1_000_000, "Behaviour")] },
  stream: { label: "Event stream", family: "hld", role: "stream", vendor: "Kafka", icon: "stream",
    properties: [count("partitions", "Lanes (partitions)", "lanes", 4, 1, 256, "Capacity", "Each lane takes about 1,000 events a second."), count("retentionHours", "Keep events for (retention)", "hours", 24, 1, 8760, "Behaviour")] },
  "object-storage": { label: "Object storage", family: "hld", role: "storage", vendor: "Blob store", icon: "storage",
    managed: { capacity: 1_000_000, pricePerHour: 0.01, pricePerMillion: 0.4 },
    properties: [count("capacityGb", "Capacity", "GB", 100, 1, 1_000_000)] },

  // AWS services
  "aws-route53": { label: "Route 53", family: "aws", role: "dns", vendor: "AWS DNS", icon: "dns",
    managed: { capacity: 1_000_000, pricePerHour: 0.0007, pricePerMillion: 0 },
    properties: [choice("routing", "Routing policy", ["simple", "latency", "failover", "weighted"], "simple")] },
  "aws-cloudfront": { label: "CloudFront", family: "aws", role: "cdn", vendor: "AWS CDN", icon: "cdn",
    managed: { capacity: 1_000_000, pricePerHour: 0, pricePerMillion: 0.75 },
    properties: [ratio("hitRate", "Cache hit rate", 0.85), choice("priceClass", "Price class", ["100", "200", "All"], "100")] },
  "aws-waf": { label: "AWS WAF", family: "aws", role: "firewall", vendor: "Web ACL", icon: "firewall",
    managed: { capacity: 1_000_000, pricePerHour: 0.007, pricePerMillion: 0.6 },
    properties: [ratio("blockRate", "Blocked share", 0.02), count("rules", "Rules", "rules", 10, 1, 100, "Behaviour")] },
  "aws-alb": { label: "ALB", family: "aws", role: "balancer", vendor: "Application LB", icon: "balancer",
    managed: { capacity: 100_000, pricePerHour: 0.0225, pricePerMillion: 0.2 },
    properties: [azs(2, 2), toggle("crossZone", "Cross-zone balancing", 1, "Resilience")] },
  "aws-nlb": { label: "NLB", family: "aws", role: "balancer", vendor: "Network LB", icon: "balancer",
    managed: { capacity: 200_000, pricePerHour: 0.0225, pricePerMillion: 0.1 },
    properties: [azs(2, 1)] },
  "aws-api-gateway": { label: "API Gateway", family: "aws", role: "gateway", vendor: "AWS API Gateway", icon: "gateway",
    managed: { capacity: 1_000_000, pricePerHour: 0, pricePerMillion: 1 },
    properties: [
      choice("apiType", "API type", ["HTTP", "REST"], "HTTP", "Behaviour", "REST APIs cost about 3.5 times more per request."),
      count("limit", "Throttle", "req/s", 10_000, 10, 100_000, "Behaviour", "Account throttle; requests above it get 429 errors."),
    ] },
  "aws-ec2-asg": { label: "EC2 Auto Scaling", family: "aws", role: "compute", vendor: "EC2", icon: "compute",
    properties: [size("ec2", "m5.large"), count("count", "Desired instances", "instances", 2, 1, 200), ...scaling(1, 2, 10, 0.5), azs(2)] },
  "aws-fargate": { label: "ECS Fargate", family: "aws", role: "compute", vendor: "Containers", icon: "compute",
    properties: [size("fargate", "1 vCPU / 2 GB"), count("count", "Tasks", "tasks", 2, 1, 500), ...scaling(1, 2, 20, 0.6), azs(2)] },
  "aws-lambda": { label: "Lambda", family: "aws", role: "function", vendor: "Serverless", icon: "function",
    properties: [
      choice("memoryMb", "Memory", ["128", "256", "512", "1024", "2048"], "512", "Capacity", "More memory also means more CPU and a higher GB-second price."),
      count("durationMs", "Duration", "ms", 120, 1, 900_000, "Behaviour"),
      count("concurrency", "Reserved concurrency", "executions", 1000, 1, 10_000, "Capacity", "Concurrency divided by duration is the most it can serve; beyond that it throttles."),
    ] },
  "aws-elasticache": { label: "ElastiCache", family: "aws", role: "cache", vendor: "Redis", icon: "cache",
    properties: [size("elasticache", "cache.r6g.large"), count("count", "Shards", "shards", 1, 1, 50), count("replicasPerShard", "Replicas per shard", "replicas", 1, 0, 5, "Resilience"), ratio("hitRate", "Hit rate", 0.85), azs(2)] },
  "aws-rds": { label: "RDS", family: "aws", role: "database", vendor: "Managed SQL", icon: "database",
    properties: [
      choice("engine", "Engine", ["PostgreSQL", "MySQL"], "PostgreSQL", "Behaviour"),
      size("rds", "db.r5.large"),
      count("replicas", "Read replicas", "replicas", 1, 0, 15, "Capacity", "Replicas share the reads; every write still goes to the primary."),
      ratio("readRatio", "Read share", 0.8),
      toggle("multiAz", "Multi-AZ", 1, "Resilience", "A synchronous standby in another zone. Doubles the primary cost."),
    ] },
  "aws-dynamodb": { label: "DynamoDB", family: "aws", role: "nosql", vendor: "Key-value", icon: "nosql",
    managed: { capacity: 40_000, pricePerHour: 0, pricePerMillion: 0 },
    properties: [
      choice("capacityMode", "Capacity mode", ["on-demand", "provisioned"], "on-demand", "Capacity", "On-demand bills per request; provisioned bills per hour for the units you reserve."),
      count("rcu", "Read units", "RCU", 1000, 1, 100_000, "Capacity"),
      count("wcu", "Write units", "WCU", 500, 1, 100_000, "Capacity"),
      ratio("readRatio", "Read share", 0.8),
    ] },
  "aws-opensearch": { label: "OpenSearch", family: "aws", role: "search", vendor: "Search", icon: "search",
    properties: [size("opensearch", "m5.large.search"), count("count", "Data nodes", "nodes", 2, 1, 40), azs(2)] },
  "aws-sqs": { label: "SQS", family: "aws", role: "queue", vendor: "AWS queue", icon: "queue",
    managed: { capacity: 1_000_000, pricePerHour: 0, pricePerMillion: 0.4 },
    properties: [choice("queueType", "Queue type", ["standard", "FIFO"], "standard", "Behaviour", "FIFO keeps order but tops out near 3,000 messages/s with batching.")] },
  "aws-kinesis": { label: "Kinesis", family: "aws", role: "stream", vendor: "Data Streams", icon: "stream",
    properties: [count("partitions", "Shards", "shards", 2, 1, 500, "Capacity", "Each shard takes about 1,000 records/s."), count("retentionHours", "Retention", "hours", 24, 24, 8760, "Behaviour")] },
  "aws-s3": { label: "S3", family: "aws", role: "storage", vendor: "Object storage", icon: "storage",
    managed: { capacity: 1_000_000, pricePerHour: 0, pricePerMillion: 0.4 },
    properties: [choice("storageClass", "Storage class", ["Standard", "Intelligent-Tiering", "Glacier IR"], "Standard")] },

  // Kubernetes
  "k8s-ingress": { label: "Ingress", family: "k8s", role: "balancer", vendor: "ingress-nginx", icon: "balancer",
    properties: [size("pod", "500m / 512Mi"), count("count", "Controller replicas", "pods", 2, 1, 20), azs(1)] },
  "k8s-service": { label: "Service", family: "k8s", role: "balancer", vendor: "ClusterIP", icon: "balancer",
    managed: { capacity: 1_000_000, pricePerHour: 0, pricePerMillion: 0 },
    properties: [choice("serviceType", "Type", ["ClusterIP", "NodePort", "LoadBalancer"], "ClusterIP", "Behaviour", "A LoadBalancer Service also rents a cloud load balancer.")] },
  "k8s-deployment": { label: "Deployment", family: "k8s", role: "compute", vendor: "Pods", icon: "compute",
    properties: [size("pod", "500m / 512Mi"), count("count", "Replicas", "pods", 2, 1, 200), ...scaling(1, 2, 10, 0.6), azs(1)] },
  "k8s-statefulset": { label: "StatefulSet", family: "k8s", role: "database", vendor: "PostgreSQL", icon: "database",
    properties: [size("pod", "2 CPU / 4Gi"), count("replicas", "Read replicas", "pods", 0, 0, 5), ratio("readRatio", "Read share", 0.8)] },

  // Docker
  "docker-proxy": { label: "Reverse proxy", family: "docker", role: "balancer", vendor: "Traefik", icon: "balancer",
    properties: [size("container", "1 CPU / 1GB"), count("count", "Containers", "containers", 1, 1, 10)] },
  "docker-container": { label: "App container", family: "docker", role: "compute", vendor: "Container", icon: "compute",
    properties: [size("container", "1 CPU / 1GB"), count("count", "Replicas", "containers", 1, 1, 20)] },
  "docker-postgres": { label: "Postgres", family: "docker", role: "database", vendor: "postgres:16", icon: "database",
    properties: [size("container", "2 CPU / 2GB"), count("replicas", "Read replicas", "containers", 0, 0, 3), ratio("readRatio", "Read share", 0.8)] },

  // Linux, one host
  "linux-nginx": { label: "nginx", family: "linux", role: "balancer", vendor: "Reverse proxy", icon: "balancer",
    properties: [size("host", "2 cores / 4GB")] },
  "linux-service": { label: "App service", family: "linux", role: "compute", vendor: "systemd", icon: "compute",
    properties: [size("host", "2 cores / 4GB"), count("count", "Hosts", "hosts", 1, 1, 10)] },
  "linux-postgres": { label: "PostgreSQL", family: "linux", role: "database", vendor: "postgresql.service", icon: "database",
    properties: [size("host", "4 cores / 8GB"), count("replicas", "Read replicas", "hosts", 0, 0, 3), ratio("readRatio", "Read share", 0.8)] },
};

const COMPONENT_KINDS = Object.keys(ENTRIES) as ComponentKind[];
const KIND_SET = new Set<string>(COMPONENT_KINDS);

export function isComponentKind(value: string): value is ComponentKind {
  return KIND_SET.has(value);
}

export function roleOf(kind: ComponentKind): Role {
  return ENTRIES[kind].role;
}

function portsFor(kind: ComponentKind): PortDef[] {
  const role = ENTRIES[kind].role;
  const inbound = COMPONENT_KINDS.filter((k) => ROLE_NEXT[ENTRIES[k].role].includes(role));
  const outbound = COMPONENT_KINDS.filter((k) => ROLE_NEXT[role].includes(ENTRIES[k].role));
  const ports: PortDef[] = [];
  if (inbound.length > 0) ports.push({ id: "in", dir: "in", accepts: inbound });
  if (outbound.length > 0) ports.push({ id: "out", dir: "out", accepts: outbound });
  return ports;
}

export const COMPONENT_CATALOG: Record<ComponentKind, ComponentDef> = Object.fromEntries(
  COMPONENT_KINDS.map((kind) => [kind, { kind, ...ENTRIES[kind], ports: portsFor(kind) }]),
) as Record<ComponentKind, ComponentDef>;

export function canConnect(from: ComponentKind, to: ComponentKind): boolean {
  return ROLE_NEXT[ENTRIES[from].role].includes(ENTRIES[to].role);
}

export function kindsInFamily(family: Family): ComponentKind[] {
  return COMPONENT_KINDS.filter((k) => ENTRIES[k].family === family);
}

// ---- size catalogs -----------------------------------------------------------

const GENERIC_RULE = { general: "~800 req/s per vCPU at a light mix", compute: "~1,200 req/s per vCPU at a CPU-bound mix", memory: "~600 req/s per vCPU; holds a large working set" };
const tier = (set: SizeSet, id: string, family: SizeTier["family"], vcpu: number, memoryGb: number, pricePerHour: number, capacityRule = GENERIC_RULE[family]): SizeTier => ({
  id, set, family, vcpu, memoryGb, capacityRule, pricePerHour,
});

export const SIZE_CATALOG: SizeTier[] = [
  tier("generic", "general-small", "general", 2, 8, 0.1),
  tier("generic", "general-medium", "general", 4, 16, 0.2),
  tier("generic", "general-large", "general", 8, 32, 0.4),
  tier("generic", "general-xlarge", "general", 16, 64, 0.8),
  tier("generic", "compute-small", "compute", 2, 4, 0.12),
  tier("generic", "compute-medium", "compute", 4, 8, 0.24),
  tier("generic", "compute-large", "compute", 8, 16, 0.48),
  tier("generic", "compute-xlarge", "compute", 16, 32, 0.96),
  tier("generic", "memory-small", "memory", 2, 16, 0.15),
  tier("generic", "memory-medium", "memory", 4, 32, 0.3),
  tier("generic", "memory-large", "memory", 8, 64, 0.6),
  tier("generic", "memory-xlarge", "memory", 16, 128, 1.2),

  tier("ec2", "t3.medium", "general", 2, 4, 0.0416, "burstable; ~800 req/s per vCPU while it has credits"),
  tier("ec2", "m5.large", "general", 2, 8, 0.096),
  tier("ec2", "m5.xlarge", "general", 4, 16, 0.192),
  tier("ec2", "c5.large", "compute", 2, 4, 0.085),
  tier("ec2", "c5.xlarge", "compute", 4, 8, 0.17),
  tier("ec2", "c5.2xlarge", "compute", 8, 16, 0.34),
  tier("ec2", "r5.large", "memory", 2, 16, 0.126),

  tier("fargate", "0.25 vCPU / 0.5 GB", "general", 0.25, 0.5, 0.0123),
  tier("fargate", "0.5 vCPU / 1 GB", "general", 0.5, 1, 0.0247),
  tier("fargate", "1 vCPU / 2 GB", "general", 1, 2, 0.0494),
  tier("fargate", "2 vCPU / 4 GB", "general", 2, 4, 0.0988),
  tier("fargate", "4 vCPU / 8 GB", "general", 4, 8, 0.1975),

  tier("rds", "db.t3.medium", "memory", 2, 4, 0.068),
  tier("rds", "db.m5.large", "memory", 2, 8, 0.171),
  tier("rds", "db.r5.large", "memory", 2, 16, 0.24),
  tier("rds", "db.r5.xlarge", "memory", 4, 32, 0.48),
  tier("rds", "db.r5.2xlarge", "memory", 8, 64, 0.96),

  tier("elasticache", "cache.t3.small", "memory", 2, 1.37, 0.034, "~15,000 ops/s per vCPU"),
  tier("elasticache", "cache.m5.large", "memory", 2, 6.38, 0.156, "~15,000 ops/s per vCPU"),
  tier("elasticache", "cache.r6g.large", "memory", 2, 13.07, 0.206, "~15,000 ops/s per vCPU"),
  tier("elasticache", "cache.r6g.xlarge", "memory", 4, 26.32, 0.411, "~15,000 ops/s per vCPU"),

  tier("opensearch", "t3.medium.search", "memory", 2, 4, 0.073, "~300 queries/s per vCPU"),
  tier("opensearch", "m5.large.search", "memory", 2, 8, 0.142, "~300 queries/s per vCPU"),
  tier("opensearch", "r5.large.search", "memory", 2, 16, 0.186, "~300 queries/s per vCPU"),

  tier("pod", "250m / 256Mi", "general", 0.25, 0.25, 0.01, "CPU request; ~800 req/s per full core"),
  tier("pod", "500m / 512Mi", "general", 0.5, 0.5, 0.02, "CPU request; ~800 req/s per full core"),
  tier("pod", "1 CPU / 1Gi", "general", 1, 1, 0.04, "CPU request; ~800 req/s per full core"),
  tier("pod", "2 CPU / 4Gi", "general", 2, 4, 0.09, "CPU request; ~800 req/s per full core"),

  tier("container", "0.5 CPU / 512MB", "general", 0.5, 0.5, 0.02, "--cpus limit; ~800 req/s per full core"),
  tier("container", "1 CPU / 1GB", "general", 1, 1, 0.04, "--cpus limit; ~800 req/s per full core"),
  tier("container", "2 CPU / 2GB", "general", 2, 2, 0.08, "--cpus limit; ~800 req/s per full core"),

  tier("host", "1 core / 2GB", "general", 1, 2, 0.02, "~800 req/s per core"),
  tier("host", "2 cores / 4GB", "general", 2, 4, 0.04, "~800 req/s per core"),
  tier("host", "4 cores / 8GB", "general", 4, 8, 0.08, "~800 req/s per core"),
  tier("host", "8 cores / 16GB", "general", 8, 16, 0.16, "~800 req/s per core"),
];

export function sizesFor(set: SizeSet): SizeTier[] {
  return SIZE_CATALOG.filter((t) => t.set === set);
}
