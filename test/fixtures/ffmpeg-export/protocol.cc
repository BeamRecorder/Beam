#include "frame-protocol.h"
#include <cassert>
#include <functional>
#include <iostream>

int main() {
  beam::FrameDescriptor valid;
  valid.width = 640;
  valid.height = 360;
  valid.stride = 2560;
  valid.size = 921600;
  beam::validate_frame(valid);
  const std::function<void(beam::FrameDescriptor &)> invalid[] = {
      [](auto &f) { f.magic = 0; },
      [](auto &f) { f.reserved = 1; },
      [](auto &f) { f.width = 0; },
      [](auto &f) { f.height = 3; },
      [](auto &f) { f.width = 8194; },
      [](auto &f) { f.pixel_format = static_cast<beam::PixelFormat>(10); },
      [](auto &f) { f.stride = 1; },
      [](auto &f) { f.size = 1; },
      [](auto &f) { f.offset = UINT32_MAX; },
      [](auto &f) { f.size = 1024ULL * 1024 * 1024 + 1; },
  };
  for (auto mutate : invalid) {
    auto frame = valid;
    mutate(frame);
    bool rejected = false;
    try {
      beam::validate_frame(frame);
    } catch (const std::runtime_error &) {
      rejected = true;
    }
    assert(rejected);
  }
  valid.pixel_format = beam::PixelFormat::rgba;
  valid.modifier = UINT64_MAX;
  beam::validate_frame(valid);
  std::cout << "GPU descriptor validation passed\n";
}
