These files are the loader for ffmpeg.wasm (@ffmpeg/ffmpeg 0.12.15, MIT licence,
https://github.com/ffmpegwasm/ffmpeg.wasm). They are used only by the "Convert to MP4" button.
The converter itself (@ffmpeg/core 0.12.10, GPL-2.0-or-later, about 31 MB) is downloaded from
the jsDelivr CDN the first time a video is converted, and runs on the user's own computer.
