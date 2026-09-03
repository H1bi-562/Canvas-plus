// controllers/assignment.js
function calculateWarningDate(dueDate, hoursBefore) {
  const due = new Date(dueDate);
  return new Date(due.getTime() - hoursBefore * 60 * 60 * 1000);
}
 
module.exports = { calculateWarningDate };
 