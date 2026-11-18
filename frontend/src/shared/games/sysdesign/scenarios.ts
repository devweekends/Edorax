// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// The pool of production incidents. Every round is plain data: a system, 24 hours of traffic, the
// goals, and a catalog of changes (each one a patch on the model). All prices are round, illustrative
// numbers made up for the game. They are not AWS quotes.
import type { Difficulty } from "../types";
import { STEPS, type ChangeDef, type DeepPartial, type Model, type SysdesignRound } from "./types";

/** A model with sensible defaults. A scenario overrides only what it needs. */
function model(over: DeepPartial<Model> = {}): Model {
  const base: Model = {
    app: { label: "m5.large", count: 4, rpsEach: 100, monthlyEach: 70, baseMs: 20, zones: 1, healthChecks: false, autoscale: false, scaleMin: 2, scaleMax: 8, pricing: "ondemand" },
    db: { kind: "rds", label: "db.m5.large", capacity: 400, monthly: 140, replicas: 0, replicaMonthly: 140, multiAz: false, pricing: "ondemand", readMs: 12, writeMs: 20, readCost: 1, skew: 1 },
    cache: { on: false, hit: 0.85, monthly: 90 },
    cdn: { on: false, offload: 0.9, monthly: 40 },
    queue: { on: false, monthly: 10 },
    batch: { separate: false, workersMonthly: 60 },
    net: { egressGb: 500, natGb: 500, s3Share: 0.7, s3Endpoint: false, natGateways: 1 },
    logs: { gb: 200, hotRate: 0.023, coldRate: 0.004, coldShare: 0 },
  };
  return {
    app: { ...base.app, ...over.app },
    db: { ...base.db, ...over.db },
    cache: { ...base.cache, ...over.cache },
    cdn: { ...base.cdn, ...over.cdn },
    queue: { ...base.queue, ...over.queue },
    batch: { ...base.batch, ...over.batch },
    net: { ...base.net, ...over.net },
    logs: { ...base.logs, ...over.logs },
  };
}

/** Traffic for 24 hours, by straight lines between [hour, requests per second] points. */
function shape(points: Array<[number, number]>): number[] {
  const out: number[] = [];
  for (let t = 0; t < STEPS; t++) {
    let value = points[points.length - 1]![1];
    for (let i = 0; i < points.length - 1; i++) {
      const [t0, v0] = points[i]!;
      const [t1, v1] = points[i + 1]!;
      if (t >= t0 && t <= t1) {
        value = t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
        break;
      }
    }
    out.push(Math.round(value));
  }
  return out;
}

/** A normal day: quiet at night, busy in the afternoon. */
const day = (low: number, high: number) => shape([[0, low], [6, low], [11, high], [17, high], [23, low]]);

type Scenario = SysdesignRound;

const POOL: Scenario[] = [
  // ───────────────────────────── EASY ─────────────────────────────
  {
    id: "sd-bill-tripled",
    difficulty: "easy",
    title: "The bill tripled",
    brief: "Finance says the AWS bill is three times higher than last quarter. Traffic did not grow. Cut the bill and keep the site fast.",
    incident: "COST ALERT: monthly spend is 3x the budget. Servers and database run at under 10% busy.",
    model: model({
      app: { label: "m5.2xlarge", count: 6, rpsEach: 400, monthlyEach: 280 },
      db: { label: "db.r5.2xlarge", capacity: 2400, monthly: 700 },
      net: { egressGb: 1500, natGb: 400 },
    }),
    traffic: day(25, 90),
    mix: { staticShare: 0.3, readShare: 0.8 },
    goals: { maxP95Ms: 250, minAvailability: 99.5, maxCostUsd: 700 },
    stretch: { maxCostUsd: 520 },
    changes: [
      { id: "rightsize-app", label: "Right-size servers to 3x m5.large", description: "The fleet is much bigger than the traffic needs. Three m5.large servers still handle the peak with room to spare.", patch: { app: { label: "m5.large", count: 3, rpsEach: 100, monthlyEach: 70 } } },
      { id: "rightsize-db", label: "Right-size the database to db.m5.large", description: "A db.r5.2xlarge is built for memory-heavy work. This database is almost idle, so a db.m5.large is enough.", patch: { db: { label: "db.m5.large", capacity: 600, monthly: 140 } } },
      { id: "savings-plan", label: "Buy a 1-year Compute Savings Plan", description: "Commit to steady EC2 use for one year and pay about 30% less per server than on-demand.", patch: { app: { pricing: "savings" } } },
      { id: "reserved-rds", label: "Buy a 1-year RDS Reserved Instance", description: "Commit to one database size for one year and pay about 38% less than on-demand.", patch: { db: { pricing: "reserved" } } },
      { id: "bigger-4xl", label: "Move up to m5.4xlarge for headroom", description: "Bigger servers feel safe, but they cost twice as much per server.", patch: { app: { label: "m5.4xlarge", rpsEach: 800, monthlyEach: 560 } } },
      { id: "add-replica", label: "Add a read replica for safety", description: "A second copy of the database for reads. It costs as much as the database itself.", patch: { db: { replicas: 1, replicaMonthly: 700 } } },
    ],
    maxChanges: 3,
    solution: ["rightsize-app", "rightsize-db", "savings-plan"],
    trap: "bigger-4xl",
    trapNote: "Bigger servers do not help when the old ones were already idle. They only raise the bill.",
    hints: [
      "Look at the busy bars: the servers and the database are almost idle.",
      "Paying for capacity you do not use is the problem. Make the machines smaller.",
      "Right-size both the servers and the database, then commit to a steady price with a savings plan or a reserved instance.",
    ],
    focus: "app",
  },
  {
    id: "sd-static-flood",
    difficulty: "easy",
    title: "Images are crushing the web servers",
    brief: "The shop is slow all afternoon. Most requests are for images, CSS and JavaScript files that never change.",
    incident: "LATENCY ALERT: p95 is over 1 second. App servers are above 90% busy serving static files.",
    model: model({ app: { count: 4 }, net: { egressGb: 3000 } }),
    traffic: shape([[0, 150], [6, 150], [10, 900], [17, 900], [23, 150]]),
    mix: { staticShare: 0.8, readShare: 0.8 },
    goals: { maxP95Ms: 140, minAvailability: 99.5, maxCostUsd: 720 },
    stretch: { maxCostUsd: 680 },
    changes: [
      { id: "add-cdn", label: "Put CloudFront in front", description: "A CDN keeps copies of static files near the user, so most of them never reach your servers. It also cuts data transfer cost.", patch: { cdn: { on: true } } },
      { id: "more-servers", label: "Add 4 more app servers", description: "More servers share the load. It works, but you pay for them every hour.", patch: { app: { count: 8 } } },
      { id: "bigger-db", label: "Move to a bigger database", description: "A bigger database is stronger, but the database is not the busy part here.", patch: { db: { label: "db.r5.xlarge", capacity: 1200, monthly: 350 } } },
      { id: "add-cache", label: "Add an ElastiCache node", description: "A cache answers repeated database reads fast. Static files do not come from the database.", patch: { cache: { on: true } } },
    ],
    maxChanges: 2,
    solution: ["add-cdn"],
    trap: "bigger-db",
    trapNote: "The database was never the busy part, so a bigger one only costs more.",
    hints: ["Check which bar is red. It is the app servers.", "Most traffic is static files. They can be served from somewhere else.", "Use a CDN (CloudFront) for static files."],
    focus: "app",
  },
  {
    id: "sd-logs-forever",
    difficulty: "easy",
    title: "Logs that never end",
    brief: "Application logs are kept in S3 Standard forever. The storage line grows every month. Nobody reads logs older than a month.",
    incident: "COST ALERT: S3 storage is now the biggest line on the bill and grows 5 TB each month.",
    model: model({ logs: { gb: 60000, coldShare: 0 }, net: { egressGb: 300 } }),
    traffic: day(20, 60),
    mix: { staticShare: 0.3, readShare: 0.8 },
    goals: { maxP95Ms: 250, minAvailability: 99.5, maxCostUsd: 900 },
    stretch: { maxCostUsd: 650 },
    changes: [
      { id: "glacier-lifecycle", label: "Lifecycle rule: move to Glacier after 30 days", description: "S3 moves old logs to Glacier on its own. Glacier costs about a fifth of S3 Standard per GB.", patch: { logs: { coldShare: 0.9 } } },
      { id: "compress-logs", label: "Compress logs with gzip before upload", description: "Text logs shrink to about a third of their size, so you store and pay for less.", patch: { logs: { gb: 20000 } } },
      { id: "ebs-volumes", label: "Keep the logs on bigger EBS volumes", description: "Block storage is for running servers. It costs more per GB than S3.", patch: { logs: { hotRate: 0.08 } } },
      { id: "intelligent-tiering", label: "Turn on S3 Intelligent-Tiering", description: "S3 watches access and moves some data to a cheaper tier. Fine for unknown patterns, but it also adds a monitoring fee per object.", patch: { logs: { coldShare: 0.5, coldRate: 0.0125 } } },
    ],
    maxChanges: 3,
    solution: ["glacier-lifecycle", "compress-logs"],
    trap: "ebs-volumes",
    trapNote: "EBS costs more per GB than S3, so it makes the log bill bigger.",
    hints: ["The big line is log storage, not servers.", "Old logs are almost never read. They do not need the most expensive storage class.", "Move old logs to Glacier with a lifecycle rule, and store fewer bytes by compressing."],
    focus: "storage",
  },
  {
    id: "sd-nat-bill",
    difficulty: "easy",
    title: "The NAT gateway line explodes",
    brief: "Servers in private subnets download big files from S3 through a NAT gateway. NAT charges for every GB that passes through.",
    incident: "COST ALERT: NAT Gateway data processing is the top line on the bill, 30 TB this month.",
    model: model({ net: { natGb: 30000, s3Share: 0.8, egressGb: 7000 } }),
    traffic: day(30, 80),
    mix: { staticShare: 0.4, readShare: 0.8 },
    goals: { maxP95Ms: 250, minAvailability: 99.5, maxCostUsd: 1500 },
    stretch: { maxCostUsd: 1100 },
    changes: [
      { id: "s3-endpoint", label: "Add an S3 gateway VPC endpoint", description: "Traffic to S3 goes over the AWS network directly, not through NAT. A gateway endpoint for S3 has no hourly or per-GB charge.", patch: { net: { s3Endpoint: true } } },
      { id: "add-cdn", label: "Put CloudFront in front of downloads", description: "A CDN serves popular files from the edge. Data transfer out gets cheaper and your servers are asked less often.", patch: { cdn: { on: true } } },
      { id: "second-nat", label: "Add a second NAT gateway per AZ", description: "It is good for availability, but it adds another monthly fee and does not reduce the data that passes through NAT.", patch: { net: { natGateways: 2 } } },
      { id: "bigger-app", label: "Use bigger servers", description: "The servers are fine. The traffic path is the problem.", patch: { app: { label: "m5.xlarge", rpsEach: 200, monthlyEach: 140 } } },
    ],
    maxChanges: 2,
    solution: ["s3-endpoint", "add-cdn"],
    trap: "second-nat",
    trapNote: "A second NAT gateway adds a fixed fee and does not reduce the GB that cross NAT.",
    hints: ["Look at the cost lines: the NAT gateway is the biggest.", "Most of that traffic is only S3 traffic. It does not need to go through NAT at all.", "Add an S3 gateway endpoint. A CDN also cuts the data transfer line."],
    focus: "nat",
  },
  // ───────────────────────────── MEDIUM ─────────────────────────────
  {
    id: "sd-flash-sale-db",
    difficulty: "medium",
    title: "Flash sale crushes the database",
    brief: "A flash sale at noon sends 6 times the normal traffic. The web servers cope, but the single database is melting.",
    incident: "PAGE: database CPU at 100% and checkout errors rising. Flash sale in progress.",
    model: model({ app: { count: 10 }, db: { label: "db.r5.large", capacity: 330, monthly: 300, replicaMonthly: 300 }, net: { egressGb: 400 } }),
    traffic: shape([[0, 100], [9, 100], [11, 120], [12, 700], [15, 700], [16, 120], [23, 100]]),
    mix: { staticShare: 0.1, readShare: 0.7 },
    goals: { maxP95Ms: 250, minAvailability: 99.5, maxCostUsd: 1700, maxPeakDbUtil: 0.9 },
    stretch: { maxCostUsd: 1500 },
    changes: [
      { id: "add-cache", label: "Add ElastiCache (Redis) for hot products", description: "Hot product pages are read again and again. A cache answers them from memory so the database sees fewer reads.", patch: { cache: { on: true, hit: 0.6 } } },
      { id: "add-replica", label: "Add a read replica", description: "A second database copy that answers reads. The primary only handles writes and half of the reads.", patch: { db: { replicas: 1 } } },
      { id: "add-queue", label: "Put orders in an SQS queue", description: "Writes wait in a queue and the database drains them at its own pace. The user gets a fast answer, the database never gets a spike.", patch: { queue: { on: true } } },
      { id: "more-servers", label: "Double the app servers", description: "More web servers, but they were not the busy part. The database is.", patch: { app: { count: 16 } } },
      { id: "bigger-db", label: "Upgrade to db.r5.4xlarge", description: "A much bigger database. It fixes the spike but costs a lot every month, also on quiet days.", patch: { db: { label: "db.r5.4xlarge", capacity: 1320, monthly: 1200 } } },
    ],
    maxChanges: 3,
    solution: ["add-cache", "add-replica"],
    trap: "more-servers",
    trapNote: "The web servers were not the problem. More of them only raises cost and sends even more work to the database.",
    hints: ["Look at the bars during the sale: the database is at 100%, the servers are fine.", "Reads dominate. Take reads away from the primary database.", "Use a cache and a read replica together. A queue can smooth the writes."],
    focus: "db",
  },
  {
    id: "sd-p95-four-seconds",
    difficulty: "medium",
    title: "p95 latency is 4 seconds",
    brief: "Every page request hits the database, and static files come from the same servers. Pages feel slow all afternoon.",
    incident: "LATENCY ALERT: p95 is 4 s. Database and app servers are both near 100% busy.",
    model: model({ app: { count: 3 }, db: { capacity: 200 }, net: { egressGb: 1500 } }),
    traffic: shape([[0, 80], [7, 80], [10, 420], [18, 420], [23, 80]]),
    mix: { staticShare: 0.5, readShare: 0.9 },
    goals: { maxP95Ms: 200, minAvailability: 99.5, maxCostUsd: 650 },
    stretch: { maxCostUsd: 620, maxP95Ms: 130 },
    changes: [
      { id: "add-cache", label: "Add ElastiCache for repeated reads", description: "Most pages ask the database the same questions. A cache returns the answer in about 2 ms.", patch: { cache: { on: true, hit: 0.85 } } },
      { id: "add-cdn", label: "Put CloudFront in front for static files", description: "Images and scripts come from the edge, so the web servers only do dynamic work.", patch: { cdn: { on: true } } },
      { id: "add-replica", label: "Add a read replica", description: "A replica doubles read capacity, but every read is still a database read, and you pay for a second database.", patch: { db: { replicas: 1 } } },
      { id: "more-servers", label: "Add 3 more app servers", description: "More servers handle more requests, but they all still wait for the same database.", patch: { app: { count: 6 } } },
      { id: "bigger-db", label: "Use a bigger database", description: "More database power. Pricey, and static files still hit the servers.", patch: { db: { label: "db.r5.xlarge", capacity: 800, monthly: 350 } } },
    ],
    maxChanges: 3,
    solution: ["add-cache", "add-cdn"],
    trap: "more-servers",
    trapNote: "More servers do nothing for slow reads. They all wait for the same database, and they cost money.",
    hints: ["Two parts are busy: the database and the app servers.", "Do not answer the same question from the database again and again, and do not make servers send files.", "Add a cache for reads and a CDN for static files."],
    focus: "db",
  },
  {
    id: "sd-az-outage",
    difficulty: "medium",
    title: "One AZ goes dark",
    brief: "At 1 pm one Availability Zone fails. Everything runs in that one zone. Make the site survive a zone failure.",
    incident: "OUTAGE: us-east-1a is unreachable. All servers and the database are in 1a. The site is down.",
    model: model({ app: { count: 4 }, net: { egressGb: 400 } }),
    traffic: day(30, 140),
    mix: { staticShare: 0.2, readShare: 0.8 },
    outage: { from: 13, to: 17 },
    goals: { maxP95Ms: 250, minAvailability: 99, maxCostUsd: 750 },
    stretch: { maxCostUsd: 680 },
    changes: [
      { id: "two-azs", label: "Spread servers across 2 AZs", description: "Half of the servers run in a second Availability Zone, behind a load balancer.", patch: { app: { zones: 2 } } },
      { id: "health-checks", label: "Add load balancer health checks", description: "The load balancer stops sending users to servers that do not answer.", patch: { app: { healthChecks: true } } },
      { id: "rds-multi-az", label: "Turn on RDS Multi-AZ", description: "A standby database in the other zone takes over by itself if the primary fails.", patch: { db: { multiAz: true } } },
      { id: "autoscaling", label: "Add an Auto Scaling group", description: "Servers are added when load grows and removed when it falls, so you pay for less at night.", patch: { app: { autoscale: true, scaleMin: 2, scaleMax: 8 } } },
      { id: "bigger-servers", label: "Use bigger servers", description: "Bigger servers in the same zone still go down with the zone.", patch: { app: { label: "m5.xlarge", rpsEach: 200, monthlyEach: 140, count: 4 } } },
    ],
    maxChanges: 4,
    solution: ["two-azs", "health-checks", "rds-multi-az"],
    trap: "bigger-servers",
    trapNote: "A bigger server is still one server in one zone. It does not survive a zone failure and it costs twice as much.",
    hints: ["Everything lives in one zone, so one failure takes down everything.", "You need copies of the servers and of the database in a second zone.", "Spread servers over two AZs, let the load balancer find dead servers, and give the database a standby."],
    focus: "lb",
  },
  {
    id: "sd-batch-starves-web",
    difficulty: "medium",
    title: "The report job starves the shop",
    brief: "A heavy report job runs at midday on the same servers and database as the shop. While it runs, customers wait.",
    incident: "LATENCY ALERT: p95 jumps to 3 s from 11:00 to 15:00, the same time the reports run.",
    model: model({ app: { count: 4, monthlyEach: 120, label: "m5.xlarge", rpsEach: 100 }, db: { capacity: 400, monthly: 200 }, net: { egressGb: 600 } }),
    traffic: shape([[0, 40], [6, 40], [10, 130], [17, 130], [23, 40]]),
    mix: { staticShare: 0.2, readShare: 0.8 },
    batchJob: { from: 11, to: 15, appLoad: 240, dbLoad: 240 },
    goals: { maxP95Ms: 200, minAvailability: 99.5, maxCostUsd: 800 },
    stretch: { maxCostUsd: 720 },
    changes: [
      { id: "spot-workers", label: "Run the job on Spot workers", description: "Move the report job to its own Spot instances, which cost about 70% less and can be interrupted. The shop stops competing with it.", patch: { batch: { separate: true } } },
      { id: "savings-plan", label: "Buy a 1-year Compute Savings Plan", description: "Pay about 30% less for the steady web servers.", patch: { app: { pricing: "savings" } } },
      { id: "autoscaling", label: "Add an Auto Scaling group", description: "Adds servers when the load grows. It helps the web tier but does nothing for the shared database.", patch: { app: { autoscale: true, scaleMin: 2, scaleMax: 8 } } },
      { id: "more-servers", label: "Add 4 more app servers", description: "Bigger fleet all day, to survive 4 hours. Costly, and the database still gets the job load.", patch: { app: { count: 8 } } },
      { id: "reserved-rds", label: "Buy a 1-year RDS Reserved Instance", description: "Pay about 38% less for the database.", patch: { db: { pricing: "reserved" } } },
    ],
    maxChanges: 3,
    solution: ["spot-workers", "savings-plan"],
    trap: "more-servers",
    trapNote: "Extra servers for four busy hours cost money all month, and the database still has to carry the job.",
    hints: ["Look at the times: the slow period matches the job.", "The shop and the job share the same machines. Separate them.", "Move the job to Spot workers. A savings plan keeps the bill in budget."],
    focus: "workers",
  },
  // ───────────────────────────── HARD ─────────────────────────────
  {
    id: "sd-missing-index",
    difficulty: "hard",
    title: "A query scans a million rows",
    brief: "The product search runs a full table scan on every request. At lunch the database cannot keep up.",
    incident: "PAGE: slow query log shows 180 ms scans on orders. Database CPU 100% at lunch.",
    model: model({
      app: { count: 5 },
      db: { label: "db.m5.xlarge", capacity: 600, monthly: 250, readCost: 6, readMs: 180 },
      net: { egressGb: 500 },
    }),
    traffic: shape([[0, 40], [8, 60], [11, 250], [15, 250], [18, 80], [23, 40]]),
    mix: { staticShare: 0.2, readShare: 0.85 },
    goals: { maxP95Ms: 100, minAvailability: 99.5, maxCostUsd: 850, maxPeakDbUtil: 0.7 },
    stretch: { maxCostUsd: 800 },
    changes: [
      { id: "add-index", label: "Add an index on the search column", description: "An index lets the database find rows directly instead of reading the whole table. Reads get both faster and cheaper.", patch: { db: { readCost: 1, readMs: 12 } } },
      { id: "add-cache", label: "Add ElastiCache for repeated searches", description: "Popular searches repeat. A cache answers them in memory.", patch: { cache: { on: true, hit: 0.7 } } },
      { id: "bigger-db", label: "Upgrade to db.m5.4xlarge", description: "Four times the database power. A scan is still a scan, and the bill goes way up.", patch: { db: { label: "db.m5.4xlarge", capacity: 2400, monthly: 1000 } } },
      { id: "add-replica", label: "Add two read replicas", description: "More copies to scan the table. Each costs as much as the database.", patch: { db: { replicas: 2, replicaMonthly: 250 } } },
      { id: "more-servers", label: "Add more app servers", description: "The servers are not the slow part.", patch: { app: { count: 10 } } },
    ],
    maxChanges: 3,
    solution: ["add-index", "add-cache"],
    trap: "bigger-db",
    trapNote: "A bigger database still scans the whole table, so each query stays slow, and the cost goes over the limit.",
    hints: ["Read the incident: a query takes 180 ms because it reads every row.", "Fix the query first, because power does not fix a bad query.", "Add the index. Then take the repeated reads off the database with a cache."],
    focus: "db",
  },
  {
    id: "sd-hot-partition",
    difficulty: "hard",
    title: "One hot key, throttled writes",
    brief: "A DynamoDB table uses the date as its partition key. Today's partition gets almost all the writes and is throttled, while the table has plenty of capacity overall.",
    incident: "ALARM: ThrottledRequests on orders-table. Total capacity use is 20% but one partition is at 100%.",
    model: model({
      app: { count: 10 },
      db: { kind: "dynamodb", label: "DynamoDB orders", capacity: 1100, monthly: 450, skew: 6, readMs: 6, writeMs: 10, readCost: 1 },
      net: { egressGb: 400 },
    }),
    traffic: shape([[0, 150], [8, 200], [12, 800], [16, 800], [19, 250], [23, 150]]),
    mix: { staticShare: 0.1, readShare: 0.45 },
    goals: { maxP95Ms: 220, minAvailability: 99.5, maxCostUsd: 1500, maxPeakDbUtil: 0.85 },
    stretch: { maxCostUsd: 1450 },
    changes: [
      { id: "shard-key", label: "Add a random suffix to the partition key", description: "Writes for the same date spread over many partitions, so no single partition is hot. This is called write sharding.", patch: { db: { skew: 1.5 } } },
      { id: "add-dax", label: "Add DAX, a DynamoDB cache", description: "A cache in front of DynamoDB answers repeated reads. Fewer reads means more room for writes.", patch: { cache: { on: true, hit: 0.7, monthly: 150 } } },
      { id: "add-queue", label: "Buffer writes with SQS", description: "Writes wait in a queue and are written at a steady pace instead of in a burst.", patch: { queue: { on: true } } },
      { id: "double-capacity", label: "Double the provisioned capacity", description: "More capacity for the table. It is spread over partitions, so the hot one gets only a bit more.", patch: { db: { capacity: 2200, monthly: 900 } } },
      { id: "more-servers", label: "Add more app servers", description: "The throttling is in the table, not in the servers.", patch: { app: { count: 12 } } },
    ],
    maxChanges: 3,
    solution: ["shard-key", "add-dax"],
    trap: "double-capacity",
    trapNote: "Capacity is shared across partitions. The hot partition is still hot, and you pay double.",
    hints: ["Total capacity is fine, but one partition gets almost all the work.", "The cause is the key, not the capacity. Spread the key.", "Shard the partition key. A cache for reads gives the writes more room."],
    focus: "db",
  },
  {
    id: "sd-black-friday-az",
    difficulty: "hard",
    title: "Peak day plus a lost zone",
    brief: "It is the biggest sales day. Traffic triples, and in the middle of it one Availability Zone fails. The fixed fleet is too small and sits in one zone.",
    incident: "OUTAGE: us-east-1a lost during peak sales. Fleet at 100% before the failure.",
    model: model({
      app: { count: 6, label: "m5.xlarge", rpsEach: 100, monthlyEach: 100 },
      db: { label: "db.r5.large", capacity: 900, monthly: 300 },
      net: { egressGb: 800 },
    }),
    traffic: shape([[0, 60], [7, 100], [10, 500], [17, 500], [20, 120], [23, 60]]),
    mix: { staticShare: 0.15, readShare: 0.8 },
    outage: { from: 13, to: 16 },
    goals: { maxP95Ms: 350, minAvailability: 99, maxCostUsd: 1800 },
    stretch: { maxCostUsd: 1600 },
    changes: [
      { id: "asg-two-azs", label: "Auto Scaling group across 2 AZs", description: "Servers are spread over two zones and the group adds more when load rises, and removes them when it falls.", patch: { app: { zones: 2, autoscale: true, scaleMin: 4, scaleMax: 16 } } },
      { id: "health-checks", label: "Load balancer health checks", description: "Dead servers are removed from rotation within seconds.", patch: { app: { healthChecks: true } } },
      { id: "rds-multi-az", label: "RDS Multi-AZ", description: "A standby database in the second zone takes over after a failure.", patch: { db: { multiAz: true } } },
      { id: "add-cache", label: "Add ElastiCache", description: "Fewer reads reach the database. It helps speed, not zone failure.", patch: { cache: { on: true, hit: 0.8 } } },
      { id: "oversize-fleet", label: "Double the fixed fleet to 12 servers", description: "Always-on capacity for the peak. It does not fix the zone problem and it is on the bill for the whole month.", patch: { app: { count: 12 } } },
    ],
    maxChanges: 4,
    solution: ["asg-two-azs", "health-checks", "rds-multi-az"],
    trap: "oversize-fleet",
    trapNote: "A fixed, doubled fleet costs the same at night as at peak, and still lives in one zone.",
    hints: ["Two problems at once: too little capacity at peak, and one zone.", "You need servers in two zones that can grow, plus a way to remove dead ones.", "Auto Scaling over two AZs, health checks, and a Multi-AZ database."],
    focus: "app",
  },
  {
    id: "sd-halve-the-bill",
    difficulty: "hard",
    title: "Halve the bill, keep it fast",
    brief: "The CFO wants the monthly bill cut in half without hurting speed or uptime. Money leaks in four places.",
    incident: "COST ALERT: bill is $3,400 a month. Target is under $2,000. Latency and uptime must not suffer.",
    model: model({
      app: { label: "m5.xlarge", count: 6, rpsEach: 200, monthlyEach: 140 },
      db: { label: "db.r5.xlarge", capacity: 1200, monthly: 350 },
      net: { egressGb: 6000, natGb: 15000, s3Share: 0.8 },
      logs: { gb: 40000 },
    }),
    traffic: day(60, 160),
    mix: { staticShare: 0.5, readShare: 0.8 },
    goals: { maxP95Ms: 200, minAvailability: 99.5, maxCostUsd: 2000 },
    stretch: { maxCostUsd: 1750 },
    changes: [
      { id: "add-cdn", label: "Add CloudFront", description: "Cheaper data transfer out, and static files stop reaching the servers.", patch: { cdn: { on: true } } },
      { id: "s3-endpoint", label: "S3 gateway VPC endpoint", description: "Stops S3 traffic from going through the NAT gateway.", patch: { net: { s3Endpoint: true } } },
      { id: "glacier-lifecycle", label: "Lifecycle old logs to Glacier", description: "Old logs move to a much cheaper storage class.", patch: { logs: { coldShare: 0.9 } } },
      { id: "savings-plan", label: "1-year Compute Savings Plan", description: "About 30% off the servers.", patch: { app: { pricing: "savings" } } },
      { id: "tiny-server", label: "Run everything on 1 t3.micro", description: "The cheapest possible server. It cuts the bill and cannot carry the traffic.", patch: { app: { label: "t3.micro", count: 1, rpsEach: 15, monthlyEach: 9 } } },
      { id: "second-nat", label: "A NAT gateway in every AZ", description: "Better resilience, more fixed cost.", patch: { net: { natGateways: 2 } } },
    ],
    maxChanges: 4,
    solution: ["add-cdn", "s3-endpoint", "glacier-lifecycle", "savings-plan"],
    trap: "tiny-server",
    trapNote: "A tiny server makes the bill small, but it cannot serve the traffic. Uptime and speed fall.",
    hints: ["Open the cost lines. Four of them are big: transfer, NAT, logs, servers.", "Each leak has a cheap plug. Do not shrink the servers below the traffic.", "CDN, S3 endpoint, Glacier lifecycle, savings plan."],
    focus: "nat",
  },
];

export const SYSDESIGN_POOL: readonly SysdesignRound[] = POOL;

export function scenariosByDifficulty(difficulty: Difficulty): SysdesignRound[] {
  return POOL.filter((r) => r.difficulty === difficulty);
}

export type { ChangeDef };
