#pragma once

#include "frame-protocol.h"
extern "C" {
#include <libavfilter/avfilter.h>
#include <libavutil/hwcontext.h>
}

namespace beam {
class GpuConversion {
public:
  GpuConversion(const FrameDescriptor &descriptor, const char *device, int fps);
  ~GpuConversion();
  GpuConversion(const GpuConversion &) = delete;
  GpuConversion &operator=(const GpuConversion &) = delete;
  AVFrame *convert(const FrameDescriptor &descriptor, int dma_buf);

private:
  FrameDescriptor geometry_;
  AVBufferRef *drm_ = nullptr;
  AVBufferRef *vaapi_ = nullptr;
  AVBufferRef *frames_ = nullptr;
  AVFilterGraph *graph_ = nullptr;
  AVFilterContext *source_ = nullptr;
  AVFilterContext *sink_ = nullptr;
  void dispose();
};
} // namespace beam
