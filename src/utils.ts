/**
 * Returns the first element of an array, or a fallback value (defaults to null) if the array is empty.
 */
export function firstOr<T, F = null>(arr: T[], fallback: F = null as F): T | F {
  return arr.length > 0 ? arr[0] : fallback;
}

/**
 * Maps the first element of an array with provided function, or a fallback value (defaults to null) if the array is empty.
 */
export function mapFirstOr<T, MappedT, F = null>(
  arr: T[],
  map: (item: T) => MappedT,
  fallback: F = null as F
): MappedT | F {
  return arr.length > 0 ? map(arr[0]) : fallback;
}

export function idFromUri(uri: string) {
  return uri.split(":").pop() ?? "";
}
