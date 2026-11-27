import assert from 'node:assert/strict';
import test from 'node:test';
import { CONSUMPTION_PLAN_LIMIT, findConsumptionPlans } from '../src/utils/consumptionPlans.js';

const score = ({ combo }) => [
  combo.reduce((total, item) => total + item.delta, 0),
  combo.reduce((total, item) => total + item.cost, 0),
];

test('ranked consumption plans match exhaustive scoring across both halves', () => {
  const groups = Array.from({ length: 5 }, (_, index) => ({
    options: Array.from({ length: 4 }, (_, step) => ({
      id: index, delta: (step + 1) * (index + 2), cost: (step + 1) * 7 + index,
    })),
  }));
  const target = 39;
  const obtained = 87;
  const expected = groups.reduce((plans, { options }) => plans.flatMap(combo => [
    combo, ...options.map(option => [...combo, option]),
  ]), [[]]).map(combo => score({ combo }))
    .filter(([delta]) => delta >= target)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const actual = findConsumptionPlans(groups, target, obtained);
  assert.deepEqual(actual.map(score), expected.slice(0, CONSUMPTION_PLAN_LIMIT));
  for (const plan of actual) {
    assert.equal(plan.totalOrd, obtained + score(plan)[0]);
    assert.equal(new Set(plan.combo.map(item => item.id)).size, plan.combo.length);
  }
});

test('a full activity returns at most forty plans and handles impossible or completed goals', () => {
  const groups = Array.from({ length: 5 }, (_, id) => ({
    options: Array.from({ length: 20 }, (_, index) => ({ id, delta: index + 1, cost: 2 * index + 1 })),
  }));
  assert.equal(findConsumptionPlans(groups, 25, 0).length, CONSUMPTION_PLAN_LIMIT);
  assert.deepEqual(findConsumptionPlans(groups, 101, 0), []);
  assert.deepEqual(findConsumptionPlans(groups, 0, 0), []);
});
