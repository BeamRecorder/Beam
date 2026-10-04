# Native GPU measurements

`@beam/system-metrics` separates three responsibilities:

- A versioned JSON contract in `src/gpu-types.ts`, validated at the export host boundary.
- Native counter reads in the independent `beam-system-metrics` Rust crate under `native/`.
- A bounded asynchronous collector in `src/node/gpu-monitor.cjs` and report formatting in `src/gpu-report.ts`.

The document engine has no telemetry dependency. The encoder receives the finished summary from `ExportHostServices.finalize()` or `abort()` and retains it in `ExportDiagnostics.gpuUsage`. Desktop's existing report-copy action includes these measurements. CLI export results include the same JSON summary. Native readings cannot establish rendering correctness, codec hardware acceleration or compute efficiency.

## Backends and scope

| Platform | Counter source | Scope |
| --- | --- | --- |
| Linux | DRM `/proc/PID/fdinfo`: engine busy nanoseconds or busy/total GPU cycles, normalized by engine capacity | The host's GPU processes |
| Windows | PDH `GPU Engine(*) / Utilization Percentage`, using locale-independent English counter names and exact PID matching | The host's GPU processes |
| macOS | IOKit `IOAccelerator / PerformanceStatistics`, device/renderer/tiler percentage keys when exposed | Entire GPU devices, including other applications |

Desktop obtains GPU process IDs from Electron's process inventory. That process is shared by application windows: the measure is not isolated to one editor or export worker. CLI obtains only its owned Chromium GPU process IDs through CDP. No renderer-provided process ID or arbitrary native sampling IPC is exposed.

Linux deduplicates shared DRM clients before accumulating counters, honors engine capacity, warms new clients and preserves high-water marks when a driver briefly reports regressed counters. Windows warms its persistent PDH query before returning percentages and groups matching process counters by adapter and physical engine. macOS returns only actual numeric percentages; missing keys are not interpreted as zero. Device-wide macOS values are explicitly labeled in the copied report.

## Sampling and statistics

Collection begins when the desktop destination is opened or CLI Chromium is launched, and ends before output publication. This includes export preparation; it is not a per-frame measure. A separate native protocol process keeps telemetry independent of recording commands.

The default requested interval is 1,000 ms. Each timer is scheduled after the previous read completes, and only one read can run at a time. A final read completes the last interval. Each native request has a two-second deadline. The report’s native finalization time includes completion of host diagnostics as well as file publication. Shutdown waits for the owned read and releases its native process and CLI CDP session, including after failure or cancellation.

Minimum, maximum and arithmetic sample mean cover all collected samples. Median uses a 0.1-percentage-point histogram over all samples, rather than an unbounded array or a rolling window. Storage is bounded to 128 observed engines, 1,001 bins per engine, and eight diagnostic codes. The report includes actual sample counts, unavailable reads, measured duration and median resolution. The busiest-engine statistic is the maximum engine percentage per poll, across observed devices; independent engines are never added together.

No accessible counters, unsupported drivers, lost processes, invalid native responses and missing native binaries produce structured diagnostics. A summary with no measured intervals is `unavailable`, not `0%`. Gaps remain visible even when later measurements recover. Very short exports may have no completed interval or few samples. These percentages represent sampled engine busy time; they are not instantaneous peaks or normalized shader FLOP throughput.

## Verification

Unit tests cover aggregation, protocol validation, engine capacity, DRM client deduplication, regressed counters, exact Windows PID parsing, cancellation and resource release. Native backends can be compiled and linted for Linux, Windows and macOS independently of the capture package. Real counter availability still depends on the OS, kernel, permissions and GPU driver. Windows/macOS hardware checks must run on those systems; cross-compilation is not a hardware measurement.
