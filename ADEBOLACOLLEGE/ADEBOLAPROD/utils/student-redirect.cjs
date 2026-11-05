const LESSON_VIEWER_PATH = /^\/e-learning\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getStudentRedirectTarget(requestedNext) {
  return typeof requestedNext === 'string' && LESSON_VIEWER_PATH.test(requestedNext)
    ? requestedNext
    : '/student/results';
}

module.exports = { getStudentRedirectTarget };
