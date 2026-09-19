export const HOME_PAGE_COPY = {
  announcement: {
    label: 'NEW',
    title: 'Screenshot Editor is here',
    action: 'See what it can do',
  },
  modeNavigation: 'Beam capture modes',
  modes: {
    instant: 'Instant Mode',
    studio: 'Studio Mode',
    screenshot: 'Screenshot Mode',
  },
  seeHowItWorks: 'See how Beam works',
  realProductDemo: 'Real Beam editor footage',
  overview: {
    eyebrow: 'Three capture modes',
    title: 'One app for every capture workflow.',
    text: 'Move fast with Instant, take full control in Studio, or turn a still capture into a clear visual explanation.',
  },
  cards: {
    instant: {
      title: 'A finished video, without opening a timeline.',
      text: 'Record with a saved visual preset, then let Beam render the result and place the finished file on your clipboard.',
      bestFor: 'Bug reports, quick walkthroughs, async updates',
      steps: [
        'Choose a source and an editor preset.',
        'Record your screen, camera, and supported audio.',
        'Stop to export and copy the finished file automatically.',
      ],
    },
    studio: {
      title: 'Keep every detail editable.',
      text: 'Record a local project, then shape the composition, timing, motion, captions, and sound before export.',
      bestFor: 'Product demos, tutorials, launch videos',
      steps: [
        'Capture locally with supported sources kept separate.',
        'Edit clips, layers, zooms, cursor, captions, and audio.',
        'Export the polished composition as MP4 or WebM.',
      ],
    },
    screenshot: {
      title: 'A screenshot that explains itself.',
      text: 'Capture a screen, window, or region, then crop, annotate, arrange layers, and copy the final image.',
      bestFor: 'Documentation, pull requests, support, social posts',
      steps: [
        'Capture a display, application window, or region.',
        'Crop and add shapes, arrows, text, drawing, or blur.',
        'Copy the image directly or export it as PNG or WebP.',
      ],
    },
  },
  spotlights: {
    instant: {
      eyebrow: 'Instant Mode',
      title: 'Record, stop, paste the finished file.',
      text: "Instant Mode is Beam's fast path. It keeps the source project, applies the visual preset you selected, renders locally, and copies the exported video file—never a made-up cloud link.",
      features: [
        {
          title: 'Start from your look',
          text: 'Choose a saved editor preset before recording, including its visual and export settings.',
        },
        {
          title: 'Automatic local export',
          text: 'Beam renders the recording when you stop, with progress and a real composited preview.',
        },
        {
          title: 'The video file is copied',
          text: 'Paste the completed file into any application that accepts files, or open the retained project in Studio.',
        },
      ],
    },
    studio: {
      eyebrow: 'Studio Mode',
      title: 'A complete editor built for screen recordings.',
      text: 'Studio keeps the project editable. Refine the framing, layer visuals on the canvas, control time on the timeline, and export only when it feels finished.',
      features: [
        {
          title: 'Multi-track editing',
          text: 'Trim, split, move, reorder, and style screen, camera, image, video, caption, blur, and audio content.',
        },
        {
          title: 'A designed canvas',
          text: 'Use custom backgrounds, padding, corners, shadows, frames, overlays, and reusable presets.',
        },
        {
          title: 'Motion with purpose',
          text: 'Add automatic or manual zooms, cursor treatment, transitions, captions, and 3D perspective moves.',
        },
      ],
    },
    screenshot: {
      eyebrow: 'Screenshot Mode',
      title: 'Crop, annotate, compose, then copy.',
      text: 'The Screenshot Editor uses the same visual language as Studio without the timeline. Every image, shape, cursor, effect, and annotation stays arranged as a layer.',
      features: [
        {
          title: 'Elements and layers',
          text: 'Add images from the clipboard, shapes, arrows, text, freehand drawing, cursors, blur, and highlights.',
        },
        {
          title: 'Direct cropping',
          text: 'Double-click a crop-capable image or use Crop, then adjust the visible area without destroying the source.',
        },
        {
          title: 'Copy and paste as a workflow',
          text: 'Paste a captured image into the composition, or copy selected layers with thumbnails and reuse them across editors.',
        },
      ],
    },
  },
} as const;
