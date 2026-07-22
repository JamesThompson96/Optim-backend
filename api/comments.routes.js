import { Router } from "express";
import requireUser from "#middleware/requireUser";
import { getProjectMembership } from "#db/queries/projects";
import {
  getCommentById,
  deleteComment,
  getTaskProjectId,
} from "#db/queries/comments";

const router = Router();
router.use(requireUser);

// DELETE /comments/:id — only the comment's author or a project lead can delete
router.delete("/:id", async (req, res) => {
  const comment = await getCommentById(req.params.id);
  if (!comment) return res.status(404).json({ error: "Comment not found" });

  const projectId = await getTaskProjectId(comment.task_id);
  const membership = await getProjectMembership(projectId, req.user.id);
  if (!membership)
    return res
      .status(403)
      .json({ error: "You're not a member of this project" });

  const isAuthor = comment.author_id === req.user.id;
  const isLead = membership.role === "lead";
  if (!isAuthor && !isLead) {
    return res
      .status(403)
      .json({
        error: "Only the comment's author or a project lead can delete it",
      });
  }

  await deleteComment(comment.id, req.user.id);
  res.status(204).send();
});

export default router;
