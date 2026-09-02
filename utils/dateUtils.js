// controllers/assignment.js
const { calculateWarningDate } = require('../utils/dateUtils');
const pool = require('../db'); // postgresSQL pool

async function storeAssignment(userID, canvasAssignmentID, dueDate) {
    const dueDate = canvasAssignment.due_at; // canvas api

    const warningDate = calculateWarningDate(dueDate, 24);

    const query = `
        INSERT INTO assignments (user_id, canvas_id, title, due_date, warning_date)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (canvas_id) 
        DO UPDATE SET 
            title = EXCLUDED.title,
            due_date = EXCLUDED.due_date,
            warning_date = EXCLUDED.warning_date
        RETURNING *;
    `; 
    const values = [ 
    userID,
    canvasAssignmentID, 
    canvasAssignment.name, 
    dueDate,
    warningDate
];

    try {
    const result = await pool.query(query, values);
    return result.rows[0];
    } catch (err) {
    console.error('Error storing assignment:', err);
    throw err;
    }
}