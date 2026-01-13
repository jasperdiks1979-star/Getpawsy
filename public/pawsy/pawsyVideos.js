// Pawsy Video Mapping — SIMPLIFIED FILENAMES
// Updated: December 20, 2025 | 8 video files in /public/pawsy/videos/

const PAWSY_VIDEOS = {
  idle: [
    '/pawsy/videos/pawsy_1.mp4',
    '/pawsy/videos/pawsy_2.mp4',
    '/pawsy/videos/pawsy_8.mp4'
  ],
  
  listening: [
    '/pawsy/videos/pawsy_7.mp4',
    '/pawsy/videos/pawsy_6.mp4'
  ],
  
  thinking: [
    '/pawsy/videos/pawsy_5.mp4',
    '/pawsy/videos/pawsy_4.mp4'
  ],
  
  talking: [
    '/pawsy/videos/pawsy_3.mp4'
  ],
  
  happy: [
    '/pawsy/videos/pawsy_6.mp4'
  ],
  
  surprised: [
    '/pawsy/videos/pawsy_4.mp4'
  ],
  
  error: [
    '/pawsy/videos/pawsy_3.mp4'
  ]
};

function getRandomVideo(state) {
  const videos = PAWSY_VIDEOS[state] || PAWSY_VIDEOS.idle;
  if (!Array.isArray(videos)) return videos;
  return videos[Math.floor(Math.random() * videos.length)];
}

console.log('[Pawsy] Video mapping initialized with 8 files');
console.log('[Pawsy] States: idle (3), listening (2), thinking (2), talking (1), happy (1), surprised (1), error (1)');
