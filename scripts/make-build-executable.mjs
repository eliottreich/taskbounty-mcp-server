import { chmodSync } from "node:fs"

chmodSync("build/index.js", 0o755)
