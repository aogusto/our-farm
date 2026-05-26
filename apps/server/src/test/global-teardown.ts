import "../env";
import { queryClient } from "../db/client";

// Vitest globalSetup file: the default export is the setup function (we don't
// need any setup); the named export `teardown` runs once after all test files.
export default async function setup(): Promise<void> {
  // nothing to do
}

export async function teardown(): Promise<void> {
  await queryClient.end();
}
