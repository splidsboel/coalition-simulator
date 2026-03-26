// Worker thread for overnight-sweep-runner.js
// Receives simulation tasks via message, returns compact result summaries
const { parentPort } = require("worker_threads");
const { simulate } = require("./sim5-engine.js");

parentPort.on("message", (task) => {
  if (task.type === "shutdown") {
    process.exit(0);
  }

  try {
    const result = simulate(task.params, task.N);

    // Extract compact summary
    const summary = {
      taskId: task.taskId,
      params: task.params,
      pmS: result.pm.S || 0,
      pmV: result.pm.V || 0,
      pmM: result.pm.M || 0,
      pm: result.pm,
      govType: result.govType,
      topCoalition: result.topCoalitions[0] ? result.topCoalitions[0].govt : "none",
      topPct: result.topCoalitions[0] ? result.topCoalitions[0].pct : 0,
      topPassage: result.topCoalitions[0] ? result.topCoalitions[0].avgPPassage : 0,
      topFive: result.topCoalitions.slice(0, 5).map(c => ({
        govt: c.govt,
        pct: c.pct,
        avgPPassage: c.avgPPassage
      })),
      noGov: result.noGovPct,
      avgRounds: result.formationRounds.avg,
      roundsDist: result.formationRounds.distribution,
      formateurOrder: result.formateurOrder,
      mInGov: 0
    };

    // Calculate M in government percentage
    for (const c of result.topCoalitions) {
      if (c.govt.includes("M")) {
        summary.mInGov += c.pct;
      }
    }

    parentPort.postMessage({ ok: true, taskId: task.taskId, result: summary });
  } catch (err) {
    parentPort.postMessage({ ok: false, taskId: task.taskId, error: err.message });
  }
});
