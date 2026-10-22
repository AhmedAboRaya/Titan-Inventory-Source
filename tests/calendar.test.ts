import test from 'node:test';import assert from 'node:assert/strict';
import {cairoDate,date} from '../server/common';
import '../server/db';import {types} from 'pg';

test('Cairo business day crosses midnight at UTC21 in summer and UTC22 in winter',()=>{
 assert.equal(cairoDate(new Date('2026-07-01T20:59:59Z')),'2026-07-01');
 assert.equal(cairoDate(new Date('2026-07-01T21:30:00Z')),'2026-07-02');
 assert.equal(cairoDate(new Date('2026-01-15T21:30:00Z')),'2026-01-15');
 assert.equal(cairoDate(new Date('2026-01-15T22:00:00Z')),'2026-01-16');
});
test('PostgreSQL DATE stays an exact calendar string and malformed dates reject',()=>{
 const parse=types.getTypeParser(1082);assert.equal(parse('2026-10-18'),'2026-10-18');assert.equal(typeof parse('2026-10-18'),'string');
 assert.equal(date.parse('2028-02-29'),'2028-02-29');for(const value of ['2026-02-29','2026-04-31','2026-13-01'])assert.equal(date.safeParse(value).success,false);
});
