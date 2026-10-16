/**
 * Compare legacy game fields without changing number/string/null coercion.
 * Protocol IDs and older persisted form values can have different primitive types.
 * @param {unknown} left First existing game value.
 * @param {unknown} right Second existing game value.
 * @returns {boolean} Whether the values match under the established coercion rules.
 */
export function isSameGameValue(left, right) {
  // eslint-disable-next-line eqeqeq -- Preserve the existing protocol and persisted-value compatibility contract.
  return left == right;
}
