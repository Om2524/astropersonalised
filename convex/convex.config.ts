import { defineApp } from "convex/server";
import polar from "@convex-dev/polar/convex.config.js";
import auth from "@convex-dev/auth/convex.config.js";

const app = defineApp();
app.use(polar);
app.use(auth);

export default app;
