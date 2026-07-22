import db from "#db/client";

export async function createComment(taskId, authorId, body) {
  const {
    rows: [comment],
  } = await db.query(
    "INSERT INTO comments (task_id, author_id, body) VALUES ($1, $2, $3) RETURNING *",
    [taskId, authorId, body],
  );

  const preview = body.length > 80 ? `${body.slice(0, 77)}...` : body;

  await db.query(
    "INSERT INTO activity_log (task_id, user_id, action, details) VALUES ($1, $2, 'commented', $3)",
    [taskId, authorId, JSON.stringify({ commentId: comment.id, preview })],
  );

  return comment;
}

export async function getCommentsForTask(taskId) {
  const { rows } = await db.query(
    `SELECT c.id, c.task_id, c.author_id, c.body, c.created_at, c.updated_at, u.name AS author_name
     FROM comments c
     JOIN users u ON u.id = c.author_id
     WHERE c.task_id = $1
     ORDER BY c.created_at ASC`,
    [taskId],
  );

  return rows;
}

export async function getCommentById(id) {
  const {
    rows: [comment],
  } = await db.query("SELECT * FROM comments WHERE id = $1", [id]);

  return comment || null;
}

export async function deleteComment(id, userId) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const {
      rows: [comment],
    } = await client.query(
      "SELECT id, task_id, body FROM comments WHERE id = $1 FOR UPDATE",
      [id],
    );

    if (!comment) {
      await client.query("ROLLBACK");
      return null;
    }

    const preview =
      comment.body.length > 80
        ? `${comment.body.slice(0, 77)}...`
        : comment.body;

    await client.query("DELETE FROM comments WHERE id = $1", [id]);

    await client.query(
      "INSERT INTO activity_log (task_id, user_id, action, details) VALUES ($1, $2, 'comment_deleted', $3)",
      [
        comment.task_id,
        userId,
        JSON.stringify({ commentId: comment.id, preview }),
      ],
    );

    await client.query("COMMIT");
    return comment;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getTaskProjectId(taskId) {
  const {
    rows: [task],
  } = await db.query("SELECT project_id FROM tasks WHERE id = $1", [taskId]);

  return task?.project_id || null;
}