/* Validates revision 02 evidence captured through CUA. Historical revision 01 script is preserved in evidence/revision-02/before-source/. */
import('./revision-02-contract.js')
  .then(({ validateEvidence }) => console.log(JSON.stringify(validateEvidence(), null, 2)))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
