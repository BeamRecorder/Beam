// Web worker for computing audio waveforms in chunks to prevent blocking the main thread

self.onmessage = (event: MessageEvent) => {
  const { type, audioData, targetPoints } = event.data

  if (type === 'process') {
    try {
      if (!audioData || !(audioData instanceof Float32Array)) {
        throw new Error('Invalid or missing audioData buffer')
      }

      const length = audioData.length
      const points = targetPoints || 1000
      const bucketSize = Math.max(1, Math.floor(length / points))

      // We will compute min and max peaks for each bucket
      const peaks = new Float32Array(points * 2) // [min1, max1, min2, max2, ...]

      // Processing in chunks to yield control/report progress
      const chunkSize = Math.max(10, Math.floor(points / 20)) // 5% chunks
      let currentPoint = 0

      function processChunk() {
        const endPoint = Math.min(currentPoint + chunkSize, points)

        for (let i = currentPoint; i < endPoint; i++) {
          const startSample = i * bucketSize
          const endSample = Math.min(startSample + bucketSize, length)

          let min = 0
          let max = 0

          for (let s = startSample; s < endSample; s++) {
            const val = audioData[s]
            if (val < min) min = val
            if (val > max) max = val
          }

          peaks[i * 2] = min
          peaks[i * 2 + 1] = max
        }

        currentPoint = endPoint

        if (currentPoint < points) {
          // Post progress with the partially filled peaks array
          const progress = Math.round((currentPoint / points) * 100)
          self.postMessage({
            type: 'progress',
            progress,
            peaks: peaks.slice(0, currentPoint * 2),
          })

          // Yield to event loop using setTimeout
          setTimeout(processChunk, 10)
        } else {
          // Completed
          self.postMessage({
            type: 'done',
            peaks: peaks,
          })
        }
      }

      processChunk()
    } catch (err: any) {
      self.postMessage({
        type: 'error',
        message: err.message || 'Unknown processing error',
      })
    }
  }
}
