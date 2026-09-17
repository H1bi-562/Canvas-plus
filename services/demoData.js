// services/demoData.js
// Dev-only demo data: realistic courses, assignments, and past study sessions for
// ONE student, so the site can be previewed before real Canvas access exists.
//
// Everything is written through the same tables Canvas sync uses, so the UI
// cannot tell demo rows from synced ones -- which is the point. Demo rows are
// tagged by their course's "canvasBaseURL" (DEMO_BASE_URL), and clearDemoData()
// removes exactly those for one student.
//
// Never mounted in production (see server.js).

const pool = require('../db');

const DEMO_BASE_URL = 'demo://canvas-plus';

const DEMO_COURSES = [
  { id: 'cecs-491b', name: 'Computer Science Senior Project II', code: 'CECS 491B-02', department: 'CECS' },
  { id: 'cecs-427',  name: 'Network Science',                    code: 'CECS 427-01',  department: 'CECS' },
  { id: 'cecs-443',  name: 'Software Project Management',        code: 'CECS 443-01',  department: 'CECS' },
];

// dueInDays is relative to today, so the dashboard always has a mix of overdue,
// due-this-week, and later work no matter when it is seeded.
//
// estimateMin is the student's own guess (null = never estimated, so the UI's
// estimate prompt has something to show). completion mimics what Canvas sync or
// "Mark done" would record: submitted / late / missing (Canvas) or doneDaysAgo
// (manual). Together they give UC21's charts one of every completion state.
const DEMO_ASSIGNMENTS = [
  { id: 'demo-491b-weekly-review-1', course: 'cecs-491b', title: 'Weekly Review — Sprint 3',     points: 10,  dueInDays: -4,
    estimateMin: 45,  completion: { submittedDaysAgo: 4, late: false },
    description: 'Summarize what you shipped this sprint, blockers, and next sprint goals.' },
  { id: 'demo-491b-weekly-review-2', course: 'cecs-491b', title: 'Weekly Review — Sprint 4',     points: 10,  dueInDays: 3,
    estimateMin: 45,
    description: 'Summarize what you shipped this sprint, blockers, and next sprint goals.' },
  { id: 'demo-491b-design-spec',     course: 'cecs-491b', title: 'Design Spec Update (UC21–24)', points: 25,  dueInDays: 10,
    estimateMin: 120,
    description: 'Add sequence and activity diagrams for the new use cases to the living design document.' },
  { id: 'demo-491b-sprint-demo',     course: 'cecs-491b', title: 'Sprint Demo',                  points: 50,  dueInDays: 17,
    estimateMin: 180,
    description: 'Live demo of the Canvas sync and study analytics features to the class.' },
  { id: 'demo-427-reading-quiz',     course: 'cecs-427',  title: 'Reading Quiz — Chapter 3',     points: 10,  dueInDays: 1,
    estimateMin: null,
    description: 'Short quiz on strong and weak ties, triadic closure, and the clustering coefficient.' },
  { id: 'demo-427-problem-set-2',    course: 'cecs-427',  title: 'Problem Set 2',                points: 50,  dueInDays: -2,
    estimateMin: 150, completion: { submittedDaysAgo: 1, late: true },
    description: 'Graph theory proofs and BFS traces. Show all work.' },
  { id: 'demo-427-programming-2',    course: 'cecs-427',  title: 'Programming Assignment 2',     points: 100, dueInDays: 5,
    estimateMin: 240,
    description: 'Implement Erdős–Rényi random graphs from the definition and plot the giant component emergence.' },
  { id: 'demo-443-meeting-minutes',  course: 'cecs-443',  title: 'Team Meeting Minutes',         points: 5,   dueInDays: 2,
    estimateMin: 15,  completion: { doneDaysAgo: 1 },
    description: 'Submit minutes from this week’s team meeting using the course template.' },
  { id: 'demo-443-reading-reflection', course: 'cecs-443', title: 'Reading Reflection 2',        points: 10,  dueInDays: -6,
    estimateMin: 30,  completion: { missing: true },
    description: 'One-page reflection on the assigned case study.' },
  { id: 'demo-443-study-guide',      course: 'cecs-443',  title: 'Chapter 3 Study Guide',        points: 20,  dueInDays: 8,
    estimateMin: 90,
    description: 'Answer the review questions on project scheduling and estimation.' },
  { id: 'demo-443-proposal',         course: 'cecs-443',  title: 'Project Proposal',             points: 100, dueInDays: 14,
    estimateMin: 300,
    description: 'Scope, schedule, risks, and budget for the team project.' },
];

// Past sessions: which assignment, how many days ago, start hour, active minutes,
// and paused minutes (wall time = active + paused). Fixed rather than random so
// tests and screenshots are repeatable.
const DEMO_SESSIONS = [
  { assignment: 'demo-427-problem-set-2',    daysAgo: 13, hour: 19, activeMin: 45, pausedMin: 5  },
  { assignment: 'demo-491b-weekly-review-1', daysAgo: 12, hour: 10, activeMin: 30, pausedMin: 0  },
  { assignment: 'demo-427-problem-set-2',    daysAgo: 10, hour: 21, activeMin: 70, pausedMin: 15 },
  { assignment: 'demo-443-meeting-minutes',  daysAgo: 9,  hour: 14, activeMin: 20, pausedMin: 0  },
  { assignment: 'demo-491b-weekly-review-1', daysAgo: 6,  hour: 22, activeMin: 55, pausedMin: 10 },
  { assignment: 'demo-427-problem-set-2',    daysAgo: 3,  hour: 23, activeMin: 90, pausedMin: 25 },
  { assignment: 'demo-427-programming-2',    daysAgo: 3,  hour: 16, activeMin: 40, pausedMin: 5  },
  { assignment: 'demo-443-study-guide',      daysAgo: 2,  hour: 11, activeMin: 35, pausedMin: 0  },
  { assignment: 'demo-491b-design-spec',     daysAgo: 1,  hour: 20, activeMin: 60, pausedMin: 12 },
  { assignment: 'demo-427-programming-2',    daysAgo: 1,  hour: 15, activeMin: 50, pausedMin: 8  },
];

/** Local 11:59 PM, `days` from today. */
function dueDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 0, 0);
  return d;
}

/** Local 6:00 PM, `daysAgo` days before today -- when demo work was handed in. */
function daysAgoEvening(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(18, 0, 0, 0);
  return d;
}

/** Map a demo completion spec onto the columns sync and "Mark done" write. */
function completionColumns(completion = {}) {
  const submitted = completion.submittedDaysAgo != null;
  return {
    submittedAt:     submitted ? daysAgoEvening(completion.submittedDaysAgo) : null,
    submissionState: submitted ? 'submitted' : (completion.missing ? 'unsubmitted' : null),
    late:            submitted ? Boolean(completion.late) : null,
    missing:         completion.missing ? true : null,
    completedAt:     completion.doneDaysAgo != null ? daysAgoEvening(completion.doneDaysAgo) : null,
  };
}

/** Local `hour`:00, `daysAgo` days before today. */
function sessionStart(daysAgo, hour) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Insert (or refresh) this student's demo courses and assignments, plus past sessions once. */
async function seedDemoData(userID) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const courseIDs = {};
    for (const course of DEMO_COURSES) {
      const { rows: [row] } = await client.query(
        `INSERT INTO "Course" (name, "courseCode", department, semester, "canvasBaseURL", "canvasCourseID")
         VALUES ($1, $2, $3, 'Fall 2026', $4, $5)
         ON CONFLICT ("canvasBaseURL", "canvasCourseID") DO UPDATE SET
           name = EXCLUDED.name, "courseCode" = EXCLUDED."courseCode", "updated_at" = NOW()
         RETURNING id`,
        [course.name, course.code, course.department, DEMO_BASE_URL, course.id]
      );
      courseIDs[course.id] = row.id;
    }

    // Due dates, estimates, and completion are reset on every seed so "due in
    // 3 days" stays true and the preview always shows every state.
    let created = 0;
    const assignmentIDs = {};
    for (const a of DEMO_ASSIGNMENTS) {
      const c = completionColumns(a.completion);
      const { rows: [row] } = await client.query(
        `INSERT INTO "Assignment"
           ("userID", "courseID", title, description, points, "dueAt", "canvasAssignmentID", "syncedAt",
            "submittedAt", "submissionState", late, missing, "completedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11, $12)
         ON CONFLICT ("userID", "canvasAssignmentID") DO UPDATE SET
           title = EXCLUDED.title, description = EXCLUDED.description,
           points = EXCLUDED.points, "dueAt" = EXCLUDED."dueAt", "syncedAt" = NOW(),
           "submittedAt" = EXCLUDED."submittedAt", "submissionState" = EXCLUDED."submissionState",
           late = EXCLUDED.late, missing = EXCLUDED.missing, "completedAt" = EXCLUDED."completedAt"
         RETURNING id, (xmax = 0) AS inserted`,
        [userID, courseIDs[a.course], a.title, a.description, a.points, dueDate(a.dueInDays), a.id,
         c.submittedAt, c.submissionState, c.late, c.missing, c.completedAt]
      );
      assignmentIDs[a.id] = row.id;
      if (row.inserted) created += 1;

      await client.query(
        `INSERT INTO "AssignmentDetail" ("assignmentID", "estimatedMinutes", "estimateSource")
         VALUES ($1, $2, $3)
         ON CONFLICT ("assignmentID") DO UPDATE SET
           "estimatedMinutes" = EXCLUDED."estimatedMinutes",
           "estimateSource"   = EXCLUDED."estimateSource"`,
        [row.id, a.estimateMin, a.estimateMin == null ? null : 'student']
      );
    }

    // Sessions are history, not state: add them only the first time, or a
    // re-seed would double every chart.
    const { rows: [existing] } = await client.query(
      `SELECT count(*)::int AS n FROM "StudySession" WHERE "userID" = $1 AND "assignmentID" = ANY($2)`,
      [userID, Object.values(assignmentIDs)]
    );

    let sessions = 0;
    if (existing.n === 0) {
      for (const s of DEMO_SESSIONS) {
        const startedAt = sessionStart(s.daysAgo, s.hour);
        const endedAt   = new Date(startedAt.getTime() + (s.activeMin + s.pausedMin) * 60000);
        await client.query(
          `INSERT INTO "StudySession"
             ("userID", "assignmentID", status, "startedAt", "endedAt", "durationSeconds")
           VALUES ($1, $2, 'completed', $3, $4, $5)`,
          [userID, assignmentIDs[s.assignment], startedAt, endedAt, s.activeMin * 60]
        );
        sessions += 1;
      }
    }

    await client.query('COMMIT');
    return {
      courses:     DEMO_COURSES.length,
      assignments: DEMO_ASSIGNMENTS.length,
      created,
      sessions,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Remove this student's demo assignments and every session logged against them. */
async function clearDemoData(userID) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const demoAssignmentIDs = `
      SELECT a.id FROM "Assignment" a
        JOIN "Course" c ON c.id = a."courseID"
       WHERE a."userID" = $1 AND c."canvasBaseURL" = $2`;

    // Sessions first: the FK would only null out assignmentID, leaving orphaned
    // demo time in the student's real analytics.
    const sessions = await client.query(
      `DELETE FROM "StudySession" WHERE "userID" = $1 AND "assignmentID" IN (${demoAssignmentIDs})`,
      [userID, DEMO_BASE_URL]
    );
    const assignments = await client.query(
      `DELETE FROM "Assignment" WHERE id IN (${demoAssignmentIDs})`,
      [userID, DEMO_BASE_URL]
    );
    // Demo courses are shared; drop only the ones no student references now.
    await client.query(
      `DELETE FROM "Course" c WHERE c."canvasBaseURL" = $1
         AND NOT EXISTS (SELECT 1 FROM "Assignment" a WHERE a."courseID" = c.id)`,
      [DEMO_BASE_URL]
    );

    await client.query('COMMIT');
    return { assignments: assignments.rowCount, sessions: sessions.rowCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  DEMO_BASE_URL,
  DEMO_COURSES,
  DEMO_ASSIGNMENTS,
  seedDemoData,
  clearDemoData,
};
