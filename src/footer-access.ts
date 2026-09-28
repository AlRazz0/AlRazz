/** The gesture is only navigation. Server authentication always remains required. */
export function nextLogoTap(previous: { count: number; at: number }, now: number) {
  const count = now >= previous.at && now - previous.at <= 4000 ? previous.count + 1 : 1;
  return { count: count >= 6 ? 0 : count, at: now, enter: count >= 6 };
}
