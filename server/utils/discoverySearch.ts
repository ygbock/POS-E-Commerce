export interface DiscoveryFuzzyCandidate {
  id: string;
  text: string;
}

export interface DiscoveryFuzzyRanked<T extends DiscoveryFuzzyCandidate> {
  item: T;
  fuzzyScore: number;
}

const MAX_DISTANCE_RATIO = 0.34;

export function normalizeDiscoverySearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function discoverySearchTokens(value: unknown): string[] {
  const normalized = normalizeDiscoverySearchText(value);
  return normalized ? normalized.split(' ') : [];
}

function boundedLevenshtein(a: string, b: string, maxDistance: number): number {
  if (a === b) return 0;
  if (!a.length) return b.length <= maxDistance ? b.length : maxDistance + 1;
  if (!b.length) return a.length <= maxDistance ? a.length : maxDistance + 1;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  if (a.length > b.length) [a, b] = [b, a];
  let previous = Array.from({ length: a.length + 1 }, (_, i) => i);
  let current = new Array<number>(a.length + 1);

  for (let j = 1; j <= b.length; j += 1) {
    current[0] = j;
    let rowMin = current[0];
    const from = Math.max(1, j - maxDistance);
    const to = Math.min(a.length, j + maxDistance);
    for (let i = 1; i < from; i += 1) current[i] = maxDistance + 1;
    for (let i = from; i <= to; i += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[i] = Math.min(
        previous[i] + 1,
        current[i - 1] + 1,
        previous[i - 1] + cost,
      );
      rowMin = Math.min(rowMin, current[i]);
    }
    for (let i = to + 1; i <= a.length; i += 1) current[i] = maxDistance + 1;
    if (rowMin > maxDistance) return maxDistance + 1;
    [previous, current] = [current, previous];
  }
  return previous[a.length];
}

function tokenSimilarity(queryToken: string, candidateToken: string): number {
  if (!queryToken || !candidateToken) return 0;
  if (queryToken === candidateToken) return 1;
  if (candidateToken.startsWith(queryToken) || queryToken.startsWith(candidateToken)) {
    const overlap = Math.min(queryToken.length, candidateToken.length) / Math.max(queryToken.length, candidateToken.length);
    if (overlap >= 0.75) return 0.94 + overlap * 0.04;
  }
  const maxDistance = Math.max(1, Math.floor(Math.max(queryToken.length, candidateToken.length) * MAX_DISTANCE_RATIO));
  const distance = boundedLevenshtein(queryToken, candidateToken, maxDistance);
  if (distance > maxDistance) return 0;
  return 1 - distance / Math.max(queryToken.length, candidateToken.length);
}

export function discoveryFuzzyScore(query: unknown, candidateText: unknown): number {
  const normalizedQuery = normalizeDiscoverySearchText(query);
  const normalizedCandidate = normalizeDiscoverySearchText(candidateText);
  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (normalizedQuery === normalizedCandidate) return 1;
  if (normalizedCandidate.includes(normalizedQuery)) return 0.96;

  const queryTokens = discoverySearchTokens(normalizedQuery);
  const candidateTokens = discoverySearchTokens(normalizedCandidate);
  if (!queryTokens.length || !candidateTokens.length) return 0;

  let matched = 0;
  for (const queryToken of queryTokens) {
    let best = 0;
    for (const candidateToken of candidateTokens) {
      best = Math.max(best, tokenSimilarity(queryToken, candidateToken));
    }
    matched += best;
  }
  return matched / queryTokens.length;
}

export function rankDiscoveryFuzzy<T extends DiscoveryFuzzyCandidate>(
  query: unknown,
  candidates: T[],
): DiscoveryFuzzyRanked<T>[] {
  return candidates
    .map((item, index) => ({ item, fuzzyScore: discoveryFuzzyScore(query, item.text), index }))
    .sort((a, b) => b.fuzzyScore - a.fuzzyScore || a.item.text.localeCompare(b.item.text) || a.index - b.index)
    .map(({ item, fuzzyScore }) => ({ item, fuzzyScore }));
}
