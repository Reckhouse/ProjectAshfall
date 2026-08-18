import { afterEach } from "vitest";
import { resetDbForTests } from "@/db/client";

afterEach(async () => {
  await resetDbForTests();
});
