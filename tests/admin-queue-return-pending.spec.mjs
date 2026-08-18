import fs from 'node:fs';
import { test, expect } from '@playwright/test';

const backend = fs.readFileSync(new URL('../src/admin-request-ops.ts', import.meta.url), 'utf8');
const queue = fs.readFileSync(new URL('../public/app/admin-queue-workspace.js', import.meta.url), 'utf8');

test('queued requests can be returned to pending review from the queue workspace', () => {
  expect(queue).toContain('data-qw-action="review"');
  expect(queue).toContain('/restore-pending');
  expect(queue).toContain('Вернуть заявку на проверку?');

  expect(backend).toContain("const fromQueue=before.status==='accepted'&&before.queue_status==='queued';");
  expect(backend).toContain("SET status='pending',slot_returned=0,queue_status=NULL,queue_position=NULL");
  expect(backend).toContain('if(fromQueue)await normalizeQueuePositions(env);');
  expect(backend).toContain('previous_queue_position:before.queue_position');
});
