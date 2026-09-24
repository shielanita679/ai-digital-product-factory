import { z } from "zod";

import { PURCHASABLE_PLAN_VALUES } from "@/config/plans";

export const createCheckoutSessionSchema = z.object({
  planId: z.enum(PURCHASABLE_PLAN_VALUES),
});
