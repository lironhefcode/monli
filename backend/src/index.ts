import { createApp } from "./app";
import { env } from "./config/env";
import { startTargetStatusJob } from "./jobs/target-status.job";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`monli backend listening on port ${env.PORT}`);
  startTargetStatusJob();
});
