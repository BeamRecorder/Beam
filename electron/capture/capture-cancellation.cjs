function isCaptureCancellation(error) {
  return error?.code === 'portal-cancelled' || error?.code === 'cancelled';
}

module.exports = { isCaptureCancellation };
