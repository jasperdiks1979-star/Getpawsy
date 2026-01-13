#!/usr/bin/env node
/**
 * bootstrap.js - Thin passthrough to server.js
 * 
 * SINGLE SERVER ARCHITECTURE:
 * This file exists only for backward compatibility.
 * All server logic is now in server.js.
 * 
 * DO NOT add routes, listeners, or BUILD_ID here.
 */

require('./server.js');
