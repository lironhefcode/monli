import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { startTargetStatusJob } from "./jobs/target-status.job.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`monli backend listening on port ${env.PORT}`);
  startTargetStatusJob();
});
