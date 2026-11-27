const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  matchesCourseMaterialSignature,
  isAllowedCourseMaterialType,
  buildCourseMaterialPath,
  MAX_COURSE_MATERIAL_BYTES,
} = require('../utils/course-material.cjs');

test('course material validation accepts only PDF and MP4 signatures', () => {
  assert.equal(isAllowedCourseMaterialType('application/pdf'), true);
  assert.equal(isAllowedCourseMaterialType('video/mp4'), true);
  assert.equal(isAllowedCourseMaterialType('text/plain'), false);
  assert.equal(matchesCourseMaterialSignature('application/pdf', Buffer.from('%PDF-1.7')), true);
  assert.equal(matchesCourseMaterialSignature('application/pdf', Buffer.from('not a pdf')), false);
  assert.equal(matchesCourseMaterialSignature('video/mp4', Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70])), true);
  assert.equal(matchesCourseMaterialSignature('video/mp4', Buffer.from('not mp4')), false);
  assert.equal(MAX_COURSE_MATERIAL_BYTES, 50 * 1024 * 1024);
});

test('course and lesson materials receive distinct path associations for each PDF and MP4', () => {
  const courseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const lessonId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const firstPdf = buildCourseMaterialPath(courseId, lessonId, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'lesson.pdf');
  const secondPdf = buildCourseMaterialPath(courseId, lessonId, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'worksheet.pdf');
  const video = buildCourseMaterialPath(courseId, lessonId, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'lesson.mp4');
  const coursePdf = buildCourseMaterialPath(courseId, null, 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'notes.pdf');
  const courseVideo = buildCourseMaterialPath(courseId, null, '99999999-9999-4999-8999-999999999999', 'overview.mp4');

  assert.equal(firstPdf.split('/')[0], courseId);
  assert.equal(firstPdf.split('/')[1], lessonId);
  assert.equal(secondPdf.split('/')[1], lessonId);
  assert.equal(video.split('/')[1], lessonId);
  assert.notEqual(firstPdf, secondPdf);
  assert.notEqual(secondPdf, video);
  assert.equal(coursePdf.split('/')[1], 'course');
  assert.equal(courseVideo.split('/')[1], 'course');
  assert.notEqual(coursePdf, courseVideo);
});
