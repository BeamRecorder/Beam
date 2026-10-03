#pragma once

#include <stdexcept>
#include <string>
extern "C" {
#include <libavutil/error.h>
}

namespace beam {
inline void ffmpeg_check(int result, const char *stage) {
  if (result >= 0)
    return;
  char message[AV_ERROR_MAX_STRING_SIZE];
  av_strerror(result, message, sizeof(message));
  throw std::runtime_error(std::string(stage) + ": " + message);
}
} // namespace beam
