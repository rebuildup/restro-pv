// Runner-contract spec: proves the ae-test harness launches a session and
// the ae-a8n capability handshake answers. Runs against the FAKE host by
// default (ae-test.config.json); --real-host is macOS-only today and is
// exercised by the generate/verify pipeline instead on Windows.
import { test, expect } from "@ido-bata/ae-test";

test("session launches and reports host info", async ({ ae }) => {
  const info = ae.info();
  expect(info).toBeDefined();
  const version = await ae.version();
  expect(typeof version).toBe("string");
});

test("capability handshake is compatible", async ({ ae }) => {
  const caps = await ae.capabilities();
  expect(caps).toBeDefined();
});
