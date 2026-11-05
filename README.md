# Pro Camera

A browser camera app that captures full-resolution photos and processes them with a GPU color pipeline (exposure, white balance, highlight/shadow recovery, contrast curve, vibrance, sharpening, vignette, film grain). Static site, no build step, no dependencies.

## Features

- Full-sensor stills where the browser supports it (`ImageCapture.takePhoto`, Chrome/Edge on Android and desktop); otherwise the highest-resolution video frame
- Live preview uses the same shader as the saved photo, so what you see is what you get
- Looks: Natural, Portrait, Vivid, Neutral, Film, Mono, plus 11 manual sliders (saved between visits)
- 3:2 (DSLR), 4:3, 16:9, 1:1 or full-frame crop
- Pro controls when the camera exposes them: zoom, EV, ISO, manual focus, white balance (K), torch
- Timer (3s / 10s), rule-of-thirds grid, hold-to-compare with the original, front/back/lens switching
- JPG (quality 95) or PNG output, in-page gallery with download and share

## Deploy on GitHub Pages

1. Create a repository and upload `index.html`, `style.css`, `app.js` and `README.md` to the root.
2. Go to **Settings > Pages**, set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, then Save.
3. Open `https://<your-username>.github.io/<repo-name>/` after a minute or two.

Camera access requires HTTPS, which GitHub Pages provides. To test locally, run `python3 -m http.server` and open `http://localhost:8000`.

## Honest notes on image quality

The look comes from the processing, but a web page cannot exceed the camera hardware. A phone or webcam sensor is far smaller than a Canon or Nikon DSLR sensor, so expect better color, contrast and sharpness, not DSLR depth of field or low-light performance. For the best results:

- Use Chrome on Android (or desktop Chrome/Edge); iOS Safari only provides video-frame capture and no manual controls.
- Shoot in good light and keep the lens clean.
- Use the Camera tab to lower ISO or fix focus where available.

## Browser support

Needs WebGL and `getUserMedia`. Manual controls depend on the browser and device.

## License

Add the license of your choice.
