#!/usr/bin/env node

// Architecture: CONTRACT:C4-PPTV-SOURCE.1.1

import { runCli } from "./cli.js";

process.exitCode = await runCli(process.argv.slice(2));
