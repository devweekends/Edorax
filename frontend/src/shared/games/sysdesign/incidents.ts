// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// The six production incidents of the System Design Runner, two for each difficulty. Each one is
// a real lab spec (HldLabSpec, the same shape the platform's labs use) on AWS parts: a broken
// starting board, the checks it must pass, hints and a reference fix with a reason for every part.
// The numbers were set with the real model (runChallenge): every starting board fails and every
// reference solution passes. Prices are the catalog's illustrative us-east-1 on-demand prices.
import type { Board, ChallengeScenario, CheckDef, CheckMetric, HldLabSpec, SolutionDef } from "../../lab/engine/hld-types";
import type { SysdesignRound } from "./types";

const LIMITS =
  "A simplified model, not a real AWS bill. Prices are illustrative us-east-1 on-demand prices from late 2026. Times are in model milliseconds. In this game a cache or CDN hit rate counts only up to 90%.";

// ---- small builders, so each incident reads as data -------------------------------------

type Op = "<=" | ">=";
const metric = (id: string, label: string, scenario: string, m: CheckMetric, op: Op, value: number): CheckDef => ({
  type: "metric", id, kind: "non-functional", label, scenario, metric: m, op, value,
});
const capacity = (peak: number) => metric("capacity", "Serves the whole peak", "steady", "capacity", ">=", peak);
const p99 = (ms: number) => metric("p99", "Slowest 1 in 100 requests is fast enough (p99)", "steady", "p99", "<=", ms);
const availability = (v: number) => metric("availability", "Stays up (availability)", "steady", "availability", ">=", v);
const cost = (usd: number) => metric("cost", "Cost per hour is within the budget", "steady", "cost", "<=", usd);
const served = (id: string, label: string, scenario: string) => metric(id, label, scenario, "served", ">=", 0.999);
const slow = (id: string, label: string, scenario: string, ms: number) => metric(id, label, scenario, "p99", "<=", ms);
const reads: CheckDef = {
  type: "path", id: "read", kind: "functional", label: "A request reaches the database",
  chain: ["client", "balancer", "compute", "database"], target: "client > load balancer > app servers > database",
};
const cached: CheckDef = {
  type: "path", id: "cached", kind: "functional", label: "Repeated reads can come from a cache",
  chain: ["client", "compute", "cache"], target: "the app servers are linked to a cache",
};

const LOSE_APP: ChallengeScenario = {
  id: "lose-app", title: "A server dies", story: "One EC2 server stops. The load balancer sends its share to the others.",
  faults: [{ type: "lose-instance", role: "compute" }],
};
const LOSE_CACHE: ChallengeScenario = {
  id: "lose-cache", title: "The cache is flushed", story: "The cache is empty. Every read goes to the database.",
  faults: [{ type: "down", role: "cache" }],
};
const ZONE_DOWN: ChallengeScenario = {
  id: "zone-down", title: "A zone goes down", story: "An app server and the cache in that zone are gone at the same time.",
  faults: [{ type: "lose-instance", role: "compute" }, { type: "down", role: "cache" }],
};
const LOSE_WORKERS: ChallengeScenario = {
  id: "lose-workers", title: "The workers stop for 2 minutes", story: "Orders keep arriving. They wait in the queue until the workers return.",
  faults: [{ type: "down", role: "worker" }],
};

const board = (nodes: Board["nodes"], edges: Board["edges"]): Board => ({ nodes, edges });

// ---- 1. easy: the bill tripled ------------------------------------------------------------

const BILL_START: Board = board(
  [
    { id: "client", kind: "client", x: 0, y: 0 },
    { id: "alb", kind: "aws-alb", x: 0, y: 1 },
    { id: "web", kind: "aws-ec2-asg", x: 0, y: 2, props: { size: "m5.xlarge", count: 12, autoscale: 0, azs: 2 } },
    { id: "db", kind: "aws-rds", x: 0, y: 3, props: { size: "db.r5.2xlarge", replicas: 3, multiAz: 1, readRatio: 0.8 } },
  ],
  [{ from: "client", to: "alb" }, { from: "alb", to: "web" }, { from: "web", to: "db" }],
);

const BILL_FIX: SolutionDef = {
  summary: "Size each part for the real peak, plus one spare server. Keep Multi-AZ, because a standby copy is what keeps the site up.",
  board: board(
    [
      { id: "client", kind: "client", x: 0, y: 0 },
      { id: "alb", kind: "aws-alb", x: 0, y: 1 },
      { id: "web", kind: "aws-ec2-asg", x: 0, y: 2, props: { size: "m5.large", count: 3, autoscale: 0, azs: 2 } },
      { id: "db", kind: "aws-rds", x: 0, y: 3, props: { size: "db.r5.large", replicas: 1, multiAz: 1, readRatio: 0.8 } },
    ],
    BILL_START.edges,
  ),
  parts: {
    alb: {
      why: "The ALB spreads requests over the servers. It is managed and billed per request, so its $1.32 an hour follows the traffic and is not the part to cut.",
      checks: ["read", "capacity"],
      without: "Nothing else in this design spreads the traffic over the servers, so there is no way to reach more than one of them.",
    },
    web: {
      why: "Three m5.large servers in two zones carry 1,800 requests a second at 38% busy each. If one dies, the other two are 56% busy. That is enough and costs $0.29 an hour, not $2.30.",
      checks: ["capacity", "p99", "app-dies", "app-dies-p99", "availability", "cost"],
      without: "With two servers, losing one leaves 113% load on the other, so only 89% of requests are served and the slowest 1 in 100 takes over 1,300 ms. With one server, nothing is left when it dies.",
    },
    db: {
      why: "A db.r5.large with one read replica is 60% busy at the real peak. Multi-AZ keeps a standby in a second zone, so the database is not the weak link. It costs $0.72 an hour, not $4.80.",
      checks: ["capacity", "p99", "availability", "cost"],
      without: "With no read replica the database is 120% busy, it serves only 1,500 requests a second and the slowest 1 in 100 takes 577 ms. Without Multi-AZ, availability drops to 99.84% and fails the 99.9% target.",
    },
  },
};

const billTripled: HldLabSpec = {
  slug: "sd-bill-tripled",
  family: "hld",
  title: "The bill tripled",
  purpose: "Right-size an AWS web tier that is far bigger than its traffic, and keep it safe while you cut the cost.",
  limits: LIMITS,
  hints: [
    "Run the tests first. Only one check fails: the cost. The reason names the part that costs the most.",
    "The ALB is billed per request, so you cannot make it cheaper. EC2 and RDS are the parts you can change.",
    "12 big servers for 1,800 requests a second is far too many. But keep at least 3: one can die and the rest must still carry the load.",
    "Keep Multi-AZ on the database. Without it, availability falls below 99.9%. A smaller size and fewer read replicas are the real savings.",
  ],
  allowedComponents: ["client", "aws-alb", "aws-ec2-asg", "aws-rds", "aws-elasticache"],
  startingBoard: BILL_START,
  scenario:
    "The AWS bill is $8.42 an hour, about three times what it should be. Real traffic peaks at only 1,800 requests a second, but the team rented a huge fleet during the launch and never gave it back. Cut the cost to $3.00 an hour or less. The site must stay fast (p99 under 100 ms), stay 99.9% up, and keep serving when one server dies.",
  levels: [{ id: "l1", load: 1_800, targets: { rps: 1_800, p99Ms: 100, availability: 0.999, budgetPerHour: 3 } }],
  solution: BILL_FIX,
  challenge: {
    peakLoad: 1_800,
    scenarios: [LOSE_APP],
    checks: [
      reads,
      capacity(1_800),
      p99(100),
      served("app-dies", "Everyone is still served when one server dies", "lose-app"),
      slow("app-dies-p99", "Slowest 1 in 100 while a server is down (p99)", "lose-app", 130),
      availability(0.999),
      cost(3),
    ],
  },
};

// ---- 2. easy: launch day is slow ---------------------------------------------------------

const LAUNCH_START: Board = board(
  [
    { id: "client", kind: "client", x: 0, y: 0 },
    { id: "alb", kind: "aws-alb", x: 0, y: 1 },
    { id: "web", kind: "aws-ec2-asg", x: 0, y: 2, props: { size: "m5.large", count: 2, autoscale: 0, azs: 2 } },
    { id: "db", kind: "aws-rds", x: 0, y: 3, props: { size: "db.r5.large", replicas: 0, multiAz: 1, readRatio: 0.85 } },
  ],
  [{ from: "client", to: "alb" }, { from: "alb", to: "web" }, { from: "web", to: "db" }],
);

const LAUNCH_FIX: SolutionDef = {
  summary: "A cache answers the repeated reads from memory, so the database only sees the misses. Then add one more, faster server so the site survives losing one.",
  board: board(
    [
      { id: "client", kind: "client", x: 0, y: 0 },
      { id: "alb", kind: "aws-alb", x: 0, y: 1 },
      { id: "web", kind: "aws-ec2-asg", x: 0, y: 2, props: { size: "c5.large", count: 3, autoscale: 0, azs: 2 } },
      { id: "cache", kind: "aws-elasticache", x: 1, y: 3, props: { size: "cache.r6g.large", count: 1, replicasPerShard: 1, hitRate: 0.85, azs: 2 } },
      { id: "db", kind: "aws-rds", x: 0, y: 3, props: { size: "db.r5.large", replicas: 0, multiAz: 1, readRatio: 0.85 } },
    ],
    [...LAUNCH_START.edges, { from: "web", to: "cache" }],
  ),
  parts: {
    alb: {
      why: "The ALB spreads the 3,000 requests a second over the servers. It is managed, so it never becomes the limit, and it costs $2.18 an hour.",
      checks: ["read", "capacity"],
      without: "Without the ALB nothing spreads the traffic over the servers.",
    },
    web: {
      why: "Three c5.large servers (compute sized, 2,400 requests a second each) are 42% busy at the peak and 63% busy with one gone. Two m5.large servers were 94% busy.",
      checks: ["capacity", "p99", "app-dies", "app-dies-p99"],
      without: "With the first two m5.large servers the web tier is 94% busy and the slowest 1 in 100 takes 344 ms. When one dies the other is 188% busy and the slowest 1 in 100 takes over 1,300 ms.",
    },
    cache: {
      why: "At an 85% hit rate the cache answers 2,550 of the 3,000 reads a second from memory. Only about 450 reach the database, which falls from 213% busy to 32% busy. It costs $0.41 an hour.",
      checks: ["capacity", "p99", "app-dies", "app-dies-p99", "cost"],
      without: "With no cache the database is 213% busy, so it can serve only 1,412 requests a second and the slowest 1 in 100 takes 580 ms. CloudFront also removes the repeats, but at this load it costs $8.10 an hour and breaks the $5.00 budget.",
    },
    db: {
      why: "The database keeps the data. With the cache in front it is only 32% busy. Multi-AZ keeps a standby in a second zone, so it is not the weak link for availability.",
      checks: ["read", "capacity", "p99", "availability"],
      without: "Without Multi-AZ, availability falls to 99.84% and fails the 99.9% target.",
    },
  },
};

const launchDaySlow: HldLabSpec = {
  slug: "sd-launch-slow",
  family: "hld",
  title: "Launch day is slow",
  purpose: "Find why a new site is slow under launch traffic, and fix it without a huge bill.",
  limits: LIMITS,
  hints: [
    "Run the tests. Read the reasons: the database (RDS) is over 200% busy, and the two servers are almost full. Many requests ask for the same pages again and again.",
    "A cache answers repeated reads from memory, so only the misses reach the database. ElastiCache is the AWS cache. Link the app servers to it.",
    "CloudFront also stops repeated requests, but it is billed per request. Look at what it adds to the cost before you choose it.",
    "When the database is safe, the two web servers are still too busy. Use a faster size or add a server, so the site survives when one dies.",
  ],
  allowedComponents: ["client", "aws-cloudfront", "aws-alb", "aws-ec2-asg", "aws-elasticache", "aws-rds"],
  startingBoard: LAUNCH_START,
  scenario:
    "Launch day: 3,000 requests a second hit a small site. Pages take almost a second and some time out. The database is over 200% busy and the two web servers are almost full. Make the site fast (p99 under 100 ms), keep it serving when one server dies, and keep the bill at $5.00 an hour or less.",
  levels: [{ id: "l1", load: 3_000, targets: { rps: 3_000, p99Ms: 100, availability: 0.999, budgetPerHour: 5 } }],
  solution: LAUNCH_FIX,
  challenge: {
    peakLoad: 3_000,
    scenarios: [LOSE_APP],
    checks: [
      reads,
      capacity(3_000),
      p99(100),
      served("app-dies", "Everyone is still served when one server dies", "lose-app"),
      slow("app-dies-p99", "Slowest 1 in 100 while a server is down (p99)", "lose-app", 150),
      availability(0.999),
      cost(5),
    ],
  },
};

// ---- 3. medium: the flash sale melts the database ------------------------------------------

const SALE_WEB = { size: "c5.large", count: 4, autoscale: 0, azs: 2 };
const SALE_START: Board = board(
  [
    { id: "client", kind: "client", x: 0, y: 0 },
    { id: "alb", kind: "aws-alb", x: 0, y: 1 },
    { id: "web", kind: "aws-ec2-asg", x: 0, y: 2, props: SALE_WEB },
    { id: "db", kind: "aws-rds", x: 0, y: 3, props: { size: "db.r5.xlarge", replicas: 0, multiAz: 1, readRatio: 0.9 } },
  ],
  [{ from: "client", to: "alb" }, { from: "alb", to: "web" }, { from: "web", to: "db" }],
);

const SALE_FIX: SolutionDef = {
  summary: "Put a cache in front of the database so most reads never reach it. Then add read replicas, so the database can still cope on the minute the cache is empty.",
  board: board(
    [
      { id: "client", kind: "client", x: 1, y: 0 },
      { id: "alb", kind: "aws-alb", x: 1, y: 1 },
      { id: "web", kind: "aws-ec2-asg", x: 1, y: 2, props: SALE_WEB },
      { id: "cache", kind: "aws-elasticache", x: 0, y: 3, props: { size: "cache.r6g.large", count: 1, replicasPerShard: 1, hitRate: 0.85, azs: 2 } },
      { id: "db", kind: "aws-rds", x: 2, y: 3, props: { size: "db.r5.xlarge", replicas: 2, multiAz: 1, readRatio: 0.9 } },
    ],
    [...SALE_START.edges, { from: "web", to: "cache" }],
  ),
  parts: {
    alb: {
      why: "The ALB spreads the 6,000 requests a second over the servers. It is billed per request, so it is the biggest line in the bill at $4.34 an hour.",
      checks: ["read", "capacity"],
      without: "Without the ALB nothing spreads the traffic over the servers.",
    },
    web: {
      why: "Four c5.large servers handle 6,000 requests a second at 63% busy. If one dies, the other three can still carry it. They were never the problem.",
      checks: ["capacity", "p99", "app-dies"],
      without: "With three servers the slowest 1 in 100 takes 141 ms, over the 90 ms limit, and losing one leaves only 80% of requests served. The fleet was sized right.",
    },
    cache: {
      why: "At an 85% hit rate the cache answers 5,100 of 6,000 reads a second from memory. The database sees about 900 a second instead of 6,000, and falls from 225% busy to 11% busy.",
      checks: ["cached", "capacity", "p99", "app-dies"],
      without: "With no cache the cache path check fails, and even with two replicas the database is 75% busy and the slowest 1 in 100 takes 97 ms, over 90 ms. With no cache and no replica (the starting board) the database is 225% busy and serves only 2,667 requests a second.",
    },
    db: {
      why: "Two read replicas share the reads. When the cache is flushed, all 6,000 requests a second hit the database, and three copies keep it 75% busy. Multi-AZ keeps it up when a zone fails.",
      checks: ["cache-dies", "cache-dies-p99", "capacity", "availability", "cost"],
      without: "With a cache and no replica, a flushed cache sends 225% load to the database and only 44% of requests are served. With one replica it is 113% busy and 89% are served. A bigger db.r5.2xlarge with two replicas works but costs $8.93 an hour, almost the whole $9.00 budget.",
    },
  },
};

const flashSale: HldLabSpec = {
  slug: "sd-flash-sale",
  family: "hld",
  title: "The flash sale melts the database",
  purpose: "Protect a database from a read flood with a cache and read replicas, and prove it still holds when the cache is empty.",
  limits: LIMITS,
  hints: [
    "The database is 225% busy. Nine in ten requests only read. Reads are what a cache and read replicas are for.",
    "Add ElastiCache and link the app servers to it. At an 85% hit rate, only 15% of the reads reach the database.",
    "A cache can be flushed or restart empty. Run the tests and read the cache check: then every read hits the database again. Read replicas (copies that only read) share that load.",
    "A bigger RDS size also helps, but every replica costs as much as the primary. Compare the price of two replicas on a smaller size with one big size before you decide.",
  ],
  allowedComponents: ["client", "aws-alb", "aws-ec2-asg", "aws-elasticache", "aws-rds"],
  startingBoard: SALE_START,
  scenario:
    "A flash sale has started and 6,000 requests a second arrive. Most of them read the same product pages, and every read goes to one database. It is 225% busy, pages take 600 ms and many fail. Take the load off it with a cache. Make sure the database can still cope if the cache is flushed. Stay at $9.00 an hour or less.",
  levels: [{ id: "l1", load: 6_000, targets: { rps: 6_000, p99Ms: 90, availability: 0.999, budgetPerHour: 9 } }],
  solution: SALE_FIX,
  challenge: {
    peakLoad: 6_000,
    scenarios: [LOSE_APP, LOSE_CACHE],
    checks: [
      reads,
      cached,
      capacity(6_000),
      p99(90),
      served("app-dies", "Everyone is still served when one server dies", "lose-app"),
      served("cache-dies", "Everyone is still served when the cache is flushed", "lose-cache"),
      slow("cache-dies-p99", "Slowest 1 in 100 while the cache is empty (p99)", "lose-cache", 150),
      availability(0.999),
      cost(9),
    ],
  },
};

// ---- 4. medium: we lost a zone -----------------------------------------------------------------

const ZONE_START: Board = board(
  [
    { id: "client", kind: "client", x: 0, y: 0 },
    { id: "alb", kind: "aws-alb", x: 0, y: 1 },
    { id: "web", kind: "aws-ec2-asg", x: 0, y: 2, props: { size: "c5.large", count: 3, autoscale: 0, azs: 1 } },
    { id: "cache", kind: "aws-elasticache", x: 1, y: 3, props: { size: "cache.r6g.large", count: 1, replicasPerShard: 0, hitRate: 0.85, azs: 1 } },
    { id: "db", kind: "aws-rds", x: 0, y: 3, props: { size: "db.r5.large", replicas: 1, multiAz: 0, readRatio: 0.85 } },
  ],
  [{ from: "client", to: "alb" }, { from: "alb", to: "web" }, { from: "web", to: "db" }, { from: "web", to: "cache" }],
);

const ZONE_FIX: SolutionDef = {
  summary: "Give every layer a second zone: servers in two zones with a spare, a Multi-AZ database and a cache with a replica. Then one zone cannot take the site down.",
  board: board(
    [
      { id: "client", kind: "client", x: 0, y: 0 },
      { id: "alb", kind: "aws-alb", x: 0, y: 1 },
      { id: "web", kind: "aws-ec2-asg", x: 0, y: 2, props: { size: "c5.large", count: 4, autoscale: 0, azs: 2 } },
      { id: "cache", kind: "aws-elasticache", x: 1, y: 3, props: { size: "cache.r6g.large", count: 1, replicasPerShard: 1, hitRate: 0.85, azs: 2 } },
      { id: "db", kind: "aws-rds", x: 0, y: 3, props: { size: "db.r5.large", replicas: 1, multiAz: 1, readRatio: 0.85 } },
    ],
    ZONE_START.edges,
  ),
  parts: {
    alb: {
      why: "The ALB already runs in two zones, so it is not the weak link. It costs $3.62 an hour at 5,000 requests a second.",
      checks: ["read", "capacity", "availability"],
      without: "Without the ALB nothing spreads the traffic over the servers in the two zones.",
    },
    web: {
      why: "Four servers in two zones: if a whole zone is lost, two are left in the other. If a single server dies, three still carry the 5,000 requests a second, at 69% busy each.",
      checks: ["capacity", "p99", "app-dies", "app-dies-p99", "availability"],
      without: "With three servers, one dying leaves 104% load, so only 96% of requests are served and the slowest 1 in 100 takes over 1,300 ms. With all servers in one zone, availability is 99.94%, just under the 99.95% target.",
    },
    cache: {
      why: "The cache sits in two zones with a replica, so one zone cannot take it away. A single cache node in one zone is only 99.9% available, and it sits in series with everything else.",
      checks: ["availability"],
      without: "A single cache node in one zone brings availability down to 99.84%, which fails the 99.95% target.",
    },
    db: {
      why: "Multi-AZ keeps a synchronous standby in a second zone. If the main copy's zone fails, RDS fails over to the standby. This lifts the database from 99.85% to about 99.999% available. It costs $0.72 an hour.",
      checks: ["availability", "cost"],
      without: "Without Multi-AZ the database is the weak link. Availability for the whole site is 99.84%, under the 99.95% target.",
    },
  },
};

const lostZone: HldLabSpec = {
  slug: "sd-lost-zone",
  family: "hld",
  title: "We lost a zone",
  purpose: "Spread a system over two Availability Zones so one data centre cannot take it down, without paying for much more.",
  limits: LIMITS,
  hints: [
    "Run the tests. Read the availability reason: it names the weakest part. Fix it, run again, and the next weak part shows up.",
    "RDS Multi-AZ keeps a standby copy in a second zone. If the zone of the main copy fails, the standby takes over.",
    "EC2 Auto Scaling can spread servers over zones: set zones to 2. ElastiCache can too, and a replica keeps the cache alive.",
    "Three servers cannot lose one and still carry 5,000 requests a second. Count what is left after one dies, then add what is needed.",
  ],
  allowedComponents: ["client", "aws-alb", "aws-ec2-asg", "aws-elasticache", "aws-rds"],
  startingBoard: ZONE_START,
  scenario:
    "Last night one AWS Availability Zone (a separate data centre) lost power. The servers, the cache and the main database were all in that zone, so the site was down for 40 minutes. Traffic peaks at 5,000 requests a second. The goal is 99.95% uptime, which allows about 22 minutes of downtime a month. The site must also keep serving when one server dies. Stay at $6.00 an hour or less.",
  levels: [{ id: "l1", load: 5_000, targets: { rps: 5_000, p99Ms: 90, availability: 0.9995, budgetPerHour: 6 } }],
  solution: ZONE_FIX,
  challenge: {
    peakLoad: 5_000,
    scenarios: [LOSE_APP],
    checks: [
      reads,
      capacity(5_000),
      p99(90),
      served("app-dies", "Everyone is still served when one server dies", "lose-app"),
      slow("app-dies-p99", "Slowest 1 in 100 while a server is down (p99)", "lose-app", 130),
      availability(0.9995),
      cost(6),
    ],
  },
};

// ---- 5. hard: peak day, one zone down, tight budget ----------------------------------------------

const PEAK_START: Board = board(
  [
    { id: "client", kind: "client", x: 0, y: 0 },
    { id: "alb", kind: "aws-alb", x: 0, y: 1 },
    { id: "web", kind: "aws-ec2-asg", x: 0, y: 2, props: { size: "c5.2xlarge", count: 6, autoscale: 0, azs: 1 } },
    { id: "db", kind: "aws-rds", x: 0, y: 3, props: { size: "db.r5.xlarge", replicas: 0, multiAz: 0, readRatio: 0.85 } },
  ],
  [{ from: "client", to: "alb" }, { from: "alb", to: "web" }, { from: "web", to: "db" }],
);

const PEAK_FIX: SolutionDef = {
  summary: "Fix the database side, not the fleet: add a cache, give the database Multi-AZ and read replicas, and cut the web fleet to what the traffic needs, in two zones. That frees the money for the database.",
  board: board(
    [
      { id: "client", kind: "client", x: 1, y: 0 },
      { id: "alb", kind: "aws-alb", x: 1, y: 1 },
      { id: "web", kind: "aws-ec2-asg", x: 1, y: 2, props: { size: "c5.xlarge", count: 3, autoscale: 0, azs: 2 } },
      { id: "cache", kind: "aws-elasticache", x: 0, y: 3, props: { size: "cache.r6g.large", count: 1, replicasPerShard: 1, hitRate: 0.85, azs: 2 } },
      { id: "db", kind: "aws-rds", x: 2, y: 3, props: { size: "db.r5.xlarge", replicas: 3, multiAz: 1, readRatio: 0.85 } },
    ],
    [...PEAK_START.edges, { from: "web", to: "cache" }],
  ),
  parts: {
    alb: {
      why: "The ALB spreads the 8,000 requests a second over the servers in both zones. It is billed per request, so it is $5.78 an hour of the budget, and nothing you can shrink.",
      checks: ["read", "capacity", "availability"],
      without: "Without the ALB nothing spreads the traffic over the servers.",
    },
    web: {
      why: "Three c5.xlarge servers in two zones carry 8,000 requests a second at 56% busy and cost $0.51 an hour. When a zone goes down and one server with it, two are left at 83% busy. The old fleet of six c5.2xlarge cost $2.04 an hour and was only 14% busy.",
      checks: ["capacity", "p99", "zone-served", "zone-p99", "availability", "cost"],
      without: "The old fleet of six c5.2xlarge servers in one zone adds $1.53 an hour, which pushes the bill to $10.63 with the other fixes and breaks the $10.00 budget. In one zone it also fails availability.",
    },
    cache: {
      why: "At an 85% hit rate the cache answers 6,800 of 8,000 reads a second, so the database sees only 1,200 a second. It costs $0.41 an hour. It also has a replica in a second zone.",
      checks: ["cached", "capacity", "p99", "availability"],
      without: "With no cache the cache path check fails. With no cache and no replicas (the starting board) the database is 283% busy: it serves only 2,824 requests a second and the slowest 1 in 100 takes 569 ms.",
    },
    db: {
      why: "The database must carry all the reads for the minute the cache is gone. Three read replicas keep db.r5.xlarge at 71% busy with no cache and one server less. Multi-AZ keeps a standby in the second zone. It costs $2.40 an hour.",
      checks: ["zone-served", "zone-p99", "availability", "cost"],
      without: "With two replicas instead of three, the database is 94% busy when a zone goes down and the slowest 1 in 100 reaches 276 ms, over the 200 ms limit. Without Multi-AZ, availability falls to 99.84%.",
    },
  },
};

const peakDay: HldLabSpec = {
  slug: "sd-peak-day",
  family: "hld",
  title: "Peak day, one zone down, tight budget",
  purpose: "Make several changes that work together: cache, replicas, Multi-AZ and a right-sized fleet, under a budget that rules out buying big everywhere.",
  limits: LIMITS,
  hints: [
    "The fleet is far too big for the traffic. The database is the weak part: it is 283% busy. Fix the database side first.",
    "Add a cache so most reads never reach the database. Then give the database read replicas and Multi-AZ.",
    "The zone check removes the cache and one server at the same moment. The database must then carry all the reads. Count replicas for that case, not only for the normal one.",
    "Right-size the fleet and spread it over two zones. The budget leaves room for the database copies only if you cut the fleet first.",
    "CloudFront is billed per request. At 8,000 requests a second it costs more than your whole budget.",
  ],
  allowedComponents: ["client", "aws-cloudfront", "aws-alb", "aws-ec2-asg", "aws-elasticache", "aws-rds"],
  startingBoard: PEAK_START,
  scenario:
    "It is the busiest day of the year: 8,000 requests a second. Last year a zone failed at the peak and the site went down. The app fleet is huge, but the database is one RDS with no copy and no cache, and it is 283% busy. The site must survive a zone loss (an app server and the cache gone together), stay 99.95% up, and cost $10.00 an hour or less. Bigger machines everywhere will not fit the budget.",
  levels: [{ id: "l1", load: 8_000, targets: { rps: 8_000, p99Ms: 90, availability: 0.9995, budgetPerHour: 10 } }],
  solution: PEAK_FIX,
  challenge: {
    peakLoad: 8_000,
    scenarios: [ZONE_DOWN],
    checks: [
      reads,
      cached,
      capacity(8_000),
      p99(90),
      served("zone-served", "Everyone is still served when a zone goes down", "zone-down"),
      slow("zone-p99", "Slowest 1 in 100 while a zone is down (p99)", "zone-down", 200),
      availability(0.9995),
      cost(10),
    ],
  },
};

// ---- 6. hard: orders are piling up ------------------------------------------------------------------

const ORDERS_START: Board = board(
  [
    { id: "client", kind: "client", x: 0, y: 0 },
    { id: "alb", kind: "aws-alb", x: 0, y: 1 },
    { id: "web", kind: "aws-ec2-asg", x: 0, y: 2, props: { size: "c5.large", count: 2, autoscale: 0, azs: 2 } },
    { id: "db", kind: "aws-rds", x: 0, y: 3, props: { size: "db.r5.large", replicas: 0, multiAz: 1, readRatio: 0.7 } },
  ],
  [{ from: "client", to: "alb" }, { from: "alb", to: "web" }, { from: "web", to: "db" }],
);

const ORDERS_FIX: SolutionDef = {
  summary: "Save orders off the request. The web servers put each order on an SQS queue, two workers take them and save them to the database in groups, and the database is sized for the real load.",
  board: board(
    [
      { id: "client", kind: "client", x: 1, y: 0 },
      { id: "alb", kind: "aws-alb", x: 1, y: 1 },
      { id: "web", kind: "aws-ec2-asg", x: 1, y: 2, props: { size: "c5.large", count: 3, autoscale: 0, azs: 2 } },
      { id: "q", kind: "aws-sqs", x: 0, y: 3, props: { queueType: "standard" } },
      { id: "db", kind: "aws-rds", x: 2, y: 3, props: { size: "db.r5.xlarge", replicas: 1, multiAz: 1, readRatio: 0.7 } },
      { id: "w", kind: "worker", x: 0, y: 4, props: { size: "compute-small", count: 2, batchSize: 100 } },
    ],
    [...ORDERS_START.edges, { from: "web", to: "q" }, { from: "q", to: "w" }, { from: "w", to: "db", via: ["r", "l"] }],
  ),
  parts: {
    alb: {
      why: "The ALB spreads the 4,000 requests a second over the servers. It is billed per request: $2.90 an hour.",
      checks: ["read", "capacity"],
      without: "Without the ALB nothing spreads the traffic over the servers.",
    },
    web: {
      why: "Three c5.large servers are 56% busy at the peak. If one dies, the other two carry it. The two original servers were 83% busy, and one dying left only 60% of requests served.",
      checks: ["capacity", "p99", "app-dies"],
      without: "With two servers, losing one leaves 167% load on the other, so only 60% of requests are served.",
    },
    q: {
      why: "The queue holds each order until a worker saves it. About 1 request in 4 is an order, so about 1,000 orders a second arrive. The web server hands the order over and is free. No order is lost while the workers are away. It costs $1.44 an hour.",
      checks: ["order", "worker-dies", "cost"],
      without: "With no queue an order has nowhere to wait: 120,000 orders are lost in a 2 minute outage and the order path check fails.",
    },
    w: {
      why: "Two small workers handle 4,800 orders a second against 1,000 arriving. They have 3,800 a second to spare, so the 120,000 orders that waited in 2 minutes clear in 32 seconds. They save in groups of 100, so the database sees about 10 saves a second, not 1,000.",
      checks: ["order", "worker-dies", "p99"],
      without: "With one worker the spare is only 1,400 a second and the pile takes 86 seconds to clear, over the 60 second limit. With a batch size of 1 the database is 73% busy and p99 rises to 87 ms, over the 80 ms limit.",
    },
    db: {
      why: "The database is 58% busy with one read replica and Multi-AZ. The old db.r5.large was 233% busy. The replica shares the reads and Multi-AZ keeps the database from being the weak link.",
      checks: ["capacity", "p99", "app-dies", "availability", "cost"],
      without: "With the first db.r5.large and no replica the database is 234% busy and serves only 1,710 requests a second. A db.r5.2xlarge with three replicas works but costs $9.64 an hour, over the $7.00 budget.",
    },
  },
};

const ordersPile: HldLabSpec = {
  slug: "sd-orders-pile",
  family: "hld",
  title: "Orders are piling up",
  purpose: "Move order saving off the web request with a queue and workers, prove nothing is lost when the workers stop, and stay within the budget.",
  limits: LIMITS + " About 1 request in 4 is an order and leaves one message in the queue.",
  hints: [
    "Run the tests. Orders have no queue, so they have nowhere to wait. The failing reasons say which link is missing.",
    "Link the web servers to an SQS queue, the queue to a worker, and the worker to the database. Orders then wait safely in the queue.",
    "A worker can save many orders in one trip: raise its batch size. Many tiny saves hurt the database.",
    "When the workers stop, orders pile up. After they return, they must clear the pile fast. The spare capacity of the workers is what the drain check measures.",
    "Workers and queue cost money. The budget is $7.00 an hour, so a few small workers are better than many big ones. The database also needs to be bigger.",
  ],
  allowedComponents: ["client", "aws-alb", "aws-ec2-asg", "aws-elasticache", "aws-rds", "aws-sqs", "worker"],
  startingBoard: ORDERS_START,
  scenario:
    "Sale day: 4,000 requests a second, and about 1 in 4 is an order. The web servers save every order themselves, the database is 233% busy, and orders fail. If the order service stops for 2 minutes, those orders are lost for good. Put orders on a queue, add workers that save them, and make sure a 2 minute stop is fully cleared within 60 seconds. Stay at $7.00 an hour or less.",
  levels: [{ id: "l1", load: 4_000, targets: { rps: 4_000, p99Ms: 80, availability: 0.999, budgetPerHour: 7 } }],
  solution: ORDERS_FIX,
  challenge: {
    peakLoad: 4_000,
    shares: { queue: 0.25 },
    scenarios: [LOSE_APP, LOSE_WORKERS],
    checks: [
      reads,
      {
        type: "path", id: "order", kind: "functional", label: "An order is saved without making the buyer wait",
        chain: ["client", "compute", "queue", "worker", "database"], target: "the path app servers > queue > worker > database",
      },
      capacity(4_000),
      p99(80),
      served("app-dies", "Everyone is still served when one server dies", "lose-app"),
      {
        type: "drain", id: "worker-dies", kind: "non-functional", label: "No order is lost when the workers stop",
        outageSeconds: 120, maxDrainSeconds: 60, items: "orders", done: "saved",
      },
      availability(0.999),
      cost(7),
    ],
  },
};

// ---- the pool ---------------------------------------------------------------------------------------

export const SYSDESIGN_POOL: SysdesignRound[] = [
  { id: "sd-bill-tripled", difficulty: "easy", title: "The bill tripled", brief: "The AWS bill is three times too high for the real traffic. Make the system cheaper, and keep it safe.", spec: billTripled },
  { id: "sd-launch-slow", difficulty: "easy", title: "Launch day is slow", brief: "Launch traffic made the site slow, and the database is overloaded. Speed it up without a huge bill.", spec: launchDaySlow },
  { id: "sd-flash-sale", difficulty: "medium", title: "The flash sale melts the database", brief: "A flash sale sends every read to one database. Take the load off it, even when the cache is empty.", spec: flashSale },
  { id: "sd-lost-zone", difficulty: "medium", title: "We lost a zone", brief: "One AWS zone failed and the whole site went down. Make sure one zone can never stop it again.", spec: lostZone },
  { id: "sd-peak-day", difficulty: "hard", title: "Peak day, one zone down, tight budget", brief: "Peak day with a zone down and a tight budget. Several parts must change together.", spec: peakDay },
  { id: "sd-orders-pile", difficulty: "hard", title: "Orders are piling up", brief: "Orders are saved inside the web request and get lost or pile up. Use a queue and workers, within the budget.", spec: ordersPile },
];
