import { Router } from "express";
import { pool } from "#db/pool";
import { requireAuth } from "#middleware/auth";

const router = Router();
router.use(requireAuth);

const DEFAULT_COLUMNS = ["To Do", "In Progress", "In Review", "Done"];

async function getWorkspaceMembership(workspaceId, userId) {
  const {
    rows: [m],
  } = await pool.query(
    "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    [workspaceId, userId],
  );
  return m || null;
}

async function getProjectMembership(projectId, userId) {
  const {
    rows: [m],
  } = await pool.query(
    "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId],
  );
  return m || null;
}

async function getProject(projectId) {
  const {
    rows: [project],
  } = await pool.query(
    "SELECT id, workspace_id, name, key, description, created_at FROM projects WHERE id = $1",
    [projectId],
  );
  return project || null;
}

// POST /api/projects — create project; creates default board + columns.
// body: { workspaceId, name, key, description? }
router.post("/", async (req, res) => {
  const { workspaceId, name, key, description } = req.body;
  if (!workspaceId || !name || !key) {
    return res
      .status(400)
      .json({ error: "workspaceId, name, and key are required" });
  }

  const membership = await getWorkspaceMembership(workspaceId, req.user.sub);
  if (!membership) {
    return res
      .status(403)
      .json({ error: "You're not a member of that workspace" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const {
      rows: [project],
    } = await client.query(
      `INSERT INTO projects (workspace_id, name, key, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, workspace_id, name, key, description, created_at`,
      [workspaceId, name, key.toUpperCase(), description || null],
    );

    await client.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'lead')",
      [project.id, req.user.sub],
    );

    const {
      rows: [board],
    } = await client.query(
      "INSERT INTO boards (project_id, name) VALUES ($1, 'Main Board') RETURNING id, name",
      [project.id],
    );

    for (let i = 0; i < DEFAULT_COLUMNS.length; i++) {
      await client.query(
        "INSERT INTO columns (board_id, name, position) VALUES ($1, $2, $3)",
        [board.id, DEFAULT_COLUMNS[i], i],
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ project: { ...project, board } });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      return res
        .status(409)
        .json({
          error: "A project with that key already exists in this workspace",
        });
    }
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/projects?workspace_id= — list projects in a workspace
router.get("/", async (req, res) => {
  const { workspace_id: workspaceId } = req.query;
  if (!workspaceId)
    return res
      .status(400)
      .json({ error: "workspace_id query param is required" });

  const membership = await getWorkspaceMembership(workspaceId, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of that workspace" });

  const { rows: projects } = await pool.query(
    `SELECT p.id, p.name, p.key, p.description, p.created_at,
            COUNT(t.id) FILTER (WHERE t.id IS NOT NULL) AS open_task_count
     FROM projects p
     LEFT JOIN tasks t ON t.project_id = p.id
     WHERE p.workspace_id = $1
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [workspaceId],
  );
  res.json({ projects });
});

// GET /api/projects/:id
router.get("/:id", async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const membership = await getProjectMembership(project.id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  res.json({ project: { ...project, myRole: membership.role } });
});

// PATCH /api/projects/:id — project leads only
router.patch("/:id", async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const membership = await getProjectMembership(project.id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });
  if (membership.role !== "lead")
    return res
      .status(403)
      .json({ error: "Only project leads can update this project" });

  const { name, description } = req.body;
  const {
    rows: [updated],
  } = await pool.query(
    `UPDATE projects SET name = COALESCE($1, name), description = COALESCE($2, description)
     WHERE id = $3
     RETURNING id, workspace_id, name, key, description, created_at`,
    [name, description, project.id],
  );
  res.json({ project: updated });
});

// DELETE /api/projects/:id — project leads only
router.delete("/:id", async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const membership = await getProjectMembership(project.id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });
  if (membership.role !== "lead")
    return res
      .status(403)
      .json({ error: "Only project leads can delete this project" });

  await pool.query("DELETE FROM projects WHERE id = $1", [project.id]);
  res.status(204).send();
});

// GET /api/projects/:id/board — nested board + columns + tasks
router.get("/:id/board", async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const membership = await getProjectMembership(project.id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const {
    rows: [board],
  } = await pool.query("SELECT id, name FROM boards WHERE project_id = $1", [
    project.id,
  ]);
  if (!board)
    return res.status(404).json({ error: "This project has no board yet" });

  const { rows: columns } = await pool.query(
    "SELECT id, name, position, color FROM columns WHERE board_id = $1 ORDER BY position ASC",
    [board.id],
  );

  const { rows: tasks } = await pool.query(
    `SELECT t.id, t.column_id, t.task_number, t.title, t.type, t.priority,
            t.due_date, t.position, t.assignee_id,
            u.name AS assignee_name
     FROM tasks t
     LEFT JOIN users u ON u.id = t.assignee_id
     WHERE t.project_id = $1
     ORDER BY t.position ASC`,
    [project.id],
  );

  const columnsWithTasks = columns.map((col) => ({
    ...col,
    tasks: tasks.filter((t) => t.column_id === col.id),
  }));

  res.json({ board: { ...board, columns: columnsWithTasks } });
});

// POST /api/projects/:id/members — add a project member (must already be a workspace member)
router.post("/:id/members", async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const membership = await getProjectMembership(project.id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });
  if (membership.role !== "lead")
    return res
      .status(403)
      .json({ error: "Only project leads can add members" });

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email is required" });

  const {
    rows: [user],
  } = await pool.query(
    `SELECT u.id, u.name, u.email
     FROM users u
     JOIN workspace_members wm ON wm.user_id = u.id
     WHERE u.email = $1 AND wm.workspace_id = $2`,
    [email.toLowerCase(), project.workspace_id],
  );
  if (!user) {
    return res
      .status(404)
      .json({
        error: "That person isn't a member of this project's workspace yet",
      });
  }

  try {
    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'member')",
      [project.id, user.id],
    );
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ error: "That person is already on this project" });
    }
    throw err;
  }

  res
    .status(201)
    .json({
      member: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: "member",
      },
    });
});

// DELETE /api/projects/:id/members/:userId — project leads only
router.delete("/:id/members/:userId", async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const membership = await getProjectMembership(project.id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });
  if (membership.role !== "lead")
    return res
      .status(403)
      .json({ error: "Only project leads can remove members" });

  const {
    rows: [leadCount],
  } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM project_members WHERE project_id = $1 AND role = 'lead'",
    [project.id],
  );
  const target = await getProjectMembership(project.id, req.params.userId);
  if (target?.role === "lead" && leadCount.count <= 1) {
    return res
      .status(400)
      .json({
        error: "Can't remove the last lead — promote someone else first",
      });
  }

  await pool.query(
    "DELETE FROM project_members WHERE project_id = $1 AND user_id = $2",
    [project.id, req.params.userId],
  );
  res.status(204).send();
});

export default router;
