export const CONSUMPTION_PLAN_LIMIT = 40;

function enumerate(groups) {
  let plans = [{ sumDelta: 0, sumCost: 0, combo: [] }];
  for (const { options } of groups) {
    const next = [...plans];
    for (const plan of plans) {
      for (const option of options) {
        next.push({
          sumDelta: plan.sumDelta + option.delta,
          sumCost: plan.sumCost + option.cost,
          combo: [...plan.combo, option],
        });
      }
    }
    plans = next;
  }
  return plans;
}

function firstAtLeast(plans, target) {
  let lo = 0;
  let hi = plans.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (plans[mid].sumDelta < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Pair half-plans in ranked order without allocating the full cross product. */
export function findConsumptionPlans(groups, target, alreadyObtained) {
  if (!Number.isFinite(target) || target <= 0) return [];
  const middle = Math.floor(groups.length / 2);
  const right = enumerate(groups.slice(middle));
  right.sort((a, b) => a.sumDelta - b.sumDelta || a.sumCost - b.sumCost);
  const cursors = enumerate(groups.slice(0, middle))
    .map(left => ({ left, index: firstAtLeast(right, target - left.sumDelta) }))
    .filter(cursor => cursor.index < right.length);

  const plans = [];
  while (cursors.length && plans.length < CONSUMPTION_PLAN_LIMIT) {
    let bestIndex = 0;
    let bestDelta = Infinity;
    let bestCost = Infinity;
    for (let index = 0; index < cursors.length; index++) {
      const cursor = cursors[index];
      const other = right[cursor.index];
      const delta = cursor.left.sumDelta + other.sumDelta;
      const cost = cursor.left.sumCost + other.sumCost;
      if (delta < bestDelta || (delta === bestDelta && cost < bestCost)) {
        bestIndex = index;
        bestDelta = delta;
        bestCost = cost;
      }
    }
    const best = cursors[bestIndex];
    plans.push({ combo: [...best.left.combo, ...right[best.index].combo], totalOrd: alreadyObtained + bestDelta });
    best.index++;
    if (best.index === right.length) cursors.splice(bestIndex, 1);
  }
  return plans;
}
