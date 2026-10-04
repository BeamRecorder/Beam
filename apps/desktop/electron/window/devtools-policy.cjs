function shouldAutoOpenDevTools({ isPackaged, environment = process.env }) {
  return !isPackaged && environment.BEAM_DEVTOOLS === '1';
}

module.exports = { shouldAutoOpenDevTools };
