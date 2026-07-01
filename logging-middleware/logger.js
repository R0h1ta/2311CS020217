const axios = require('axios');
require('dotenv').config();


const LOG_API_URL = 'http://4.224.186.213/evaluation-service/logs';

const ALLOWED_STACK = ['backend', 'frontend'];
const ALLOWED_LEVEL = ['debug', 'info', 'warn', 'error', 'fatal'];
const ALLOWED_PACKAGE_BACKEND = ['cache', 'controller', 'cron_job', 'db', 'domain', 'handler', 'repository', 'route', 'service'];
const ALLOWED_PACKAGE_FRONTEND = ['api', 'component', 'hook', 'page', 'state', 'style'];
const ALLOWED_PACKAGE_COMMON = ['auth', 'config', 'middleware', 'utils'];

function isValidPackage(stack, pkg) {
  if (ALLOWED_PACKAGE_COMMON.includes(pkg)) return true;
  if (stack === 'backend') return ALLOWED_PACKAGE_BACKEND.includes(pkg);
  if (stack === 'frontend') return ALLOWED_PACKAGE_FRONTEND.includes(pkg);
  return false;
}

async function Log(stack, level, pkg, message) {
  stack = stack.toLowerCase();
  level = level.toLowerCase();
  pkg = pkg.toLowerCase();

  if (!ALLOWED_STACK.includes(stack)) {
    console.error(`Invalid stack value: ${stack}`);
    return;
  }
  if (!ALLOWED_LEVEL.includes(level)) {
    console.error(`Invalid level value: ${level}`);
    return;
  }
  if (!isValidPackage(stack, pkg)) {
    console.error(`Invalid package "${pkg}" for stack "${stack}"`);
    return;
  }

  try {
    const response = await axios.post(
      LOG_API_URL,
      { stack, level, package: pkg, message },
      {
        headers: {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Log sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('Log API call failed:', error.response?.data || error.message);
  }
}

module.exports = { Log };