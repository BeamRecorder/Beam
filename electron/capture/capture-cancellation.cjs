function isCaptureCancellation(error) {
  return ['portal-cancelled', 'cancelled'].includes(error?.code) || error?.code === 'cancelled';
}

module.exports = { isCaptureCancellation };
