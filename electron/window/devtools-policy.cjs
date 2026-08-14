function shouldAutoOpenDevTools({ isPackaged, environment = process.env }) {
  return !isPackaged && environment.DEMO_RECORDER_DEVTOOLS === '1';
}

module.exports = { shouldAutoOpenDevTools };
