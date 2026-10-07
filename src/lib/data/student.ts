import type { Assignment, Submission } from "@/lib/types";
import { getAdminRepo } from "@/lib/data";

/**
 * Student-side reads that span tables the student can only see in part. They use the
 * admin repo but filter strictly by the student's own id and active tutor links, which
 * mirrors the RLS rules in the migrations.
 */
export type HomeworkStatus = "todo" | "submitted" | "graded" | "overdue";

export interface StudentHomeworkItem {
  assignment: Assignment;
  submission: Submission | null;
  status: HomeworkStatus;
  tutorName: string;
}

export function homeworkStatus(a: Assignment, s: Submission | null, nowIso: string): HomeworkStatus {
  if (s?.gradedAt) return "graded";
  if (s) return "submitted";
  return a.dueAt < nowIso ? "overdue" : "todo";
}

export async function getStudentHomework(studentId: string): Promise<StudentHomeworkItem[]> {
  const repo = getAdminRepo();
  const links = (await repo.select("tutor_students", { studentId })).filter((l) => l.status === "active");
  const nowIso = new Date().toISOString();
  const out: StudentHomeworkItem[] = [];
  for (const l of links) {
    const tutor = await repo.one("profiles", { id: l.tutorId });
    const assignments = (await repo.select("assignments", { tutorId: l.tutorId })).filter((a) => a.studentId === null || a.studentId === studentId);
    for (const a of assignments) {
      const submission = await repo.one("submissions", { assignmentId: a.id, studentId });
      out.push({ assignment: a, submission, status: homeworkStatus(a, submission, nowIso), tutorName: tutor?.fullName ?? "Tutor" });
    }
  }
  // Open work first (soonest due), then finished work (newest first)
  const open = out.filter((i) => i.status === "todo" || i.status === "overdue").sort((a, b) => a.assignment.dueAt.localeCompare(b.assignment.dueAt));
  const closed = out.filter((i) => i.status === "submitted" || i.status === "graded").sort((a, b) => b.assignment.dueAt.localeCompare(a.assignment.dueAt));
  return [...open, ...closed];
}
