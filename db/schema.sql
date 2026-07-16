DROP TABLE IF EXISTS task_updates CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS epics CASCADE;
DROP TABLE IF EXISTS project_members CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS workspace_members CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS users CASCADE;


CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    google_id TEXT UNIQUE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE workspaces (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE workspace_members (
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'contributor')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (workspace_id, user_id)
);


CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    owner_id INTEGER NOT NULL REFERENCES users(id),

    name TEXT NOT NULL,

    status TEXT NOT NULL CHECK (
        status IN ('planning', 'active', 'completed', 'archived')
    ),

    start_date DATE,
    end_date DATE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE project_members (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    PRIMARY KEY (project_id, user_id)
);


CREATE TABLE epics (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    name TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,

    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    epic_id INTEGER REFERENCES epics(id) ON DELETE SET NULL,

    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,

    title TEXT NOT NULL,
    description TEXT,

    status TEXT NOT NULL CHECK (
        status IN ('todo', 'in_progress', 'review', 'blocked', 'completed')
    ),

    priority TEXT NOT NULL CHECK (
        priority IN ('low', 'medium', 'high', 'urgent')
    ),

    due_date DATE,

    blocked_by_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE task_updates (
    id SERIAL PRIMARY KEY,

    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    update_text TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);