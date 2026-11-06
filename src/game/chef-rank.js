/** Score-based kitchen rank — culminates at Chef Cook. */
export const CHEF_RANKS = [
  { minScore: 0, title: "Kitchen Trainee", subtitle: "Learn the stations and stay out of the way" },
  { minScore: 1, title: "Prep Cook", subtitle: "First salad out — the line is waking up" },
  { minScore: 2, title: "Line Cook", subtitle: "Hands moving, pass staying hot" },
  { minScore: 3, title: "Sous Chef", subtitle: "Coordinating the kitchen — almost there" },
  { minScore: 4, title: "Chef Cook", subtitle: "You run this kitchen now" },
];

export function chefRankForScore(score) {
  let current = CHEF_RANKS[0];
  for (const rank of CHEF_RANKS) {
    if (score >= rank.minScore) current = rank;
  }
  const nextIndex = CHEF_RANKS.findIndex((r) => r.minScore > score);
  const next = nextIndex >= 0 ? CHEF_RANKS[nextIndex] : null;
  const prevMin = current.minScore;
  const nextMin = next?.minScore ?? current.minScore;
  const progress =
    next == null ? 1 : nextMin === prevMin ? 0 : (score - prevMin) / (nextMin - prevMin);

  return { ...current, next, progress: Math.min(1, Math.max(0, progress)) };
}
