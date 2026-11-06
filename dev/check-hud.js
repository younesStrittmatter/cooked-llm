import { chefRankForScore } from "../src/game/chef-rank.js";

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? "ok  " : "FAIL"} — ${label}`);
  if (!cond) failures++;
}

check("trainee at 0", chefRankForScore(0).title === "Kitchen Trainee");
check("chef cook at 4+", chefRankForScore(4).title === "Chef Cook");
check("progress toward prep cook", chefRankForScore(0).next?.title === "Prep Cook");
check("full progress at chef cook", chefRankForScore(5).progress === 1);

console.log(failures ? `\n${failures} failed.` : "\nAll checks passed.");
if (failures) process.exitCode = 1;
