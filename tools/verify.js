/* Is it red for real? LANE E (core).

     node tools/verify.js          the current commit, alone
     node tools/verify.js origin/main

   Running the suite in this directory does NOT test a commit. It tests the
   commit plus every other lane's work in progress, because all the chats
   share one working tree. That is why a suite can be red on your screen,
   green in CI, and belong to nobody: the tree you are looking at is a state
   no commit has ever corresponded to.

   This exports the commit on its own and runs the suite there - which is
   what CI does - so "is this real" has a one-command answer.

   Its sibling is tools/shipped.js. Between them:
     verify.js   is this red for real, or is it somebody's desk?
     shipped.js  can the player actually have it?
*/

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ref = process.argv[2] || "HEAD";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mission-verify-"));

function sh(cmd, opts = {}){
  /* maxBuffer, and it is not a detail. Node's default is 1 MB, and the suite
     passed that as it grew past a thousand checks - so execSync threw
     ENOBUFS, this caught it as a failure, and a GREEN commit was reported
     RED with "no result line". A checker that lies in the direction of alarm
     is worse than one that does not run: it sends the coordinator to chase a
     lane that did nothing wrong. */
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
                         maxBuffer: 64 * 1024 * 1024, ...opts });
}

try {
  const sha = sh('git rev-parse --short "' + ref + '"').trim();
  console.log("\n  verifying " + ref + " (" + sha + ") on its own, with nobody's work in progress\n");

  /* No pipe and no -C: a Windows temp path with backslashes and a drive
     letter does not survive being handed to tar through a shell. Write the
     archive, then let Node set the working directory to extract it. */
  const tarPath = path.join(dir, "_src.tar");
  sh('git archive -o "' + tarPath + '" ' + ref);
  sh('tar -xf "_src.tar"', { cwd: dir });
  fs.rmSync(tarPath, { force: true });

  let out = "", failed = false;
  try {
    out = sh("node tools/run-tests.js", { cwd: dir });
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || "");
    failed = true;
  }

  const lines = out.split("\n");
  for(const l of lines) if(l.startsWith("FAIL")) console.log("  " + l);
  console.log("  " + (lines.filter(l => /checks (passed|FAILED)/.test(l)).pop() || "no result line").trim());

  if(failed){
    console.log("\n  RED ON THE COMMIT ITSELF. This one is real - route it.\n");
    process.exitCode = 1;
  } else {
    console.log("\n  GREEN ON THE COMMIT. Anything red in your working tree is\n" +
                "  somebody's work in progress, not a regression. Do not route it.\n");
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
