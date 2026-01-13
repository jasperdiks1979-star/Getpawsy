#!/usr/bin/env node
"use strict";

const { generateReport, printReport } = require("../helpers/reportGenerator");

console.log("\n[Report] Generating GetPawsy Data Quality Report...\n");

const report = generateReport();
printReport(report);

console.log("\nJSON output available at: /api/debug/report\n");
