function lgplRecords() {
  return ['avcodec', 'avutil', 'avfilter', 'avformat'].map((library) => ({
    library,
    license: 'LGPL version 2.1 or later',
    configuration: '--enable-shared --disable-static --disable-gpl --disable-nonfree',
    path: `/usr/lib/lib${library}.so.62`,
  }));
}
module.exports = { lgplRecords };
