/**
 * Yuzni aniqlash va 128-o'lchamli descriptor olish (brauzerda, face-api.js).
 * Model fayllari /models dan yuklanadi — tashqi CDN kerak emas (oflayn ishlaydi).
 */
let lib = null;
let loading = null;
let ready = false;

/* face-api og'ir (~1.4 MB) — faqat kamera kerak bo'lganda yuklanadi. */
async function getLib() {
  if (!lib) lib = await import('@vladmandic/face-api');
  return lib;
}

export const detectorOptions = (faceapi) =>
  new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

export function modelsReady() {
  return ready;
}

export async function loadModels() {
  if (ready) return true;
  if (loading) return loading;
  loading = (async () => {
    const faceapi = await getLib();
    const { tf } = faceapi;
    // WebGL bo'lmasa (eski telefon, ba'zi planshetlar) — CPU zaxira varianti.
    // tf.ready() ni oldin chaqirmaymiz: u mavjud bo'lmagan wasm backend'ni tanlab xato beradi.
    let backend = '';
    for (const candidate of ['webgl', 'cpu']) {
      try {
        // eslint-disable-next-line no-await-in-loop
        if (await tf.setBackend(candidate)) {
          backend = candidate;
          break;
        }
      } catch (error) {
        /* keyingi backend sinaladi */
      }
    }
    if (!backend) throw new Error('TensorFlow backend ishga tushmadi');
    await tf.ready();
    await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
    ready = true;
    return true;
  })();
  return loading;
}

/** Bitta yuzni topadi: { descriptor, box, score, landmarks } yoki null. */
export async function detectFace(input) {
  await loadModels();
  const faceapi = await getLib();
  const result = await faceapi
    .detectSingleFace(input, detectorOptions(faceapi))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!result) return null;
  const box = result.detection.box;
  return {
    descriptor: Array.from(result.descriptor),
    score: result.detection.score,
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
    landmarks: result.landmarks.positions.map((point) => ({ x: point.x, y: point.y })),
  };
}

/** Ko'z ochiq/yopiq nisbati (Eye Aspect Ratio) — miltillashni aniqlash uchun. */
export function eyeAspect(landmarks) {
  if (!landmarks || landmarks.length < 68) return 1;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ratio = (points) =>
    (dist(points[1], points[5]) + dist(points[2], points[4])) / (2 * Math.max(dist(points[0], points[3]), 0.001));
  return (ratio(landmarks.slice(36, 42)) + ratio(landmarks.slice(42, 48))) / 2;
}

/**
 * Jonlilik: miltillash + yuz o'lchami + bir necha kadr barqarorligi.
 * Bu oddiy anti-spoofing; yuqori xavf uchun sertifikatlangan SDK tavsiya etiladi.
 */
export function createLiveness() {
  let blinks = 0;
  let wasOpen = true;
  return {
    feed(landmarks) {
      const ear = eyeAspect(landmarks);
      if (wasOpen && ear < 0.19) {
        blinks += 1;
      }
      wasOpen = ear > 0.24;
      return { ear, blinks, passed: blinks >= 1 };
    },
    reset() {
      blinks = 0;
      wasOpen = true;
    },
    get blinks() {
      return blinks;
    },
  };
}

export function faceBoxStyle(box, video, mirrored = true) {
  if (!box || !video) return null;
  const width = video.videoWidth || video.clientWidth;
  const height = video.videoHeight || video.clientHeight;
  const scale = Math.max(video.clientWidth / width, video.clientHeight / height);
  const offsetX = (video.clientWidth - width * scale) / 2;
  const offsetY = (video.clientHeight - height * scale) / 2;
  let left = box.x * scale + offsetX;
  if (mirrored) left = video.clientWidth - left - box.width * scale;
  return {
    left,
    top: box.y * scale + offsetY,
    width: box.width * scale,
    height: box.height * scale,
  };
}
