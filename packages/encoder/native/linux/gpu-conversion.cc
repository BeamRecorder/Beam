#include "gpu-conversion.h"
#include "ffmpeg-error.h"
#include <drm_fourcc.h>
#include <memory>
#include <unistd.h>
extern "C" {
#include <libavfilter/buffersink.h>
#include <libavfilter/buffersrc.h>
#include <libavutil/hwcontext_drm.h>
#include <libavutil/hwcontext_vaapi.h>
}

namespace beam {
namespace {
void free_descriptor(void *, uint8_t *data) {
  auto *descriptor = reinterpret_cast<AVDRMFrameDescriptor *>(data);
  for (int i = 0; i < descriptor->nb_objects; ++i)
    close(descriptor->objects[i].fd);
  av_free(data);
}
void free_frame(AVFrame *frame) { av_frame_free(&frame); }
using Frame = std::unique_ptr<AVFrame, decltype(&free_frame)>;
} // namespace

GpuConversion::GpuConversion(const FrameDescriptor &geometry,
                             const char *device, int fps)
    : geometry_(geometry) {
  try {
    validate_frame(geometry);
    ffmpeg_check(
        av_hwdevice_ctx_create(&drm_, AV_HWDEVICE_TYPE_DRM, device, nullptr, 0),
        "Open DRM device");
    ffmpeg_check(av_hwdevice_ctx_create_derived(&vaapi_, AV_HWDEVICE_TYPE_VAAPI,
                                                drm_, 0),
                 "Open VA-API device");
    frames_ = av_hwframe_ctx_alloc(drm_);
    if (!frames_)
      throw std::bad_alloc();
    auto *frames = reinterpret_cast<AVHWFramesContext *>(frames_->data);
    frames->format = AV_PIX_FMT_DRM_PRIME;
    frames->sw_format = geometry.pixel_format == PixelFormat::bgra
                            ? AV_PIX_FMT_BGRA
                            : AV_PIX_FMT_RGBA;
    frames->width = geometry.width;
    frames->height = geometry.height;
    ffmpeg_check(av_hwframe_ctx_init(frames_), "Initialize DRM frames");
    graph_ = avfilter_graph_alloc();
    if (!graph_)
      throw std::bad_alloc();
    source_ = avfilter_graph_alloc_filter(
        graph_, avfilter_get_by_name("buffer"), "source");
    if (!source_)
      throw std::bad_alloc();
    auto *parameters = av_buffersrc_parameters_alloc();
    if (!parameters)
      throw std::bad_alloc();
    parameters->format = AV_PIX_FMT_DRM_PRIME;
    parameters->width = geometry.width;
    parameters->height = geometry.height;
    parameters->hw_frames_ctx = frames_;
    const int configured = av_buffersrc_parameters_set(source_, parameters);
    av_free(parameters);
    ffmpeg_check(configured, "Configure GPU frame source");
    const std::string options =
        "video_size=" + std::to_string(geometry.width) + "x" +
        std::to_string(geometry.height) +
        ":pix_fmt=" + std::to_string(AV_PIX_FMT_DRM_PRIME) + ":time_base=1/" +
        std::to_string(fps) + ":pixel_aspect=1/1";
    ffmpeg_check(avfilter_init_str(source_, options.c_str()),
                 "Initialize GPU frame source");
    AVFilterContext *mapping, *conversion;
    ffmpeg_check(avfilter_graph_create_filter(
                     &mapping, avfilter_get_by_name("hwmap"), "import",
                     "mode=read+direct", nullptr, graph_),
                 "Create direct DMA-BUF import");
    mapping->hw_device_ctx = av_buffer_ref(vaapi_);
    ffmpeg_check(avfilter_graph_create_filter(
                     &conversion, avfilter_get_by_name("scale_vaapi"),
                     "conversion",
                     "format=nv12:out_color_matrix=bt709:out_range=limited",
                     nullptr, graph_),
                 "Create GPU color conversion");
    ffmpeg_check(
        avfilter_graph_create_filter(&sink_, avfilter_get_by_name("buffersink"),
                                     "sink", nullptr, nullptr, graph_),
        "Create GPU frame sink");
    ffmpeg_check(avfilter_link(source_, 0, mapping, 0), "Link GPU import");
    ffmpeg_check(avfilter_link(mapping, 0, conversion, 0),
                 "Link GPU conversion");
    ffmpeg_check(avfilter_link(conversion, 0, sink_, 0), "Link GPU output");
    ffmpeg_check(avfilter_graph_config(graph_, nullptr),
                 "Configure GPU conversion");
  } catch (...) {
    dispose();
    throw;
  }
}

AVFrame *GpuConversion::convert(const FrameDescriptor &frame, int dma_buf) {
  validate_frame(frame);
  if (frame.width != geometry_.width || frame.height != geometry_.height ||
      frame.pixel_format != geometry_.pixel_format)
    throw std::runtime_error("GPU frame geometry changed during export");
  auto *descriptor = static_cast<AVDRMFrameDescriptor *>(
      av_mallocz(sizeof(AVDRMFrameDescriptor)));
  if (!descriptor)
    throw std::bad_alloc();
  descriptor->nb_objects = 1;
  descriptor->objects[0].fd = dup(dma_buf);
  if (descriptor->objects[0].fd < 0) {
    av_free(descriptor);
    throw std::runtime_error("Cannot duplicate DMA-BUF");
  }
  descriptor->objects[0].size = frame.size;
  descriptor->objects[0].format_modifier = frame.modifier;
  descriptor->nb_layers = 1;
  descriptor->layers[0].format = frame.pixel_format == PixelFormat::bgra
                                     ? DRM_FORMAT_ARGB8888
                                     : DRM_FORMAT_ABGR8888;
  descriptor->layers[0].nb_planes = 1;
  descriptor->layers[0].planes[0] = {0, frame.offset, frame.stride};
  AVBufferRef *owned =
      av_buffer_create(reinterpret_cast<uint8_t *>(descriptor),
                       sizeof(*descriptor), free_descriptor, nullptr, 0);
  if (!owned) {
    free_descriptor(nullptr, reinterpret_cast<uint8_t *>(descriptor));
    throw std::bad_alloc();
  }
  Frame input(av_frame_alloc(), free_frame);
  if (!input) {
    av_buffer_unref(&owned);
    throw std::bad_alloc();
  }
  input->buf[0] = owned;
  input->data[0] = owned->data;
  input->format = AV_PIX_FMT_DRM_PRIME;
  input->width = frame.width;
  input->height = frame.height;
  input->pts = frame.sequence;
  input->color_range = AVCOL_RANGE_JPEG;
  input->colorspace = AVCOL_SPC_RGB;
  input->color_primaries = AVCOL_PRI_BT709;
  input->color_trc = AVCOL_TRC_IEC61966_2_1;
  input->hw_frames_ctx = av_buffer_ref(frames_);
  ffmpeg_check(av_buffersrc_add_frame_flags(source_, input.get(),
                                            AV_BUFFERSRC_FLAG_KEEP_REF),
               "Import DMA-BUF");
  Frame output(av_frame_alloc(), free_frame);
  if (!output)
    throw std::bad_alloc();
  ffmpeg_check(av_buffersink_get_frame(sink_, output.get()),
               "Convert GPU frame to NV12");
  if (output->format != AV_PIX_FMT_VAAPI)
    throw std::runtime_error("GPU conversion returned a CPU frame");
  // The texture owner may recycle its DMA-BUF only after the GPU has read it.
  auto *device = reinterpret_cast<AVHWDeviceContext *>(vaapi_->data);
  auto *context = static_cast<AVVAAPIDeviceContext *>(device->hwctx);
  const VAStatus status = vaSyncSurface(
      context->display,
      static_cast<VASurfaceID>(reinterpret_cast<uintptr_t>(output->data[3])));
  if (status != VA_STATUS_SUCCESS)
    throw std::runtime_error(std::string("GPU conversion synchronization: ") +
                             vaErrorStr(status));
  return output.release();
}

void GpuConversion::dispose() {
  avfilter_graph_free(&graph_);
  av_buffer_unref(&frames_);
  av_buffer_unref(&vaapi_);
  av_buffer_unref(&drm_);
}
GpuConversion::~GpuConversion() { dispose(); }
} // namespace beam
