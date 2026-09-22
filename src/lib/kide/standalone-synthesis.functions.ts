import { createServerFn } from "@tanstack/react-start";
import { validateStandaloneSynthesisInput } from "@/lib/kide/standalone-synthesis-contract";
import { verifyStandaloneSynthesis } from "@/lib/kide/standalone-synthesis.server";

export const verifySynthesisOnServer = createServerFn({ method: "POST" })
  .validator(validateStandaloneSynthesisInput)
  .handler(async ({ data }) => verifyStandaloneSynthesis(data.files));
