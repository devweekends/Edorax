// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// The pool of Docker Commands rounds. Each one is plain data (no functions), so it can travel as
// JSON to the browser: a fix round holds a starting world and goals, a build round holds pieces.
// Every round carries a `solution` that the tests replay.

import type { RoundBase } from "../types";
import type { AppSpec, BuildData, BuildGoal, BuildPiece, BuildSlot, ComposeFact, ComposeLine } from "./builder";
import {
  danglingImage, emptyWorld, makeContainer, makeImage, type DockerWorld, type Goal,
} from "./daemon";

export type FixRound = RoundBase & {
  mode: "fix";
  /** The starting state of the virtual Docker host. */
  world: DockerWorld;
  goals: Goal[];
  /** Commands the shortest sensible fix takes, including one look at what is wrong. */
  par: number;
  hints: string[];
  solution: string[];
};

export type BuildRound = RoundBase & BuildData & {
  mode: "build";
  goals: BuildGoal[];
  par: number;
  hints: string[];
  solution: string[];
};

export type DockerRound = FixRound | BuildRound;

const world = (p: Partial<DockerWorld>): DockerWorld => ({ ...emptyWorld(), ...p });

const NGINX_STOP_LOGS = ["nginx: [notice] signal 15 (SIGTERM) received, exiting"];

// ---------------------------------------------------------------------------------------------
// Fix rounds.

const startStopped: FixRound = {
  id: "docker-start-stopped", mode: "fix", difficulty: "easy",
  title: "The site is down",
  brief: "The web container was stopped and now http://localhost:8080 shows nothing. Bring the site back with the same container.",
  world: world({
    images: [makeImage("nginx:1.25")],
    containers: [makeContainer({ name: "web", image: "nginx:1.25", status: "exited", exitCode: 0, ports: [{ host: 8080, container: 80 }], logs: NGINX_STOP_LOGS, since: "10 minutes" })],
  }),
  goals: [
    { kind: "running", name: "web", label: "Container web is running" },
    { kind: "served", name: "web", contains: "Welcome to nginx", label: "curl localhost:8080 shows the nginx page" },
  ],
  par: 2,
  hints: ["List all containers, also the stopped ones: docker ps -a", "The container is called web. It only needs to be started again.", "Run: docker start web"],
  solution: ["docker ps -a", "docker start web"],
};

const wrongPort: FixRound = {
  id: "docker-wrong-port", mode: "fix", difficulty: "easy",
  title: "Nothing answers on 8080",
  brief: "The container web is running, but curl localhost:8080 fails. The nginx server inside listens on port 80.",
  world: world({
    images: [makeImage("nginx:1.25")],
    containers: [makeContainer({ name: "web", image: "nginx:1.25", ports: [{ host: 8080, container: 8080 }], logs: ["/docker-entrypoint.sh: Configuration complete; ready for start up", "nginx: [notice] start worker processes"], since: "5 minutes" })],
  }),
  goals: [
    { kind: "running", name: "web", label: "Container web is running" },
    { kind: "publishes", name: "web", port: 80, label: "Host port 8080 leads to container port 80" },
    { kind: "served", name: "web", contains: "Welcome to nginx", label: "curl localhost:8080 shows the nginx page" },
  ],
  par: 3,
  hints: ["Try curl localhost:8080 and read the error. Then look at the PORTS column of docker ps.", "The mapping is -p HOST:CONTAINER. The container side must be 80. A running container cannot change its ports, so remove it with docker rm -f web.", "Run it again: docker run -d --name web -p 8080:80 nginx:1.25"],
  solution: ["curl localhost:8080", "docker rm -f web", "docker run -d --name web -p 8080:80 nginx:1.25"],
};

const missingEnv: FixRound = {
  id: "docker-missing-env", mode: "fix", difficulty: "medium",
  title: "The database stops at once",
  brief: "Container db (postgres:16) exits a second after it starts. Find out why and get it running.",
  world: world({
    images: [makeImage("postgres:16")],
    containers: [makeContainer({
      name: "db", image: "postgres:16", status: "exited", exitCode: 1, since: "2 minutes",
      logs: [
        "Error: Database is uninitialized and superuser password is not specified.",
        "       You must specify POSTGRES_PASSWORD to a non-empty value for the",
        "       superuser. For example, \"-e POSTGRES_PASSWORD=password\" on \"docker run\".",
      ],
    })],
  }),
  goals: [
    { kind: "running", name: "db", label: "Container db is running" },
    { kind: "env", name: "db", key: "POSTGRES_PASSWORD", label: "db has a POSTGRES_PASSWORD" },
  ],
  par: 3,
  hints: ["docker ps -a shows the exit code. docker logs db shows the reason.", "The log asks for POSTGRES_PASSWORD. A container keeps the environment it was created with, so remove it first: docker rm db", "docker run -d --name db -e POSTGRES_PASSWORD=secret postgres:16"],
  solution: ["docker logs db", "docker rm db", "docker run -d --name db -e POSTGRES_PASSWORD=secret postgres:16"],
};

const portTaken: FixRound = {
  id: "docker-port-taken", mode: "fix", difficulty: "medium",
  title: "Port 8080 is already taken",
  brief: "Start a container named web from nginx:1.25 that answers on localhost. Port 8080 is the plan, but something may be using it. Free the port or pick another one.",
  world: world({
    images: [makeImage("nginx:1.25")],
    containers: [makeContainer({ name: "old-site", image: "nginx:1.25", ports: [{ host: 8080, container: 80 }], logs: ["nginx: [notice] start worker processes"], since: "3 hours" })],
  }),
  goals: [
    { kind: "running", name: "web", label: "Container web is running" },
    { kind: "publishes", name: "web", port: 80, label: "web publishes container port 80" },
    { kind: "served", name: "web", contains: "Welcome to nginx", label: "curl on its host port shows the nginx page" },
  ],
  par: 3,
  hints: ["docker ps shows who uses 8080.", "Either stop the old container (docker stop old-site) or use another host port, like -p 8081:80.", "docker run -d --name web -p 8081:80 nginx:1.25 works. If a run fails, a half made container stays: remove it with docker rm web."],
  solution: ["docker ps", "docker stop old-site", "docker run -d --name web -p 8080:80 nginx:1.25"],
};

const lostData: FixRound = {
  id: "docker-lost-data", mode: "fix", difficulty: "medium",
  title: "The database forgets everything",
  brief: "Every time the db container is removed and recreated, the orders are gone. Keep the data on a named volume called pgdata, mounted at /var/lib/postgresql/data.",
  world: world({
    images: [makeImage("postgres:16")],
    containers: [makeContainer({
      name: "db", image: "postgres:16", env: { POSTGRES_PASSWORD: "secret" }, ports: [{ host: 5432, container: 5432 }],
      logs: ["PostgreSQL init process complete; ready for start up.", "LOG:  database system is ready to accept connections"], since: "1 hour",
    })],
  }),
  goals: [
    { kind: "running", name: "db", label: "Container db is running" },
    { kind: "mount", name: "db", target: "/var/lib/postgresql/data", label: "A named volume is mounted at /var/lib/postgresql/data" },
    { kind: "env", name: "db", key: "POSTGRES_PASSWORD", label: "db still has its POSTGRES_PASSWORD" },
  ],
  par: 3,
  hints: ["docker inspect db has a Mounts list. It is empty, so the data lives inside the container.", "A volume must be given when the container is created. Remove db, then run it again with -v pgdata:/var/lib/postgresql/data", "docker run -d --name db -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data postgres:16"],
  solution: ["docker inspect db", "docker rm -f db", "docker run -d --name db -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data postgres:16"],
};

const noNetwork: FixRound = {
  id: "docker-no-network", mode: "fix", difficulty: "medium",
  title: "The web container cannot find the database",
  brief: "web talks to the host name db, but it crashes. Both containers are on the default bridge network, where names do not work. Connect them so that web runs and curl localhost:8080 works.",
  world: world({
    images: [makeImage("shop/web:2.0"), makeImage("postgres:16")],
    containers: [
      makeContainer({ name: "db", image: "postgres:16", env: { POSTGRES_PASSWORD: "secret" }, logs: ["LOG:  database system is ready to accept connections"], since: "20 minutes" }),
      makeContainer({
        name: "web", image: "shop/web:2.0", status: "exited", exitCode: 1, env: { DB_HOST: "db" }, ports: [{ host: 8080, container: 3000 }], since: "19 minutes",
        logs: ["Error: getaddrinfo ENOTFOUND db", "    at GetAddrInfoReqWrap.onlookup [as oncomplete] (node:dns:109:26)"],
      }),
    ],
  }),
  goals: [
    { kind: "running", name: "db", label: "Container db is running" },
    { kind: "sharedNetwork", a: "web", b: "db", label: "web and db share a network you created" },
    { kind: "running", name: "web", label: "Container web is running" },
    { kind: "served", name: "web", contains: "database", label: "curl localhost:8080 says it is connected to the database" },
  ],
  par: 5,
  hints: ["docker logs web says it cannot find the host db. Names only work on a network you create yourself.", "Create one with docker network create appnet, then connect db and web with docker network connect appnet NAME.", "Finish with docker start web."],
  solution: ["docker logs web", "docker network create appnet", "docker network connect appnet db", "docker network connect appnet web", "docker start web"],
};

const oomLoop: FixRound = {
  id: "docker-oom-loop", mode: "fix", difficulty: "hard",
  title: "The worker keeps restarting",
  brief: "The container worker restarts again and again. Find the reason, then run it so it stays up. Keep the restart policy unless-stopped.",
  world: world({
    images: [makeImage("acme/worker:3.1")],
    containers: [makeContainer({
      name: "worker", image: "acme/worker:3.1", status: "restarting", exitCode: 137, oomKilled: true, restartCount: 14, restart: "unless-stopped", memoryMb: 256,
      logs: ["worker: loading model into memory (needs about 400 MB)", "Killed", "worker: loading model into memory (needs about 400 MB)", "Killed"], since: "4 seconds",
    })],
  }),
  goals: [
    { kind: "memoryAtLeast", name: "worker", mb: 400, label: "worker is running with enough memory (400 MB or more, or no limit)" },
    { kind: "restartPolicy", name: "worker", policy: "unless-stopped", label: "The restart policy is still unless-stopped" },
  ],
  par: 5,
  hints: ["docker ps shows Restarting. docker logs worker ends with Killed.", "docker inspect worker (try -f '{{.State.OOMKilled}}') shows OOMKilled true and a Memory limit of 256 MB. The app needs about 400 MB.", "Memory cannot be changed on the old container. Remove it and run again with --memory 512m and --restart unless-stopped."],
  solution: ["docker ps", "docker logs worker", "docker inspect worker", "docker rm -f worker", "docker run -d --name worker --restart unless-stopped --memory 512m acme/worker:3.1"],
};

const newRelease: FixRound = {
  id: "docker-new-release", mode: "fix", difficulty: "hard",
  title: "Ship release 2.0",
  brief: "The site container runs acme/site:1.0 on port 8080. Replace it with acme/site:2.0 on the same port, and keep the cache container running. The new release has its own needs, so read what it says if it fails.",
  world: world({
    images: [makeImage("acme/site:1.0"), makeImage("redis:7")],
    containers: [
      makeContainer({ name: "cache", image: "redis:7", logs: ["Ready to accept connections tcp"], since: "2 days" }),
      makeContainer({ name: "site", image: "acme/site:1.0", ports: [{ host: 8080, container: 80 }], logs: ["site 1.0 ready"], since: "2 days" }),
    ],
  }),
  goals: [
    { kind: "image", name: "site", image: "acme/site:2.0", label: "Container site uses acme/site:2.0" },
    { kind: "running", name: "site", label: "Container site is running" },
    { kind: "served", name: "site", contains: "v2", label: "curl localhost:8080 shows the v2 page" },
    { kind: "running", name: "cache", label: "Container cache is still running" },
  ],
  par: 4,
  hints: ["docker pull acme/site:2.0 downloads the new release. Then stop and remove the old site container to free the name and port 8080.", "If the new container exits, docker logs site tells you what it needs. Here it is the variable SITE_NAME.", "docker run -d --name site -p 8080:80 -e SITE_NAME=Acme acme/site:2.0"],
  solution: ["docker pull acme/site:2.0", "docker stop site", "docker rm site", "docker run -d --name site -p 8080:80 -e SITE_NAME=Acme acme/site:2.0"],
};

const diskFull: FixRound = {
  id: "docker-disk-full", mode: "fix", difficulty: "hard",
  title: "Free some disk space",
  brief: "The server disk is almost full. Remove the stopped containers and the dangling images (the ones shown as <none>). Keep the running containers, the image shop/api:1.2 and both volumes.",
  world: world({
    images: [
      makeImage("nginx:1.25"), makeImage("postgres:16"), makeImage("shop/api:1.2"), makeImage("legacy/app:0.9"),
      danglingImage("a", 320), danglingImage("b", 210), danglingImage("c", 150),
    ],
    volumes: ["pgdata", "old-cache"],
    containers: [
      makeContainer({ name: "web", image: "nginx:1.25", ports: [{ host: 8080, container: 80 }], since: "3 days" }),
      makeContainer({ name: "db", image: "postgres:16", env: { POSTGRES_PASSWORD: "secret" }, mounts: [{ source: "pgdata", target: "/var/lib/postgresql/data", kind: "volume" }], since: "3 days" }),
      makeContainer({ name: "build-tmp", image: "legacy/app:0.9", status: "exited", exitCode: 0, since: "6 days" }),
      makeContainer({ name: "test-run", image: "nginx:1.25", status: "exited", exitCode: 1, since: "4 days" }),
      makeContainer({ name: "old-api", image: "shop/api:1.2", status: "exited", exitCode: 137, since: "9 days" }),
    ],
  }),
  goals: [
    { kind: "noExited", label: "No stopped containers are left" },
    { kind: "noDangling", label: "No dangling images are left" },
    { kind: "running", name: "web", label: "web is still running" },
    { kind: "running", name: "db", label: "db is still running" },
    { kind: "imageExists", image: "shop/api:1.2", label: "Image shop/api:1.2 is kept" },
    { kind: "volumeExists", name: "pgdata", label: "Volume pgdata is kept" },
    { kind: "volumeExists", name: "old-cache", label: "Volume old-cache is kept" },
  ],
  par: 2,
  hints: ["docker system df shows what takes the space. docker ps -a shows the stopped containers.", "docker system prune -f removes stopped containers and dangling images. Be careful with -a (all unused images) and --volumes: they also remove things you must keep.", "Run: docker system prune -f"],
  solution: ["docker system df", "docker system prune -f"],
};

const COMPOSE_FILE = [
  "services:",
  "  web:",
  "    image: shop/web:2.0",
  "    ports: [\"8080:3000\"]",
  "    environment:",
  "      DB_HOST: db",
  "    depends_on: [db]",
  "  db:",
  "    image: postgres:16",
  "    environment:",
  "      POSTGRES_PASSWORD: secret",
  "    volumes:",
  "      - pgdata:/var/lib/postgresql/data",
  "volumes:",
  "  pgdata:",
];

const composeConflict: FixRound = {
  id: "docker-compose-conflict", mode: "fix", difficulty: "hard",
  title: "The stack will not come up",
  brief: "docker-compose.yml describes a web app and its database (project shop). Start the whole stack with compose and make the app answer on localhost:8080. Type cat docker-compose.yml to read the file.",
  world: world({
    images: [makeImage("shop/web:2.0"), makeImage("postgres:16"), makeImage("nginx:1.25")],
    containers: [makeContainer({ name: "scratch", image: "nginx:1.25", ports: [{ host: 8080, container: 80 }], logs: ["nginx: [notice] start worker processes"], since: "1 day" })],
    compose: {
      project: "shop",
      file: COMPOSE_FILE,
      services: [
        { name: "web", image: "shop/web:2.0", ports: ["8080:3000"], env: { DB_HOST: "db" }, volumes: [], dependsOn: ["db"] },
        { name: "db", image: "postgres:16", ports: [], env: { POSTGRES_PASSWORD: "secret" }, volumes: ["pgdata:/var/lib/postgresql/data"], dependsOn: [] },
      ],
    },
  }),
  goals: [
    { kind: "running", name: "shop-db-1", label: "shop-db-1 is running" },
    { kind: "running", name: "shop-web-1", label: "shop-web-1 is running" },
    { kind: "served", name: "shop-web-1", contains: "database", label: "curl localhost:8080 says it is connected to the database" },
  ],
  par: 4,
  hints: ["Start with docker compose up -d, then docker compose ps -a or docker ps -a to see what did not start.", "The web service wants host port 8080, but the container scratch holds it. Stop it: docker stop scratch", "After stopping scratch, run docker compose up -d again. It starts what is missing."],
  solution: ["docker compose up -d", "docker ps -a", "docker stop scratch", "docker compose up -d"],
};

// ---------------------------------------------------------------------------------------------
// Build rounds.

const piece = (id: string, text: string): BuildPiece => ({ id, text });
const NODE_APP: AppSpec = { runtime: "node", manifest: "package*.json", defaultPort: 3000, start: ["node server.js", "npm start"] };

const buildNodeOrder: BuildRound = {
  id: "docker-build-node-order", mode: "build", difficulty: "easy", kind: "dockerfile",
  title: "Order a Node Dockerfile",
  brief: "Put the lines of this Node app's Dockerfile in the right order. It must build, answer on port 3000, and rebuild fast after a code change (10 seconds or less).",
  app: { ...NODE_APP },
  pieces: [
    piece("cp-src", "COPY . ."), piece("cmd", 'CMD ["node", "server.js"]'), piece("npm-ci", "RUN npm ci"), piece("from", "FROM node:20-slim"),
    piece("expose", "EXPOSE 3000"), piece("cp-pkg", "COPY package*.json ./"), piece("workdir", "WORKDIR /app"),
  ],
  goals: [
    { kind: "builds", label: "The image builds" },
    { kind: "reachable", port: 3000, label: "The app answers on port 3000" },
    { kind: "rebuild", maxSec: 10, label: "A rebuild after a code change takes 10 seconds or less" },
  ],
  par: 7,
  hints: ["FROM always comes first. WORKDIR comes before any COPY.", "Docker reuses a layer when nothing above it changed. Copy only package*.json first, run npm ci, and only then copy the rest of the code.", "Order: FROM, WORKDIR, COPY package*.json, RUN npm ci, COPY . ., EXPOSE, CMD."],
  solution: ["from", "workdir", "cp-pkg", "npm-ci", "cp-src", "expose", "cmd"],
};

const buildSlim: BuildRound = {
  id: "docker-build-slim", mode: "build", difficulty: "easy", kind: "dockerfile",
  title: "Pick the right base image",
  brief: "Build a small image for this Python app. Choose one base image and put the lines in order. The image must be under 400 MB, answer on port 8000, and rebuild fast.",
  app: { runtime: "python", manifest: "requirements.txt", defaultPort: 8000, start: ["python app.py"] },
  pieces: [
    piece("from-full", "FROM python:3.12"), piece("pip", "RUN pip install -r requirements.txt"), piece("expose", "EXPOSE 8000"), piece("from-ubuntu", "FROM ubuntu:22.04"),
    piece("cp-src", "COPY . ."), piece("from-slim", "FROM python:3.12-slim"), piece("cmd", 'CMD ["python", "app.py"]'), piece("cp-req", "COPY requirements.txt ./"), piece("workdir", "WORKDIR /app"),
  ],
  goals: [
    { kind: "builds", label: "The image builds" },
    { kind: "reachable", port: 8000, label: "The app answers on port 8000" },
    { kind: "size", maxMb: 400, label: "The image is under 400 MB" },
    { kind: "rebuild", maxSec: 10, label: "A rebuild takes 10 seconds or less" },
  ],
  par: 7,
  hints: ["Use only one FROM. python:3.12 is the full image (about 1 GB). ubuntu has no Python at all.", "python:3.12-slim has Python and is small. Copy requirements.txt, install, then copy the code.", "Order: FROM python:3.12-slim, WORKDIR, COPY requirements.txt, RUN pip install, COPY . ., EXPOSE 8000, CMD."],
  solution: ["from-slim", "workdir", "cp-req", "pip", "cp-src", "expose", "cmd"],
};

const buildPortEnv: BuildRound = {
  id: "docker-build-port-env", mode: "build", difficulty: "easy", kind: "dockerfile",
  title: "Set the port and the start command",
  brief: "The platform sends traffic to port 8080. This Node app listens on the port in the PORT variable (3000 if it is not set). Choose the lines so the app answers on 8080.",
  app: { ...NODE_APP, portEnv: "PORT", start: ["node server.js"] },
  pieces: [
    piece("env-3000", "ENV PORT=3000"), piece("cp-pkg", "COPY package*.json ./"), piece("cmd-dev", 'CMD ["npm", "run", "dev"]'), piece("expose-3000", "EXPOSE 3000"),
    piece("from", "FROM node:20-slim"), piece("npm-ci", "RUN npm ci"), piece("env-8080", "ENV PORT=8080"), piece("workdir", "WORKDIR /app"),
    piece("cmd-node", 'CMD ["node", "server.js"]'), piece("expose-8080", "EXPOSE 8080"), piece("cp-src", "COPY . ."),
  ],
  goals: [
    { kind: "builds", label: "The image builds" },
    { kind: "reachable", port: 8080, label: "The app answers on port 8080" },
  ],
  par: 8,
  hints: ["The app listens on the port in PORT, and EXPOSE must name that same port. Use 8080 for both.", "npm run dev needs dev tools that are not installed in a production image. Start the server with node.", "FROM, WORKDIR, COPY package*.json, RUN npm ci, COPY . ., ENV PORT=8080, EXPOSE 8080, CMD node server.js."],
  solution: ["from", "workdir", "cp-pkg", "npm-ci", "cp-src", "env-8080", "expose-8080", "cmd-node"],
};

const buildPythonService: BuildRound = {
  id: "docker-build-python-service", mode: "build", difficulty: "medium", kind: "dockerfile",
  title: "A small Python service on port 9000",
  brief: "This Python service listens on the port in the PORT variable (5000 if it is not set). Build a small image (under 250 MB) that answers on port 9000 and rebuilds fast after a code change.",
  app: { runtime: "python", manifest: "requirements.txt", defaultPort: 5000, portEnv: "PORT", start: ["python app.py"] },
  pieces: [
    piece("expose-5000", "EXPOSE 5000"), piece("from-full", "FROM python:3.12"), piece("cp-src", "COPY . ."), piece("env-9000", "ENV PORT=9000"),
    piece("pip", "RUN pip install --no-cache-dir -r requirements.txt"), piece("cmd-flask", 'CMD ["flask", "run"]'), piece("from-slim", "FROM python:3.12-slim"),
    piece("expose-9000", "EXPOSE 9000"), piece("workdir", "WORKDIR /srv"), piece("cp-req", "COPY requirements.txt ./"), piece("cmd", 'CMD ["python", "app.py"]'),
  ],
  goals: [
    { kind: "builds", label: "The image builds" },
    { kind: "reachable", port: 9000, label: "The service answers on port 9000" },
    { kind: "size", maxMb: 250, label: "The image is under 250 MB" },
    { kind: "rebuild", maxSec: 10, label: "A rebuild after a code change takes 10 seconds or less" },
  ],
  par: 8,
  hints: ["python:3.12 is about 1 GB. The slim variant is far smaller. Use one FROM only.", "The service reads PORT, so set ENV PORT=9000 and EXPOSE 9000. Copy requirements.txt and install before you copy the code.", "FROM python:3.12-slim, WORKDIR, COPY requirements.txt, RUN pip install, COPY . ., ENV PORT=9000, EXPOSE 9000, CMD python app.py."],
  solution: ["from-slim", "workdir", "cp-req", "pip", "cp-src", "env-9000", "expose-9000", "cmd"],
};

function slotPiece(slot: string, id: string, text: string, facts: ComposeFact[] = []): BuildPiece {
  return { id, slot, text, facts };
}

const basicSlots: BuildSlot[] = [
  { id: "web-port", label: "web: published port", indent: 4 },
  { id: "web-env", label: "web: database host", indent: 4 },
  { id: "web-dep", label: "web: start order", indent: 4 },
  { id: "db-env", label: "db: settings", indent: 4 },
  { id: "db-vol", label: "db: where the data lives", indent: 4 },
  { id: "top-vol", label: "named volumes", indent: 0 },
];
const basicSkeleton: ComposeLine[] = [
  { text: "services:" }, { text: "  web:" }, { text: "    image: shop/web:2.0" }, { slot: "web-port" }, { slot: "web-env" }, { slot: "web-dep" },
  { text: "  db:" }, { text: "    image: postgres:16" }, { slot: "db-env" }, { slot: "db-vol" }, { slot: "top-vol" },
];

const buildComposeBasic: BuildRound = {
  id: "docker-build-compose-basic", mode: "build", difficulty: "medium", kind: "compose",
  title: "Wire the web app to its database",
  brief: "Fill the blanks of this compose file. web listens on port 3000 inside its container and must answer on localhost:8080. It reaches the database by the name db, so db must start first. The database data must survive on the named volume pgdata.",
  slots: basicSlots, skeleton: basicSkeleton,
  pieces: [
    slotPiece("web-port", "wp-ok", 'ports: ["8080:3000"]', [{ service: "web", key: "port", value: "8080:3000" }]),
    slotPiece("web-port", "wp-same", 'ports: ["8080:8080"]', [{ service: "web", key: "port", value: "8080:8080" }]),
    slotPiece("web-port", "wp-swap", 'ports: ["3000:8080"]', [{ service: "web", key: "port", value: "3000:8080" }]),
    slotPiece("web-env", "we-localhost", "environment: [DB_HOST=localhost]", [{ service: "web", key: "env", value: "DB_HOST=localhost" }]),
    slotPiece("web-env", "we-db", "environment: [DB_HOST=db]", [{ service: "web", key: "env", value: "DB_HOST=db" }]),
    slotPiece("web-env", "we-postgres", "environment: [DB_HOST=postgres]", [{ service: "web", key: "env", value: "DB_HOST=postgres" }]),
    slotPiece("web-dep", "wd-cache", "depends_on: [cache]", [{ service: "web", key: "depends", value: "cache" }]),
    slotPiece("web-dep", "wd-db", "depends_on: [db]", [{ service: "web", key: "depends", value: "db" }]),
    slotPiece("web-dep", "wd-restart", "restart: always"),
    slotPiece("db-env", "de-db", "environment: [POSTGRES_DB=shop]", [{ service: "db", key: "env", value: "POSTGRES_DB=shop" }]),
    slotPiece("db-env", "de-empty", "environment: [POSTGRES_PASSWORD=]", [{ service: "db", key: "env", value: "POSTGRES_PASSWORD=" }]),
    slotPiece("db-env", "de-ok", "environment: [POSTGRES_PASSWORD=secret]", [{ service: "db", key: "env", value: "POSTGRES_PASSWORD=secret" }]),
    slotPiece("db-vol", "dv-data", 'volumes: ["pgdata:/data"]', [{ service: "db", key: "volume", value: "pgdata:/data" }]),
    slotPiece("db-vol", "dv-ok", 'volumes: ["pgdata:/var/lib/postgresql/data"]', [{ service: "db", key: "volume", value: "pgdata:/var/lib/postgresql/data" }]),
    slotPiece("db-vol", "dv-bind", 'volumes: ["./pg:/tmp/pg"]', [{ service: "db", key: "volume", value: "./pg:/tmp/pg" }]),
    slotPiece("top-vol", "tv-none", "# no named volumes"),
    slotPiece("top-vol", "tv-data", "volumes: { data: {} }", [{ service: "", key: "decl-volume", value: "data" }]),
    slotPiece("top-vol", "tv-pgdata", "volumes: { pgdata: {} }", [{ service: "", key: "decl-volume", value: "pgdata" }]),
  ],
  stack: {
    services: {
      web: { image: "shop/web:2.0", sizeMb: 212, port: 3000, hostEnv: { key: "DB_HOST", value: "db" }, mustDependOn: ["db"], mustReach: ["db"] },
      db: { image: "postgres:16", sizeMb: 432, port: 5432, requiredEnv: ["POSTGRES_PASSWORD"], dataPath: "/var/lib/postgresql/data" },
    },
    publish: { service: "web", host: 8080 },
  },
  goals: [
    { kind: "builds", label: "The compose file is valid" },
    { kind: "runs", label: "Both services start and stay up" },
    { kind: "reachable", port: 8080, label: "localhost:8080 answers" },
    { kind: "persists", label: "The database data is on a volume" },
  ],
  par: 6,
  hints: ["The port line is HOST:CONTAINER. web listens on 3000 inside, so the right side must be 3000.", "Inside a compose project, services find each other by service name: DB_HOST=db. depends_on makes db start first. Postgres needs a non-empty POSTGRES_PASSWORD.", "Mount pgdata at /var/lib/postgresql/data, and declare pgdata under the top level volumes."],
  solution: ["web-port:wp-ok", "web-env:we-db", "web-dep:wd-db", "db-env:de-ok", "db-vol:dv-ok", "top-vol:tv-pgdata"],
};

const tierSlots: BuildSlot[] = [
  { id: "web-port", label: "web: published port", indent: 4 },
  { id: "web-net", label: "web: networks", indent: 4 },
  { id: "api-env", label: "api: database host", indent: 4 },
  { id: "api-net", label: "api: networks", indent: 4 },
  { id: "db-env", label: "db: settings", indent: 4 },
  { id: "db-vol", label: "db: where the data lives", indent: 4 },
  { id: "db-net", label: "db: networks", indent: 4 },
  { id: "top-net", label: "networks", indent: 0 },
  { id: "top-vol", label: "named volumes", indent: 0 },
];
const tierSkeleton: ComposeLine[] = [
  { text: "services:" },
  { text: "  web:" }, { text: "    image: nginx:1.25-alpine" }, { text: "    depends_on: [api]" }, { slot: "web-port" }, { slot: "web-net" },
  { text: "  api:" }, { text: "    image: shop/api:1.2" }, { text: "    depends_on: [db]" }, { slot: "api-env" }, { slot: "api-net" },
  { text: "  db:" }, { text: "    image: postgres:16" }, { slot: "db-env" }, { slot: "db-vol" }, { slot: "db-net" },
  { slot: "top-net" }, { slot: "top-vol" },
];

const net = (slot: string, id: string, service: string, nets: string[]) =>
  slotPiece(slot, id, `networks: [${nets.join(", ")}]`, nets.map((n) => ({ service, key: "network" as const, value: n })));

const buildComposeTiers: BuildRound = {
  id: "docker-build-compose-tiers", mode: "build", difficulty: "hard", kind: "compose",
  title: "Three tiers on two networks",
  brief: "Wire web, api and db. web must reach api, api must reach db, but web must not reach db directly: use the networks front and back. web answers on localhost:8080 (nginx listens on port 80). api reaches the database by the name db. The data stays on the volume pgdata.",
  slots: tierSlots, skeleton: tierSkeleton,
  fixed: [{ service: "web", key: "depends", value: "api" }, { service: "api", key: "depends", value: "db" }],
  pieces: [
    slotPiece("web-port", "wp-ok", 'ports: ["8080:80"]', [{ service: "web", key: "port", value: "8080:80" }]),
    slotPiece("web-port", "wp-same", 'ports: ["8080:8080"]', [{ service: "web", key: "port", value: "8080:8080" }]),
    slotPiece("web-port", "wp-swap", 'ports: ["80:8080"]', [{ service: "web", key: "port", value: "80:8080" }]),
    net("web-net", "wn-both", "web", ["front", "back"]), net("web-net", "wn-front", "web", ["front"]), net("web-net", "wn-back", "web", ["back"]),
    slotPiece("api-env", "ae-local", "environment: [DB_HOST=localhost]", [{ service: "api", key: "env", value: "DB_HOST=localhost" }]),
    slotPiece("api-env", "ae-db", "environment: [DB_HOST=db]", [{ service: "api", key: "env", value: "DB_HOST=db" }]),
    slotPiece("api-env", "ae-pg", "environment: [DB_HOST=postgres]", [{ service: "api", key: "env", value: "DB_HOST=postgres" }]),
    net("api-net", "an-front", "api", ["front"]), net("api-net", "an-back", "api", ["back"]), net("api-net", "an-both", "api", ["front", "back"]),
    slotPiece("db-env", "de-ok", "environment: [POSTGRES_PASSWORD=secret]", [{ service: "db", key: "env", value: "POSTGRES_PASSWORD=secret" }]),
    slotPiece("db-env", "de-user", "environment: [POSTGRES_USER=shop]", [{ service: "db", key: "env", value: "POSTGRES_USER=shop" }]),
    slotPiece("db-env", "de-empty", "environment: [POSTGRES_PASSWORD=]", [{ service: "db", key: "env", value: "POSTGRES_PASSWORD=" }]),
    slotPiece("db-vol", "dv-ok", 'volumes: ["pgdata:/var/lib/postgresql/data"]', [{ service: "db", key: "volume", value: "pgdata:/var/lib/postgresql/data" }]),
    slotPiece("db-vol", "dv-tmp", 'volumes: ["pgdata:/tmp"]', [{ service: "db", key: "volume", value: "pgdata:/tmp" }]),
    slotPiece("db-vol", "dv-bind", 'volumes: ["./pg:/var/lib/postgresql/data"]', [{ service: "db", key: "volume", value: "./pg:/var/lib/postgresql/data" }]),
    net("db-net", "dn-front", "db", ["front"]), net("db-net", "dn-both", "db", ["front", "back"]), net("db-net", "dn-back", "db", ["back"]),
    slotPiece("top-net", "tn-front", "networks: { front: {} }", [{ service: "", key: "decl-network", value: "front" }]),
    slotPiece("top-net", "tn-both", "networks: { front: {}, back: {} }", [{ service: "", key: "decl-network", value: "front" }, { service: "", key: "decl-network", value: "back" }]),
    slotPiece("top-net", "tn-back", "networks: { back: {} }", [{ service: "", key: "decl-network", value: "back" }]),
    slotPiece("top-vol", "tv-pgdata", "volumes: { pgdata: {} }", [{ service: "", key: "decl-volume", value: "pgdata" }]),
    slotPiece("top-vol", "tv-data", "volumes: { data: {} }", [{ service: "", key: "decl-volume", value: "data" }]),
    slotPiece("top-vol", "tv-none", "# no named volumes"),
  ],
  stack: {
    services: {
      web: { image: "nginx:1.25-alpine", sizeMb: 43, port: 80, mustReach: ["api"] },
      api: { image: "shop/api:1.2", sizeMb: 164, port: 4000, hostEnv: { key: "DB_HOST", value: "db" }, mustReach: ["db"], mustDependOn: ["db"] },
      db: { image: "postgres:16", sizeMb: 432, port: 5432, requiredEnv: ["POSTGRES_PASSWORD"], dataPath: "/var/lib/postgresql/data" },
    },
    publish: { service: "web", host: 8080 },
    isolate: ["web", "db"],
  },
  goals: [
    { kind: "builds", label: "The compose file is valid" },
    { kind: "runs", label: "All three services start and stay up" },
    { kind: "reachable", port: 8080, label: "localhost:8080 answers" },
    { kind: "isolated", label: "web cannot reach db directly" },
    { kind: "persists", label: "The database data is on a volume" },
  ],
  par: 9,
  hints: ["Networks: web needs front (to reach api), db needs back, and api sits on both so it can talk to each side. Declare every network you use at the top level.", "The port line is HOST:CONTAINER. nginx listens on 80 inside. api reaches the database as DB_HOST=db, not localhost.", "web: 8080:80, front. api: DB_HOST=db, front and back. db: POSTGRES_PASSWORD=secret, pgdata at /var/lib/postgresql/data, back. Declare front, back and pgdata."],
  solution: ["web-port:wp-ok", "web-net:wn-front", "api-env:ae-db", "api-net:an-both", "db-env:de-ok", "db-vol:dv-ok", "db-net:dn-back", "top-net:tn-both", "top-vol:tv-pgdata"],
};

/** Every round of the game. Easy leans to build, medium and hard to fix. */
export const POOL: readonly DockerRound[] = [
  buildNodeOrder, buildSlim, buildPortEnv, startStopped, wrongPort,
  missingEnv, portTaken, lostData, noNetwork, buildComposeBasic, buildPythonService,
  oomLoop, newRelease, diskFull, composeConflict, buildComposeTiers,
];
