<img width="1200" height="260" alt="banner-backend" src="https://github.com/user-attachments/assets/fdf4f826-2b83-4666-9f58-5bbabb22786c" />

<div align="center">


<br/>

![Node](https://img.shields.io/badge/Node.js-22%2B-8fb87a?style=for-the-badge&labelColor=4a5765)
![Express](https://img.shields.io/badge/Express-5-93c591?style=for-the-badge&labelColor=4a5765)
![Postgres](https://img.shields.io/badge/PostgreSQL-via%20pg-819aa3?style=for-the-badge&labelColor=504d63)
![Tests](https://img.shields.io/badge/Vitest-tested-8fb87a?style=for-the-badge&labelColor=4a5765)
![License](https://img.shields.io/badge/status-in%20development-504d63?style=for-the-badge&labelColor=819aa3)

</div>

<br/>

## Table of Contents

- [Overview](#overview)
- [Core Features](#core-features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Known Limitations](#known-limitations--notes-for-contributors)
- [Roadmap](#roadmap)

<br/>

## Overview

**Optim** is a lightweight, fast, focused project management API — the engine behind a tool built to compete with Jira, Monday.com, and GitHub Projects. Its whole design philosophy starts from one question:

> **What's the minimum number of clicks this action actually needs?**

This repository is the **Express + PostgreSQL backend**. It exposes the REST API that powers workspaces, projects, boards, and the one-click quick-assign experience that differentiates Optim from heavier competitors.

### Problem Statement

Every working professional consulted before this project started had the same complaint: simple actions in tools like Jira are buried behind unnecessary steps. Assigning a task shouldn't require opening a dropdown, confirming a selection, and waiting on a save — it should be a single click from the board itself.

### Goals

| | |
|---|---|
| 🎯 | Ship a fully usable MVP: accounts, workspaces, projects, boards, and collaboration tools |
| ⚡ | Keep the API fast and predictable — no unnecessary round-trips for single-step actions |
| 🧩 | Support real team workflows: multiple workspaces per user, multiple projects per workspace, granular roles at each level |
| 🚀 | Ship a stretch-goal path beyond the MVP: sprints, real-time updates, notifications, automation, analytics |

<br/>

## Core Features

<table>
<tr><td>⚡</td><td><b>One-click quick-assign</b></td><td>The differentiator this project is built around — assigning or reassigning a task happens directly from the card, no modal chain required.</td></tr>
<tr><td>🗂️</td><td><b>Real hierarchy</b></td><td>Workspaces → Projects → Boards → Columns → Tasks. Every project gets default columns (To Do, In Progress, In Review, Done) automatically.</td></tr>
<tr><td>🔐</td><td><b>Dual authentication</b></td><td>Google OAuth or local username/password. Signing up locally, then logging in with Google using the same email, links the two accounts automatically instead of duplicating them.</td></tr>
<tr><td>🛡️</td><td><b>Two-tier roles</b></td><td>Workspace roles (admin / member) and project roles (lead / member) — a project can never be left with zero leads.</td></tr>
<tr><td>🔑</td><td><b>Human-readable project keys</b></td><td>Every project gets a short key (e.g. <code>ENG</code>) so tasks can be referenced like <code>ENG-42</code>.</td></tr>
<tr><td>🕓</td><td><b>Automatic activity feed</b></td><td>Every status change, assignment, and comment is logged automatically — a clear history of what happened and when.</td></tr>
</table>

<br/>

## Tech Stack

<div align="center">

![Node](https://img.shields.io/badge/Node.js%2022+-runtime-8fb87a?style=flat-square&labelColor=4a5765)
![Express](https://img.shields.io/badge/Express%205-routing-93c591?style=flat-square&labelColor=4a5765)
![pg](https://img.shields.io/badge/PostgreSQL-database-819aa3?style=flat-square&labelColor=504d63)
![bcrypt](https://img.shields.io/badge/bcrypt-hashing-8fb87a?style=flat-square&labelColor=4a5765)
![jsonwebtoken](https://img.shields.io/badge/JWT-auth-93c591?style=flat-square&labelColor=4a5765)
![morgan](https://img.shields.io/badge/morgan-logging-819aa3?style=flat-square&labelColor=504d63)
![cors](https://img.shields.io/badge/cors-cross--origin-8fb87a?style=flat-square&labelColor=4a5765)
![Vitest](https://img.shields.io/badge/Vitest-testing-93c591?style=flat-square&labelColor=4a5765)

</div>

| Tool | Purpose |
|---|---|
| **Node.js 22+** | Runtime — used natively for `--env-file` and `--watch`, no `dotenv`/`nodemon` dependency needed |
| **Express 5** | HTTP server / routing. Auto-forwards rejected promises from async route handlers to error middleware |
| **PostgreSQL** via `pg` | Database |
| **bcrypt** | Password hashing |
| **jsonwebtoken** | JWT issuance & verification |
| **morgan** | Request logging |
| **cors** | Cross-origin requests from the frontend |
| **Vitest** | Testing |

### Workflow

Each teammate forks the repo to their own GitHub account, clones their fork, and opens pull requests back into the team lead's repo. Local copies stay in sync with teammates' merged work via a separate `upstream` remote:

```bash
git fetch upstream && git merge upstream/main
```

> Plain `git pull` only syncs a personal fork — it won't pull in teammates' merged changes.

<br/>

## Architecture

### Folder Structure

```
Optim-backend/
├── api/
│   ├── auth.routes.js         # signup, login, Google OAuth, /me
│   ├── workspaces.routes.js   # workspace CRUD, invites, members, nested project creation/listing
│   └── projects.routes.js     # project detail/update/delete, project members
├── db/
│   ├── client.js              # single pg.Client connection
│   ├── schema.sql             # full schema (DROP + CREATE, run fresh each time)
│   ├── seed.js                # sample data for local development
│   └── queries/
│       ├── projects.js        # project + project_members query functions
│       └── boards.js          # board/default-columns creation
├── middleware/
│   └── auth.js                # requireAuth — verifies JWT, attaches req.user
├── app.js                     # Express app: middleware, route mounting, error handler
├── server.js                  # connects to Postgres, starts the HTTP listener
└── package.json
```

> Subpath imports (`#api/*`, `#db/*`, `#middleware/*`) resolve via the `imports` field in `package.json`, so internal modules never need long relative `../../` paths.

### System Design

**Request flow:**

```
Browser
  │
  ▼
React app (AuthContext attaches a JWT to every API request)
  │  fetch()
  ▼
Express app.js
  │  cors → morgan → express.json()
  ▼
api/*.routes.js
  │  requireAuth middleware verifies the JWT
  ▼
db/queries/*.js  (or inline queries in route handlers)
  │
  ▼
PostgreSQL
```

**Authentication flow:**

Optim supports two independent ways to reach the same account:

- **Local** — `POST /auth/signup` / `POST /auth/login` with a username/password, hashed with bcrypt.
- **Google** — the frontend obtains an access token via `useGoogleLogin()`, then sends only that token to `POST /auth/google`. The backend verifies it directly against Google's own userinfo endpoint server-side — the client's claimed profile data is never trusted directly. If the resulting email matches an existing local account, the Google identity is linked onto that same row instead of creating a duplicate user.

Either path ends the same way: the backend issues its own JWT (`{ sub: userId }`), which the frontend stores and attaches to every subsequent request as `Authorization: Bearer <token>`.

### Database Schema (core tables)

```
users
  id, username, password, name, email, google_id, avatar_url
  (username+password is optional, google_id is optional --
   a CHECK constraint requires at least one login path to exist)

workspaces
  id, name, owner_id -> users, created_at

workspace_members
  id, workspace_id -> workspaces, user_id -> users, role ('admin' | 'member')

projects
  id, workspace_id -> workspaces, name, key, description, created_at
  (key is unique per workspace)

project_members
  id, project_id -> projects, user_id -> users, role ('lead' | 'member')

boards
  id, project_id -> projects, name

columns
  id, board_id -> boards, name, position, color
```

> Every project automatically gets a board with four default columns (**To Do**, **In Progress**, **In Review**, **Done**) at creation time.

<br/>

## Getting Started

```bash
cd Optim-backend
npm install
cp example.env .env      # fill in DATABASE_URL, JWT_SECRET, etc.
npm run db:schema        # creates all tables fresh
npm run db:seed          # optional -- adds sample data
npm run dev              # starts the API with --watch
```

> ⚠️ Run all `npm run` commands from the **project root**, not a subdirectory.

<br/>

## Known Limitations / Notes for Contributors

- `db/client.js` is a **single `pg.Client`**, not a connection pool. Multi-step writes (e.g. creating a project, its membership row, its board, and its columns all together) can't be wrapped in a real `BEGIN`/`COMMIT` transaction without risking interleaving with another request. These currently run as sequential, non-transactional inserts — worth revisiting if it ever causes a real issue.
- An unsaved file will surface as a confusing `SyntaxError` about a missing named export at runtime — if you see that error, check that the file was actually saved to disk before digging further.

<br/>

## Roadmap

Beyond the MVP:

- [ ] Sprints & backlog view
- [ ] Real-time board updates via WebSockets
- [ ] In-app / email notifications
- [ ] @mentions
- [ ] File attachments
- [ ] Automation rules
- [ ] Analytics dashboard
- [ ] GitHub integration
- [ ] Dark mode

<br/>

<div align="center">
<sub>Built by the Optim team — <b>Work, Optimized.</b></sub>
</div>
