/* Uses the same source-hash and DOM contracts as the visual review; does not launch a browser. */
import('./revision-02-contract.js')
  .then(({ validateEvidence }) => {
    const report = validateEvidence();
    console.log(JSON.stringify({ passed: report.passed, viewports: report.viewports, source: report.evidence, mode: report.mode }, null, 2));
  })
  .catch(error => { console.error(error.message); process.exitCode = 1; });
