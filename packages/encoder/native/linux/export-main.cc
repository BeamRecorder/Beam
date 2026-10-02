#include "gpu-conversion.h"
#include "process-lifetime.h"
#include "video-encoder.h"
#include <cerrno>
#include <chrono>
#include <cstring>
#include <iostream>
#include <memory>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>

namespace {
class Descriptor {
public:
  explicit Descriptor(int value) : value(value) {}
  ~Descriptor() {
    if (value >= 0)
      close(value);
  }
  int value;
};
beam::FrameDescriptor receive(int connection, int &dma_buf) {
  beam::FrameDescriptor frame;
  iovec payload{&frame, sizeof(frame)};
  alignas(cmsghdr) char control[CMSG_SPACE(4 * sizeof(int))]{};
  msghdr message{};
  message.msg_iov = &payload;
  message.msg_iovlen = 1;
  message.msg_control = control;
  message.msg_controllen = sizeof(control);
  const auto bytes = recvmsg(connection, &message, MSG_CMSG_CLOEXEC);
  int descriptors = 0;
  for (auto *header = CMSG_FIRSTHDR(&message); header;
       header = CMSG_NXTHDR(&message, header)) {
    if (header->cmsg_level != SOL_SOCKET || header->cmsg_type != SCM_RIGHTS)
      continue;
    const size_t count = (header->cmsg_len - CMSG_LEN(0)) / sizeof(int);
    for (size_t i = 0; i < count; ++i) {
      int received;
      std::memcpy(&received, CMSG_DATA(header) + i * sizeof(int),
                  sizeof(received));
      if (descriptors++ == 0)
        dma_buf = received;
      else
        close(received);
    }
  }
  if (bytes != sizeof(frame) || message.msg_flags & (MSG_TRUNC | MSG_CTRUNC) ||
      descriptors != 1)
    throw std::runtime_error("Invalid GPU descriptor transport");
  beam::validate_frame(frame);
  return frame;
}
} // namespace

int main(int argc, char **argv) {
  try {
    beam::bind_parent_lifetime();
    if (argc != 11)
      throw std::runtime_error(
          "Expected socket, destination, width, height, fps, bitrate, format, "
          "frame count, duration in microseconds and DRM device");
    const int width = std::stoi(argv[3]), height = std::stoi(argv[4]),
              fps = std::stoi(argv[5]);
    const int bitrate = std::stoi(argv[6]);
    const uint32_t count = std::stoul(argv[8]);
    const int64_t duration_us = std::stoll(argv[9]);
    if (width < 2 || height < 2 || width > 8192 || height > 8192 || fps < 1 ||
        fps > 120 || width % 2 || height % 2 || bitrate < 1000 ||
        bitrate > 1000000000 || !count || count > 10368000 ||
        duration_us <= 0 || duration_us > 86400000000LL ||
        (std::string(argv[7]) != "mp4" && std::string(argv[7]) != "webm"))
      throw std::runtime_error("Invalid export configuration");
    av_log_set_level(AV_LOG_WARNING);
    Descriptor listener(socket(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0));
    if (listener.value < 0)
      throw std::runtime_error("Cannot create GPU receiver");
    sockaddr_un address{};
    address.sun_family = AF_UNIX;
    if (std::strlen(argv[1]) >= sizeof(address.sun_path))
      throw std::runtime_error("GPU socket path is too long");
    std::strcpy(address.sun_path, argv[1]);
    if (bind(listener.value, reinterpret_cast<sockaddr *>(&address),
             sizeof(address)) ||
        chmod(argv[1], 0600) || listen(listener.value, 1))
      throw std::runtime_error(std::string("Create private GPU transport: ") +
                               std::strerror(errno));
    std::cout << "BEAM_FFMPEG_READY\n" << std::flush;
    std::unique_ptr<beam::GpuConversion> conversion;
    std::unique_ptr<beam::VideoEncoder> encoder;
    double conversion_ms = 0, encoding_ms = 0;
    using Clock = std::chrono::steady_clock;
    const auto elapsed = [](Clock::time_point start) {
      return std::chrono::duration<double, std::milli>(Clock::now() - start)
          .count();
    };
    for (uint32_t sequence = 0; sequence < count; ++sequence) {
      Descriptor connection(
          accept4(listener.value, nullptr, nullptr, SOCK_CLOEXEC));
      if (connection.value < 0)
        throw std::runtime_error("Cannot accept GPU frame");
      ucred peer{};
      socklen_t peer_size = sizeof(peer);
      if (getsockopt(connection.value, SOL_SOCKET, SO_PEERCRED, &peer,
                     &peer_size) ||
          peer.uid != getuid())
        throw std::runtime_error("Unauthorized GPU transport peer");
      Descriptor dma_buf(-1);
      const auto frame = receive(connection.value, dma_buf.value);
      if (frame.sequence != sequence || frame.width != uint32_t(width) ||
          frame.height != uint32_t(height))
        throw std::runtime_error(
            "GPU frame order or dimensions do not match the export job");
      const auto conversion_start = Clock::now();
      if (!conversion)
        conversion =
            std::make_unique<beam::GpuConversion>(frame, argv[10], fps);
      AVFrame *converted = conversion->convert(frame, dma_buf.value);
      conversion_ms += elapsed(conversion_start);
      const auto encoding_start = Clock::now();
      try {
        if (!encoder)
          encoder = std::make_unique<beam::VideoEncoder>(
              converted, fps, bitrate, argv[7], argv[2], count, duration_us);
        encoder->submit(converted);
      } catch (...) {
        av_frame_free(&converted);
        throw;
      }
      av_frame_free(&converted);
      encoding_ms += elapsed(encoding_start);
      if (send(connection.value, "ok", 2, MSG_NOSIGNAL) != 2)
        throw std::runtime_error("GPU texture owner disconnected");
    }
    const auto flush_start = Clock::now();
    encoder->finish();
    encoding_ms += elapsed(flush_start);
    if (encoder->packets != count)
      throw std::runtime_error("Hardware encoder did not produce every frame");
    std::cout << "BEAM_FFMPEG_RESULT={\"packets\":" << encoder->packets
              << ",\"bytes\":" << encoder->bytes
              << ",\"keyframes\":" << encoder->keyframes
              << ",\"conversionMs\":" << conversion_ms
              << ",\"encodingMs\":" << encoding_ms << "}\n"
              << std::flush;
    unlink(argv[1]);
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
