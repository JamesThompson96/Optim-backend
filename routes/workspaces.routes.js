import { Router } from "express";
import { pool } from "#db/pool";
import { requireAuth } from "#middleware/auth";

const router = Router();
router.use(requireAuth);

// Returns the current user's membership row for a workspace, or null if they're not a member.
async function getMembership(workspaceId, userId) {
  const {
    rows: [membership],
  } = await pool.query(
    "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    [workspaceId, userId],
  );
  return membership || null;
}

// POST /api/workspaces — create workspace, creator becomes admin
router.post("/", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const {
      rows: [workspace],
    } = await client.query(
      "INSERT INTO workspaces (name, owner_id) VALUES ($1, $2) RETURNING id, name, owner_id, created_at",
      [name, req.user.sub],
    );
    await client.query(
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'admin')",
      [workspace.id, req.user.sub],
    );
    await client.query("COMMIT");
    res.status(201).json({ workspace });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/workspaces — list workspaces for current user
router.get("/", async (req, res) => {
  const { rows: workspaces } = await pool.query(
    `SELECT w.id, w.name, w.owner_id, w.created_at, wm.role AS my_role
     FROM workspaces w
     JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = $1
     ORDER BY w.created_at DESC`,
    [req.user.sub],
  );
  res.json({ workspaces });
});

// GET /api/workspaces/:id
router.get("/:id", async (req, res) => {
  const membership = await getMembership(req.params.id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You don't have access to this workspace" });

  const {
    rows: [workspace],
  } = await pool.query(
    "SELECT id, name, owner_id, created_at FROM workspaces WHERE id = $1",
    [req.params.id],
  );
  if (!workspace) return res.status(404).json({ error: "Workspace not found" });

  res.json({ workspace: { ...workspace, myRole: membership.role } });
});

// PATCH /api/workspaces/:id
router.patch("/:id", async (req, res) => {
  const membership = await getMembership(req.params.id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You don't have access to this workspace" });
  if (membership.role !== "admin")
    return res
      .status(403)
      .json({ error: "Only admins can update this workspace" });

  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const {
    rows: [workspace],
  } = await pool.query(
    "UPDATE workspaces SET name = $1 WHERE id = $2 RETURNING id, name, owner_id, created_at",
    [name, req.params.id],
  );
  res.json({ workspace });
});

// DELETE /api/workspaces/:id
router.delete("/:id", async (req, res) => {
  const membership = await getMembership(req.params.id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You don't have access to this workspace" });
  if (membership.role !== "admin")
    return res
      .status(403)
      .json({ error: "Only admins can delete this workspace" });

  await pool.query("DELETE FROM workspaces WHERE id = $1", [req.params.id]);
  res.status(204).send();
});

// POST /api/workspaces/:id/invite
router.post("/:id/invite", async (req, res) => {
  const membership = await getMembership(req.params.id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You don't have access to this workspace" });
  if (membership.role !== "admin")
    return res.status(403).json({ error: "Only admins can invite members" });

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email is required" });

  const {
    rows: [user],
  } = await pool.query("SELECT id, name, email FROM users WHERE email = $1", [
    email.toLowerCase(),
  ]);
  if (!user) {
    // MVP has no pending-invite flow yet — the person has to already have an Optim account.
    return res
      .status(404)
      .json({ error: "No Optim account found with that email" });
  }

  try {
    await pool.query(
      "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'member')",
      [req.params.id, user.id],
    );
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ error: "That person is already a member of this workspace" });
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

// GET /api/workspaces/:id/members
router.get("/:id/members", async (req, res) => {
  const membership = await getMembership(req.params.id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You don't have access to this workspace" });

  const { rows: members } = await pool.query(
    `SELECT u.id, u.name, u.email, u.avatar_url, wm.role, wm.joined_at
     FROM workspace_members wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = $1
     ORDER BY wm.joined_at ASC`,
    [req.params.id],
  );
  res.json({ members });
});

// DELETE /api/workspaces/:id/members/:userId
router.delete("/:id/members/:userId", async (req, res) => {
  const membership = await getMembership(req.params.id, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You don't have access to this workspace" });
  if (membership.role !== "admin")
    return res.status(403).json({ error: "Only admins can remove members" });

  const {
    rows: [workspace],
  } = await pool.query("SELECT owner_id FROM workspaces WHERE id = $1", [
    req.params.id,
  ]);
  if (workspace.owner_id === req.params.userId) {
    return res.status(400).json({ error: "Can't remove the workspace owner" });
  }

  await pool.query(
    "DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    [req.params.id, req.params.userId],
  );
  res.status(204).send();
});

export default router;
