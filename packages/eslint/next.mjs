import next from "eslint-config-next/core-web-vitals";
import base from "./base.mjs";

// Client-side data loads deliberately set their loading state before awaiting a response.
export default [...base, ...next, { rules: { "react-hooks/set-state-in-effect": "off" } }];
