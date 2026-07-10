import { Router } from "express";
import { pool } from "#db/pool";
import { requireAuth } from "#middleware/auth";

const router = Router();
router.use(requireAuth);

async function getProjectMembership(projectId, userId) {
  const {
    rows: [m],
  } = await pool.query(
    "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId],
  );
  return m || null;
}

async function getTaskProjectId(taskId) {
  const {
    rows: [task],
  } = await pool.query("SELECT project_id FROM tasks WHERE id = $1", [taskId]);
  return task?.project_id || null;
}

async function getComment(commentId) {
  const {
    rows: [comment],
  } = await pool.query(
    "SELECT id, task_id, user_id, content, created_at, updated_at FROM comments WHERE id = $1",
    [commentId],
  );
  return comment || null;
}

// POST /api/comments — add comment. body: { taskId, content }
router.post("/", async (req, res) => {
  const { taskId, content } = req.body;
  if (!taskId || !content) {
    return res.status(400).json({ error: "taskId and content are required" });
  }

  const projectId = await getTaskProjectId(taskId);
  if (!projectId) return res.status(404).json({ error: "Task not found" });

  const membership = await getProjectMembership(projectId, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const {
      rows: [comment],
    } = await client.query(
      `INSERT INTO comments (task_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, task_id, user_id, content, created_at, updated_at`,
      [taskId, req.user.sub, content],
    );

    await client.query(
      "INSERT INTO activity_log (task_id, user_id, action, details) VALUES ($1, $2, 'commented', $3)",
      [taskId, req.user.sub, JSON.stringify({ commentId: comment.id })],
    );

    await client.query("COMMIT");
    res.status(201).json({ comment });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/comments?task_id=
router.get("/", async (req, res) => {
  const { task_id: taskId } = req.query;
  if (!taskId)
    return res.status(400).json({ error: "task_id query param is required" });

  const projectId = await getTaskProjectId(taskId);
  if (!projectId) return res.status(404).json({ error: "Task not found" });

  const membership = await getProjectMembership(projectId, req.user.sub);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const { rows: comments } = await pool.query(
    `SELECT c.id, c.task_id, c.user_id, c.content, c.created_at, c.updated_at, u.name AS user_name
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.task_id = $1
     ORDER BY c.created_at ASC`,
    [taskId],
  );
  res.json({ comments });
});

// PATCH /api/comments/:id — edit own comment only
router.patch("/:id", async (req, res) => {
  const comment = await getComment(req.params.id);
  if (!comment) return res.status(404).json({ error: "Comment not found" });

  if (comment.user_id !== req.user.sub) {
    return res
      .status(403)
      .json({ error: "You can only edit your own comments" });
  }

  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "content is required" });

  const {
    rows: [updated],
  } = await pool.query(
    "UPDATE comments SET content = $1 WHERE id = $2 RETURNING id, task_id, user_id, content, created_at, updated_at",
    [content, comment.id],
  );
  res.json({ comment: updated });
});

// DELETE /api/comments/:id — delete own comment only
router.delete("/:id", async (req, res) => {
  const comment = await getComment(req.params.id);
  if (!comment) return res.status(404).json({ error: "Comment not found" });

  if (comment.user_id !== req.user.sub) {
    return res
      .status(403)
      .json({ error: "You can only delete your own comments" });
  }

  await pool.query("DELETE FROM comments WHERE id = $1", [comment.id]);
  res.status(204).send();
});

export default router;
