# Chip3D Platform

Web-based 3D chip design platform with integrated FP (Floorplanning), thermal simulation, synthesis, place, CTS, and routing capabilities.

## Architecture

- **apps/web** — Next.js frontend with interactive 3D FP editor & thermal viewer
- **apps/api** — Express REST API with Prisma/PostgreSQL
- **apps/worker** — BullMQ job runner (FP/thermal core engines + plugin executor)
- **packages/sdk** — Shared TypeScript types (Flow/Step/FP/Thermal/Plugin specs)
- **packages/fp-engine** — Self-developed 3D floorplanning engine (partition, TSV/HB planning, die-level layout)
- **packages/thermal-engine** — Self-developed thermal simulation engine (steady-state heat conduction)
- **packages/eda-plugins** — Plugin interface & built-in plugins (mock + real tool integrations)
- **infra/** — Docker Compose dev environment (PostgreSQL, Redis)

## Quick Start

```bash
# Install dependencies
pnpm install

# Start infrastructure (Postgres + Redis)
docker compose -f infra/docker-compose.yml up -d

# Setup database
cd apps/api && pnpm db:push && cd ../..

# Start all services in dev mode
pnpm dev
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| 3D Rendering | Three.js, React Three Fiber, drei |
| Backend API | Express, TypeScript |
| Database | PostgreSQL (Prisma ORM) |
| Job Queue | BullMQ + Redis |
| Self-developed Engines | TypeScript (FP partition/TSV/HB + Thermal solver) |
| Plugin System | Container/CLI-based EDA tool integration |

## Core Features

- **3D Floorplanning (self-developed)**: Module partition across dies, TSV/HB planning, die-level layout
- **Thermal Simulation (self-developed)**: Steady-state heat conduction solver with TSV/HB coupling
- **Interactive 3D Editor**: Drag-and-drop partition editing, module placement, TSV/HB region adjustment
- **Thermal Visualization**: 3D temperature field rendering, 2D slice heatmaps, hotspot analysis
- **Flow Orchestration**: DAG-based workflow with configurable steps
- **Plugin System**: Integrate external EDA tools (synthesis, place, CTS, route) via containers
