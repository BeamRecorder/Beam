#pragma once

#include <cstdint>
#include <stdexcept>
#include <string>

namespace beam {
constexpr uint32_t protocol_magic = 0x42474d31;
enum class PixelFormat : uint32_t { bgra = 1, rgba = 2 };

// Metadata only. The DMA-BUF descriptor travels separately through SCM_RIGHTS.
struct FrameDescriptor {
  uint32_t magic = protocol_magic;
  uint32_t sequence = 0;
  uint32_t width = 0;
  uint32_t height = 0;
  uint32_t stride = 0;
  uint32_t offset = 0;
  uint64_t size = 0;
  uint64_t modifier = 0;
  PixelFormat pixel_format = PixelFormat::bgra;
  uint32_t reserved = 0;
};

inline void validate_frame(const FrameDescriptor &frame) {
  if (frame.magic != protocol_magic || frame.reserved != 0)
    throw std::runtime_error("Invalid GPU frame protocol");
  if (!frame.width || !frame.height || frame.width > 8192 ||
      frame.height > 8192 || frame.width % 2 || frame.height % 2)
    throw std::runtime_error("Invalid GPU frame dimensions");
  if (frame.pixel_format != PixelFormat::bgra &&
      frame.pixel_format != PixelFormat::rgba)
    throw std::runtime_error("Only BGRA/RGBA GPU frames are supported");
  const uint64_t row_bytes = uint64_t(frame.width) * 4;
  const uint64_t required = uint64_t(frame.offset) +
                            uint64_t(frame.height - 1) * frame.stride +
                            row_bytes;
  if (frame.stride < row_bytes || frame.size < required ||
      frame.size > 1024ULL * 1024 * 1024)
    throw std::runtime_error("Invalid DMA-BUF plane bounds");
}
} // namespace beam
