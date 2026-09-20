import assert from "node:assert/strict";
import test from "node:test";

import { PluginSessionActivation } from "../src/plugins/plugin-session-activation.ts";

test("session selection is independent from the next normal launch intent", () => {
  const activation = new PluginSessionActivation();
  activation.register("test.always", "always");
  activation.register("test.desired", "user");
  activation.register("test.recovery", "user");
  activation.restoreDesired(["test.desired"]);

  activation.start(["test.recovery"]);
  activation.markActive("test.always");
  activation.markActive("test.recovery");

  assert.deepEqual(activation.state("test.desired"), {
    active: false,
    nextLaunchActive: true,
    restartRequired: true,
  });
  assert.deepEqual(activation.state("test.recovery"), {
    active: true,
    nextLaunchActive: false,
    restartRequired: true,
  });
  assert.deepEqual([...activation.activeIds()], ["test.always", "test.recovery"]);
  assert.deepEqual([...activation.nextLaunchIds()], ["test.always", "test.desired"]);
});

test("running activation changes schedule only the next launch", () => {
  const activation = new PluginSessionActivation();
  activation.register("test.user", "user");
  activation.start();

  assert.deepEqual(activation.setDesired("test.user", true), {
    pluginId: "test.user",
    active: false,
    nextLaunchActive: true,
    restartRequired: true,
    effect: "restart-required",
  });
  assert.equal(activation.selectedForSession("test.user"), false);
  assert.equal(activation.setDesired("test.user", true).effect, "unchanged");
  assert.equal(activation.setDesired("test.missing", true).effect, "rejected");
});

test("a selected plugin becomes active only after successful installation", () => {
  const activation = new PluginSessionActivation();
  activation.register("test.failed", "user");
  activation.restoreDesired(["test.failed"]);
  activation.start();

  assert.equal(activation.selectedForSession("test.failed"), true);
  assert.deepEqual(activation.state("test.failed"), {
    active: false,
    nextLaunchActive: true,
    restartRequired: true,
  });
  assert.throws(() => activation.markActive("test.unknown"), /not selected/);
});
