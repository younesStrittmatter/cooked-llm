/** Raw vegetables that can be cut on a board */
export const RAW_VEG = ["tomato", "pumpkin", "cabbage"];

/** Cut progress 0–3+ (3 = done) */
export function cutStage(cutProgress) {
  if (cutProgress < 1) return 0;
  if (cutProgress < 2) return 1;
  if (cutProgress < 3) return 2;
  return 3;
}

export function isCutDone(cutProgress) {
  return cutProgress >= 3;
}

/** Knife sprite column while chopping */
export function knifeFrame(cutProgress) {
  if (isCutDone(cutProgress) || cutProgress <= 0) return 0;
  const cycle = cutProgress % 0.21;
  if (cycle < 0.07) return 0;
  if (cycle < 0.14) return 16;
  return 32;
}

export function displayItem(cell) {
  if (!cell.item) return null;
  if (isCutDone(cell.cutProgress ?? 0)) return `${cell.item}_cut`;
  return cell.item;
}
