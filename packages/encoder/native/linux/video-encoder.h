#pragma once

#include <cstdint>
#include <string>
extern "C" {
#include <libavcodec/avcodec.h>
#include <libavcodec/bsf.h>
#include <libavformat/avformat.h>
}

namespace beam {
class VideoEncoder {
public:
  VideoEncoder(AVFrame *first, int fps, int bitrate, const std::string &format,
               const char *destination, uint32_t frame_count,
               int64_t duration_us);
  ~VideoEncoder();
  VideoEncoder(const VideoEncoder &) = delete;
  VideoEncoder &operator=(const VideoEncoder &) = delete;
  void submit(AVFrame *frame);
  void finish();
  uint64_t packets = 0;
  uint64_t bytes = 0;
  uint64_t keyframes = 0;

private:
  AVCodecContext *encoder_ = nullptr;
  AVFormatContext *output_ = nullptr;
  AVStream *stream_ = nullptr;
  AVPacket *packet_ = nullptr;
  AVBSFContext *metadata_ = nullptr;
  uint32_t frame_count_;
  int64_t duration_us_;
  void receive();
  void dispose();
};
} // namespace beam
