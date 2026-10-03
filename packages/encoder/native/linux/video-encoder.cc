#include "video-encoder.h"
#include "ffmpeg-error.h"
#include <algorithm>
#include <new>
extern "C" {
#include <libavutil/opt.h>
}

namespace beam {
VideoEncoder::VideoEncoder(AVFrame *first, int fps, int bitrate,
                           const std::string &format, const char *destination,
                           uint32_t frame_count, int64_t duration_us)
    : frame_count_(frame_count), duration_us_(duration_us) {
  try {
    if (format != "mp4" && format != "webm")
      throw std::runtime_error("Unsupported export container");
    const auto *codec = avcodec_find_encoder_by_name(
        format == "mp4" ? "h264_vaapi" : "vp9_vaapi");
    if (!codec)
      throw std::runtime_error(
          "FFmpeg has no VA-API encoder for this container");
    encoder_ = avcodec_alloc_context3(codec);
    if (!encoder_)
      throw std::bad_alloc();
    encoder_->width = first->width;
    encoder_->height = first->height;
    encoder_->pix_fmt = AV_PIX_FMT_VAAPI;
    encoder_->time_base = {1, fps};
    encoder_->framerate = {fps, 1};
    encoder_->bit_rate = bitrate;
    encoder_->gop_size = fps * 2;
    encoder_->max_b_frames = 0;
    encoder_->color_range = AVCOL_RANGE_MPEG;
    encoder_->colorspace = AVCOL_SPC_BT709;
    encoder_->color_primaries = AVCOL_PRI_BT709;
    encoder_->color_trc = AVCOL_TRC_BT709;
    encoder_->hw_frames_ctx = av_buffer_ref(first->hw_frames_ctx);
    if (!encoder_->hw_frames_ctx)
      throw std::bad_alloc();
    encoder_->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;
    ffmpeg_check(av_opt_set(encoder_->priv_data, "rc_mode", "VBR", 0),
                 "Select native variable bitrate");
    ffmpeg_check(avcodec_open2(encoder_, codec, nullptr),
                 "Open VA-API encoder");
    if (format == "webm") {
      // VA-API VP9 drivers can omit the matrix from the bitstream. Keep coded
      // frames GPU-resident and correct only the compressed packet metadata.
      ffmpeg_check(av_bsf_alloc(av_bsf_get_by_name("vp9_metadata"), &metadata_),
                   "Create VP9 color metadata filter");
      ffmpeg_check(avcodec_parameters_from_context(metadata_->par_in, encoder_),
                   "Configure VP9 metadata input");
      metadata_->time_base_in = encoder_->time_base;
      ffmpeg_check(av_opt_set(metadata_->priv_data, "color_space", "bt709", 0),
                   "Set VP9 color matrix");
      ffmpeg_check(av_opt_set(metadata_->priv_data, "color_range", "tv", 0),
                   "Set VP9 color range");
      ffmpeg_check(av_bsf_init(metadata_), "Initialize VP9 color metadata");
    }
    ffmpeg_check(avformat_alloc_output_context2(&output_, nullptr,
                                                format.c_str(), destination),
                 "Create export container");
    stream_ = avformat_new_stream(output_, nullptr);
    if (!stream_)
      throw std::bad_alloc();
    stream_->time_base = encoder_->time_base;
    stream_->avg_frame_rate = encoder_->framerate;
    ffmpeg_check(avcodec_parameters_from_context(stream_->codecpar, encoder_),
                 "Configure container video");
    ffmpeg_check(avio_open(&output_->pb, destination, AVIO_FLAG_WRITE),
                 "Open staged export");
    ffmpeg_check(avformat_write_header(output_, nullptr),
                 "Write container header");
    packet_ = av_packet_alloc();
    if (!packet_)
      throw std::bad_alloc();
  } catch (...) {
    dispose();
    throw;
  }
}

void VideoEncoder::receive() {
  while (true) {
    const int result = avcodec_receive_packet(encoder_, packet_);
    if (result == AVERROR(EAGAIN) || result == AVERROR_EOF)
      return;
    ffmpeg_check(result, "Receive hardware encoded packet");
    if (metadata_) {
      ffmpeg_check(av_bsf_send_packet(metadata_, packet_),
                   "Correct VP9 metadata");
      ffmpeg_check(av_bsf_receive_packet(metadata_, packet_),
                   "Receive VP9 metadata packet");
    }
    ++packets;
    bytes += packet_->size;
    if (packet_->flags & AV_PKT_FLAG_KEY)
      ++keyframes;
    if (!packet_->duration)
      packet_->duration = 1;
    av_packet_rescale_ts(packet_, encoder_->time_base, stream_->time_base);
    if (packets == frame_count_) {
      const int64_t end = av_rescale_q(duration_us_, AVRational{1, 1000000},
                                       stream_->time_base);
      packet_->duration = std::max<int64_t>(1, end - packet_->pts);
    }
    packet_->stream_index = stream_->index;
    ffmpeg_check(av_interleaved_write_frame(output_, packet_),
                 "Mux encoded video packet");
    av_packet_unref(packet_);
  }
}
void VideoEncoder::submit(AVFrame *frame) {
  ffmpeg_check(avcodec_send_frame(encoder_, frame), "Submit VA-API frame");
  receive();
}
void VideoEncoder::finish() {
  ffmpeg_check(avcodec_send_frame(encoder_, nullptr), "Flush VA-API encoder");
  receive();
  ffmpeg_check(av_write_trailer(output_), "Finalize video container");
  ffmpeg_check(avio_closep(&output_->pb), "Close staged export");
}
void VideoEncoder::dispose() {
  av_packet_free(&packet_);
  av_bsf_free(&metadata_);
  avcodec_free_context(&encoder_);
  if (output_) {
    if (output_->pb)
      avio_closep(&output_->pb);
    avformat_free_context(output_);
    output_ = nullptr;
  }
}
VideoEncoder::~VideoEncoder() { dispose(); }
} // namespace beam
