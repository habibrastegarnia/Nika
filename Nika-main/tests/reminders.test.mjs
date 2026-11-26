import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderStageKey } from '../src/reminders.js';

test('یادآوری روزانه برای هر روز شمسی کلید مستقل دارد', () => {
  assert.equal(reminderStageKey('lateDaily', '1405-09-01'), 'daily:1405-09-01');
  assert.notEqual(reminderStageKey('lateDaily', '1405-09-01'), reminderStageKey('lateDaily', '1405-09-02'));
  assert.equal(reminderStageKey('late7', '1405-09-01'), 'daily:1405-09-01');
  assert.equal(reminderStageKey('due', '1405-09-01'), 'due');
  assert.equal(reminderStageKey('before', '1405-09-01'), 'before');
});
