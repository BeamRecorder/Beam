#pragma once

#include <csignal>
#include <stdexcept>
#include <sys/prctl.h>
#include <unistd.h>

namespace beam {
inline void bind_parent_lifetime() {
  const pid_t parent = getppid();
  if (parent == 1 || prctl(PR_SET_PDEATHSIG, SIGKILL) != 0 ||
      getppid() != parent)
    throw std::runtime_error("The GPU export owner is unavailable");
}
} // namespace beam
