/**
 * Build the "Celeb Close-Up" image set.
 *
 *   node scripts/build-celeb-images.mjs
 *   node scripts/build-celeb-images.mjs --force
 *   node scripts/build-celeb-images.mjs --only=alia-bhatt,shah-rukh-khan
 *
 * What it does:
 *   1. Finds a lead portrait for every celebrity in celeb-manifest.mjs on
 *      Wikipedia / Wikimedia Commons.
 *   2. Runs a YuNet face detector (OpenCV, build time only) over the
 *      candidates and picks the most prominent, most central face.
 *   3. Uses that face box plus the eye/nose/mouth landmarks to auto-crop the
 *      four game features (eyes, nose, lips, hair) and a square reveal image.
 *   4. Writes a manifest, an attribution file and a SQL seed migration.
 *   5. Writes QA contact sheets to backend/.cache/qa/ so the crops can be
 *      eyeballed before shipping.
 *
 * The app itself only needs the generated JPEGs in backend/public. OpenCV and
 * Python are build dependencies, not runtime dependencies.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { CELEBRITIES } from "./celeb-manifest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = resolve(here, "..");
const PUBLIC_DIR = join(BACKEND_DIR, "public", "celebrities", "celeb-closeup");
const CACHE_DIR = join(BACKEND_DIR, ".cache", "celeb-sources");
const CANDIDATE_DIR = join(CACHE_DIR, "candidates");
const SOURCE_DIR = join(CACHE_DIR, "sources");
const QA_DIR = join(BACKEND_DIR, ".cache", "qa");
const MODEL_PATH = join(CACHE_DIR, "face_detection_yunet_2023mar.onnx");
const MANIFEST_PATH = join(PUBLIC_DIR, "manifest.json");
const ATTRIBUTION_PATH = join(PUBLIC_DIR, "ATTRIBUTION.md");
const SQL_PATH = join(BACKEND_DIR, "db", "migrations", "0003_celeb_closeup.sql");

const GAME_CODE = "celeb-closeup";
const GAME_PATH = `/${["celebrities", "celeb-closeup"].join("/")}`;
const USER_AGENT =
  "MinuteWarCelebGame/1.0 (build script; https://minutewar.in; dev@minutewar.in)";
const THUMB_WIDTH = 1280;
const FEATURE_SIZE = 400;
const REVEAL_SIZE = 520;

const args = process.argv.slice(2);
const force = args.includes("--force");
const skipQa = args.includes("--no-qa");
const onlyArg = args.find((arg) => arg.startsWith("--only="));
const only = onlyArg
  ? new Set(onlyArg.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean))
  : null;

const selectedCelebrities = CELEBRITIES.filter((c) => !only || only.has(c.slug));

// ---------------------------------------------------------------------------
// HTTP helpers. Wikimedia asks for a descriptive User-Agent and will rate
// limit (429) bursts; a short backoff is all that is needed for a build.
// ---------------------------------------------------------------------------

async function fetchWithRetry(url, options = {}, tries = 5) {
  let lastError;

  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: options.accept ?? "*/*",
          ...(options.headers ?? {}),
        },
      });

      if (res.ok) return res;

      if (res.status === 429 || res.status === 503) {
        const retryAfter = Number(res.headers.get("retry-after") ?? 0);
        const wait = retryAfter > 0 ? retryAfter * 1000 : 1500 * 2 ** attempt;
        await sleep(Math.min(wait, 20_000));
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }

      throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      lastError = err;
      await sleep(700 * 2 ** attempt);
    }
  }

  throw lastError ?? new Error(`Could not fetch ${url}`);
}

async function getJson(url) {
  const res = await fetchWithRetry(url, { accept: "application/json" });
  return res.json();
}

async function download(url, destination) {
  const res = await fetchWithRetry(url, { accept: "image/*" });
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 2000) {
    throw new Error(`Suspiciously small image (${bytes.length} bytes): ${url}`);
  }
  await writeFile(destination, bytes);
  return bytes.length;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

// ---------------------------------------------------------------------------
// Face detection
// ---------------------------------------------------------------------------

async function ensureFaceModel() {
  await mkdir(CACHE_DIR, { recursive: true });

  if (existsSync(MODEL_PATH)) {
    const info = await stat(MODEL_PATH);
    if (info.size > 200_000) return;
    await rm(MODEL_PATH, { force: true });
  }

  console.log("  downloading YuNet face model...");
  const url =
    "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx";
  const res = await fetchWithRetry(url, { accept: "application/octet-stream" });
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 100_000) {
    throw new Error(`Face model download was only ${bytes.length} bytes`);
  }
  await writeFile(MODEL_PATH, bytes);
}

function pythonExecutable() {
  return process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
}

async function detectFaces(files) {
  if (files.length === 0) return [];

  const result = await new Promise((resolvePromise, reject) => {
    const child = spawn(pythonExecutable(), [join(here, "lib", "face-detect.py")], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Face detector exited with ${code}. Is Python + opencv-python-headless installed?\n${stderr}`
          )
        );
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout));
      } catch (err) {
        reject(new Error(`Face detector returned invalid JSON: ${err.message}\n${stdout}`));
      }
    });

    child.stdin.end(JSON.stringify({ model: MODEL_PATH, files }));
  });

  return result;
}

// ---------------------------------------------------------------------------
// Candidate discovery
// ---------------------------------------------------------------------------

function stripHtml(value) {
  if (!value) return "";
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extmetaValue(meta, key) {
  return meta?.[key]?.value ?? "";
}

function normaliseTitle(value) {
  return String(value ?? "")
    .replace(/^File:/i, "")
    .replace(/_/g, " ")
    .toLowerCase();
}

function titleRelevance(title, celeb) {
  const t = normaliseTitle(title);
  const name = celeb.name.toLowerCase();
  let score = 0;

  if (t.includes(name)) score += 24;
  else {
    const tokens = name.split(/\s+/).filter((token) => token.length > 2);
    const hits = tokens.filter((token) => t.includes(token)).length;
    score += hits * 4;
    if (hits === tokens.length && tokens.length > 1) score += 8;
  }

  if (/portrait|headshot|studio|close.?up|face/.test(t)) score += 6;
  if (/\b20(1[5-9]|2[0-6])\b/.test(t)) score += 3;

  // These are usually group shots or objects, not a usable single face.
  if (/\b(with|and|family|group|couple|team|trophy|award|ceremony)\b/.test(t)) score -= 20;

  return score;
}

const BAD_TITLE =
  /signature|logo|autograph|handwriting|poster|statue|wax|doll|cartoon|drawing|sketch|stamp|coin|screenshot|magazine cover|book cover|album cover|svg|icon|map/i;
const BAD_WORDS_FOR_SINGLE_FACE =
  /\b(with|and|family|group|couple|team|wedding|birthday party)\b/i;

function candidateFromImageInfo(page, info, extra = {}) {
  const title = page?.title ?? info?.title ?? "";
  const width = Number(info?.thumbwidth ?? info?.width ?? 0);
  const height = Number(info?.thumbheight ?? info?.height ?? 0);
  const originalWidth = Number(info?.width ?? width);
  const originalHeight = Number(info?.height ?? height);
  const mime = String(info?.mime ?? "");

  if (!info?.url || !width || !height) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) return null;
  if ((originalWidth < 550 || originalHeight < 550) && !extra.allowSmall) return null;
  if (originalWidth / originalHeight < 0.45 || originalWidth / originalHeight > 2.1) return null;
  if (BAD_TITLE.test(title)) return null;

  const meta = info.extmetadata ?? {};

  return {
    title,
    url: info.thumburl || info.url,
    pageUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
    sourceUrl: info.url,
    width,
    height,
    originalWidth,
    originalHeight,
    mime,
    license: stripHtml(extmetaValue(meta, "LicenseShortName")) || "See source",
    licenseUrl: extmetaValue(meta, "LicenseUrl"),
    artist: stripHtml(extmetaValue(meta, "Artist")) || "Unknown",
    credit: stripHtml(extmetaValue(meta, "Credit")),
    description: stripHtml(extmetaValue(meta, "ImageDescription")),
    date: stripHtml(extmetaValue(meta, "DateTimeOriginal")),
    ...extra,
  };
}

async function getPageImageCandidate(celeb) {
  const url =
    "https://en.wikipedia.org/w/api.php" +
    "?action=query&format=json&redirects=1" +
    `&titles=${encodeURIComponent(celeb.page)}` +
    "&prop=pageimages&piprop=name|original|thumbnail&pithumbsize=1280";

  const json = await getJson(url);
  const page = Object.values(json?.query?.pages ?? {})[0];
  const fileName = page?.pageimage;

  if (!fileName) return [];

  const infoUrl =
    "https://commons.wikimedia.org/w/api.php" +
    "?action=query&format=json" +
    `&titles=${encodeURIComponent(`File:${fileName}`)}` +
    "&prop=imageinfo&iiprop=url|size|mime|extmetadata" +
    `&iiurlwidth=${THUMB_WIDTH}`;

  const infoJson = await getJson(infoUrl);
  const infoPage = Object.values(infoJson?.query?.pages ?? {})[0];
  const info = infoPage?.imageinfo?.[0];
  const candidate = candidateFromImageInfo(infoPage, info, {
    fromPage: true,
    titleScore: titleRelevance(fileName, celeb) + 18,
  });

  return candidate ? [candidate] : [];
}

async function getOverrideCandidate(celeb) {
  if (!celeb.override) return [];

  const url =
    "https://commons.wikimedia.org/w/api.php" +
    "?action=query&format=json" +
    `&titles=${encodeURIComponent(celeb.override)}` +
    "&prop=imageinfo&iiprop=url|size|mime|extmetadata" +
    `&iiurlwidth=${THUMB_WIDTH}`;

  const json = await getJson(url);
  const page = Object.values(json?.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  const candidate = candidateFromImageInfo(page, info, {
    fromPage: true,
    titleScore: 1000,
    allowSmall: true,
  });

  return candidate ? [candidate] : [];
}

async function getSearchCandidates(celeb) {
  const searchTerm = celeb.search || celeb.name;
  const url =
    "https://commons.wikimedia.org/w/api.php" +
    "?action=query&format=json" +
    "&generator=search&gsrnamespace=6" +
    `&gsrsearch=${encodeURIComponent(`${searchTerm} filetype:bitmap`)}` +
    "&gsrlimit=40" +
    "&prop=imageinfo&iiprop=url|size|mime|extmetadata" +
    `&iiurlwidth=${THUMB_WIDTH}`;

  const json = await getJson(url);
  const pages = Object.values(json?.query?.pages ?? {}).sort(
    (a, b) => Number(a.index ?? 0) - Number(b.index ?? 0)
  );

  const candidates = [];
  for (const page of pages) {
    const info = page?.imageinfo?.[0];
    const title = page?.title ?? "";
    if (!title) continue;

    // The search engine is good at relevance but not perfect. Require at
    // least one name token in the file title so an unrelated event photo
    // cannot win just because it is high resolution.
    const tokens = celeb.name
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length > 2);
    const titleLower = normaliseTitle(title);
    if (tokens.length > 0 && !tokens.some((token) => titleLower.includes(token))) continue;

    const candidate = candidateFromImageInfo(page, info, {
      fromPage: false,
      titleScore: titleRelevance(title, celeb),
    });
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function candidateOrder(candidates) {
  const seen = new Set();
  return candidates
    .filter((candidate) => {
      const key = normaliseTitle(candidate.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const titleCmp = b.titleScore - a.titleScore;
      if (titleCmp !== 0) return titleCmp;
      return b.originalWidth * b.originalHeight - a.originalWidth * a.originalHeight;
    });
}

// ---------------------------------------------------------------------------
// Source normalisation + scoring
// ---------------------------------------------------------------------------

async function normaliseImage(input, output) {
  await sharp(input)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toFile(output);

  const meta = await sharp(output).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

function geometryScore(face) {
  const lm = face.landmarks;
  const eyeDistance = distance(lm.rightEye, lm.leftEye);
  const mouthWidth = distance(lm.mouthRight, lm.mouthLeft);
  const width = Math.max(1, face.box.w);
  const height = Math.max(1, face.box.h);

  let score = 0;
  const eyeRatio = eyeDistance / width;
  const mouthRatio = mouthWidth / width;
  const aspect = width / height;

  // A human face at any angle has these ratios. A hand or poster detected as
  // a face usually does not.
  if (eyeRatio > 0.25 && eyeRatio < 0.72) score += 12;
  else score -= 20;
  if (mouthRatio > 0.16 && mouthRatio < 0.62) score += 8;
  else score -= 10;
  if (aspect > 0.55 && aspect < 1.35) score += 8;
  else score -= 12;

  // Landmarks should sit inside the box, not in the margin.
  const points = Object.values(lm);
  const inside = points.filter(
    (point) =>
      point.x > face.box.x - width * 0.12 &&
      point.x < face.box.x + width * 1.12 &&
      point.y > face.box.y - height * 0.12 &&
      point.y < face.box.y + height * 1.12
  ).length;
  score += inside * 2;

  return score;
}

function faceQuality(face) {
  // Confidence is deliberately the dominant term. A low-confidence giant box
  // is almost always a false positive, and a real face in a small box is
  // better for a close-up game.
  return Math.pow(Math.max(0, face.score), 3) * 120 + geometryScore(face);
}

function detectionScore(candidate, detection) {
  const faces = detection?.faces ?? [];
  if (faces.length === 0) return -1_000_000;

  const ranked = [...faces].sort((a, b) => faceQuality(b) - faceQuality(a));
  const face = ranked[0];
  const faceArea = face.box.w * face.box.h;
  const imageArea = Math.max(1, candidate.width * candidate.height);
  const areaFraction = faceArea / imageArea;

  if (face.score < 0.66) return -1_000_000;
  if (areaFraction < 0.006) return -1_000_000;
  if (face.box.w < 70 || face.box.h < 70) return -1_000_000;

  let score = faceQuality(face);
  score += Math.min(areaFraction / 0.22, 1) * 24;
  score += Math.min(face.box.w / 550, 1) * 24;
  score += Math.min(candidate.width / 1600, 1) * 10;
  score += Math.min(candidate.height / 1600, 1) * 6;
  score += candidate.titleScore;
  score += candidate.fromPage ? 10 : 0;

  if (faces.length === 1) {
    score += 14;
  } else {
    const second = ranked[1];
    const secondArea = second.box.w * second.box.h;
    const ratio = secondArea / faceArea;
    const confidenceRatio = Math.max(1, face.score) / Math.max(0.01, second.score);
    // A face twice the size of the nearest other face is likely the subject
    // of a crowd shot. A near-tie is a group photo where the crop could land
    // on the wrong person.
    score += ratio < 0.3 && confidenceRatio > 1.15 ? 5 : -40 * ratio;
  }

  const cx = face.box.x + face.box.w / 2;
  const cy = face.box.y + face.box.h / 2;
  score += Math.max(0, 1 - Math.abs(cx - candidate.width / 2) / (candidate.width * 0.55)) * 8;
  score += Math.max(0, 1 - Math.abs(cy - candidate.height * 0.38) / (candidate.height * 0.55)) * 8;

  // A little headroom above the face is what makes the hair crop usable.
  if (face.box.y > candidate.height * 0.06) score += 8;
  else score -= 8;

  // Faces near the edge produce ugly crops with the subject cut off.
  if (face.box.x < candidate.width * 0.03) score -= 12;
  if (face.box.x + face.box.w > candidate.width * 0.97) score -= 12;

  return score;
}

async function pickSource(celeb) {
  let candidates = [];

  if (celeb.override) {
    try {
      candidates = candidateOrder(await getOverrideCandidate(celeb));
      if (candidates.length === 0) {
        console.warn(`    ! ${celeb.name}: override "${celeb.override}" was not usable; falling back`);
      }
    } catch (err) {
      console.warn(`    ! ${celeb.name}: override "${celeb.override}" failed (${err.message}); falling back`);
    }
  }

  if (candidates.length === 0) {
    candidates = candidateOrder([
      ...(await getPageImageCandidate(celeb)),
      ...(await getSearchCandidates(celeb)),
    ]);
  }

  if (candidates.length === 0) {
    throw new Error("No usable portrait candidates found");
  }

  const shortlist = candidates.slice(0, 12);
  const downloaded = [];

  for (let i = 0; i < shortlist.length; i += 1) {
    const candidate = shortlist[i];
    const rawPath = join(CANDIDATE_DIR, `${celeb.slug}-${i}.raw`);
    const normalPath = join(CANDIDATE_DIR, `${celeb.slug}-${i}.jpg`);

    try {
      if (!force && existsSync(normalPath)) {
        const meta = await sharp(normalPath).metadata();
        downloaded.push({ ...candidate, path: normalPath, width: meta.width ?? candidate.width, height: meta.height ?? candidate.height });
        continue;
      }

      await download(candidate.url, rawPath);
      const dims = await normaliseImage(rawPath, normalPath);
      await rm(rawPath, { force: true });

      downloaded.push({ ...candidate, path: normalPath, width: dims.width, height: dims.height });
    } catch (err) {
      console.warn(`    ! ${celeb.name}: candidate "${candidate.title}" failed (${err.message})`);
    }

    // Two downloads in flight is enough to stay quick without tripping
    // Wikimedia's rate limiter.
    await sleep(120);
  }

  if (downloaded.length === 0) {
    throw new Error("Every portrait download failed");
  }

  const detections = await detectFaces(downloaded.map((candidate) => candidate.path));
  const scored = downloaded
    .map((candidate, index) => ({
      candidate,
      detection: detections[index],
      score: detectionScore(candidate, detections[index]),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];

  if (!best || best.score < 0) {
    throw new Error("No portrait contained a usable face");
  }

  if (best.candidate.width < 500 || best.candidate.height < 500) {
    console.warn(`    ! ${celeb.name}: chosen source is small (${best.candidate.width}x${best.candidate.height})`);
  }

  return best;
}

// ---------------------------------------------------------------------------
// Cropping
// ---------------------------------------------------------------------------

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function squareRect(imageWidth, imageHeight, cx, cy, requestedSize) {
  const size = Math.max(24, Math.min(requestedSize, imageWidth, imageHeight));
  const left = clamp(cx - size / 2, 0, imageWidth - size);
  const top = clamp(cy - size / 2, 0, imageHeight - size);
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(size),
    height: Math.round(size),
  };
}

async function writeCrop(sourcePath, outputPath, rect, size) {
  await sharp(sourcePath)
    .extract(rect)
    .resize(size, size, { fit: "cover", kernel: "lanczos3" })
    .modulate({ brightness: 1.02, saturation: 1.03 })
    .sharpen({ sigma: 0.55 })
    .jpeg({ quality: 87, chromaSubsampling: "4:4:4" })
    .toFile(outputPath);
}

async function createCrops(sourcePath, outDir, detection) {
  const meta = await sharp(sourcePath).metadata();
  const imageWidth = meta.width ?? 0;
  const imageHeight = meta.height ?? 0;
  const face = [...detection.faces].sort((a, b) => faceQuality(b) - faceQuality(a))[0];
  const box = face.box;
  const lm = face.landmarks;

  const eyeMid = midpoint(lm.rightEye, lm.leftEye);
  const mouthMid = midpoint(lm.mouthRight, lm.mouthLeft);
  const eyeDistance = Math.max(20, distance(lm.rightEye, lm.leftEye));
  const mouthWidth = Math.max(16, distance(lm.mouthRight, lm.mouthLeft));

  // The four crops deliberately overlap a little. Too tight and the feature
  // is unreadable at phone size; too wide and the game becomes trivial.
  const eyesSize = Math.max(box.w * 0.82, eyeDistance * 2.1, 100);
  const noseSize = Math.max(box.w * 0.5, 80);
  const lipsSize = Math.max(box.w * 0.42, mouthWidth * 1.8, 72);
  const hairSize = Math.max(box.w * 1.32, 150);

  const crops = {
    eyes: squareRect(imageWidth, imageHeight, eyeMid.x, eyeMid.y + eyeDistance * 0.16, eyesSize),
    nose: squareRect(imageWidth, imageHeight, lm.nose.x, lm.nose.y + box.h * 0.01, noseSize),
    lips: squareRect(imageWidth, imageHeight, mouthMid.x, mouthMid.y + mouthWidth * 0.1, lipsSize),
    hair: squareRect(
      imageWidth,
      imageHeight,
      box.x + box.w / 2,
      box.y - hairSize * 0.3,
      hairSize
    ),
  };

  const revealSize = Math.max(box.h * 1.6, box.w * 2.0, 260);
  const reveal = squareRect(
    imageWidth,
    imageHeight,
    box.x + box.w / 2,
    box.y + box.h * 0.55,
    revealSize
  );

  await mkdir(outDir, { recursive: true });

  for (const [name, rect] of Object.entries(crops)) {
    await writeCrop(sourcePath, join(outDir, `${name}.jpg`), rect, FEATURE_SIZE);
  }

  await writeCrop(sourcePath, join(outDir, "reveal.jpg"), reveal, REVEAL_SIZE);

  return { crops, reveal, face, eyeDistance, mouthWidth, imageWidth, imageHeight };
}

// ---------------------------------------------------------------------------
// Question generation
// ---------------------------------------------------------------------------

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWith(valueSeed, list) {
  const rng = seededRandom(valueSeed);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildQuestion(entry, all) {
  const rng = seededRandom(hashString(entry.slug));
  const sameGender = all.filter((other) => other.gender === entry.gender && other.slug !== entry.slug);

  // Prefer distractors from the same film industry. A question where the
  // answer is the only South Indian name is too easy to eliminate.
  const sameRegion = sameGender.filter((other) => other.region === entry.region);
  const otherRegion = sameGender.filter((other) => other.region !== entry.region);

  const distractors = [
    ...shuffleWith(rng() * 1e9, sameRegion),
    ...shuffleWith(rng() * 1e9, otherRegion),
  ]
    .slice(0, 3)
    .map((other) => other.name);

  const correctIndex = Math.floor(rng() * 4);
  const options = [...distractors];
  options.splice(correctIndex, 0, entry.name);

  return {
    prompt: "Whose eyes, nose, lips and hair are these?",
    options,
    correctIndex,
    points: 100,
    difficulty: entry.difficulty,
    media: {
      celebrity: entry.name,
      eyes: `${GAME_PATH}/${entry.slug}/eyes.jpg`,
      nose: `${GAME_PATH}/${entry.slug}/nose.jpg`,
      lips: `${GAME_PATH}/${entry.slug}/lips.jpg`,
      hair: `${GAME_PATH}/${entry.slug}/hair.jpg`,
      reveal: `${GAME_PATH}/${entry.slug}/reveal.jpg`,
    },
  };
}

// ---------------------------------------------------------------------------
// Output files
// ---------------------------------------------------------------------------

function sqlString(value) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

function buildSql(entries) {
  const lines = [];

  lines.push("-- ===========================================================================");
  lines.push("-- CELEB CLOSE-UP");
  lines.push("--");
  lines.push("-- Generated by backend/scripts/build-celeb-images.mjs. Do not hand-edit");
  lines.push("-- the question rows; change the manifest and rebuild instead.");
  lines.push("--");
  lines.push("-- Adds a nullable media JSON column to questions, registers the game and");
  lines.push("-- seeds one question per celebrity. The image files themselves live in");
  lines.push("-- backend/public/celebrities/celeb-closeup/<slug>/.");
  lines.push("-- ===========================================================================");
  lines.push("");
  lines.push("SET NAMES utf8mb4;");
  lines.push("");
  lines.push("ALTER TABLE `questions` ADD COLUMN `media` JSON NULL AFTER `options`;");
  lines.push("");
  lines.push("INSERT INTO `mini_games`");
  lines.push(
    "  (code, name, emoji, tagline, category, duration_seconds, max_score, coins_per_1000, config, color_from, color_to, sort_order)"
  );
  lines.push("VALUES");
  lines.push(
    `  ('${GAME_CODE}', 'Celeb Close-Up', '🕵️', 'Guess the star from eyes, nose, lips and hair', 'india', 45, 1200, 10, JSON_OBJECT('questionCount', 10, 'revealAnswer', true, 'features', JSON_ARRAY('eyes','nose','lips','hair')), '#db2777', '#7c3aed', 6)`
  );
  lines.push(
    "ON DUPLICATE KEY UPDATE name = VALUES(name), tagline = VALUES(tagline), duration_seconds = VALUES(duration_seconds), max_score = VALUES(max_score), coins_per_1000 = VALUES(coins_per_1000), config = VALUES(config), color_from = VALUES(color_from), color_to = VALUES(color_to), sort_order = VALUES(sort_order);"
  );
  lines.push("");
  lines.push("-- One question per celebrity. `media` stores the four feature crops and the");
  lines.push("-- full portrait shown after the answer. The API strips `celebrity` before");
  lines.push("-- sending the question to a client.");
  lines.push("");

  for (const entry of entries) {
    const question = buildQuestion(entry, entries);
    const optionsJson = JSON.stringify(question.options);
    const mediaJson = JSON.stringify(question.media);
    const explanation = `${entry.name} — every close-up is from the same portrait.`;
    const prompt = question.prompt;

    lines.push(
      "INSERT INTO `questions` (`game_id`, `prompt`, `options`, `correct_index`, `explanation`, `difficulty`, `points`, `media`)"
    );
    lines.push("SELECT g.id, " +
      [
        sqlString(prompt),
        sqlString(optionsJson),
        String(question.correctIndex),
        sqlString(explanation),
        sqlString(question.difficulty),
        String(question.points),
        sqlString(mediaJson),
      ].join(", "));
    lines.push("  FROM `mini_games` g");
    lines.push(
      ` WHERE g.code = '${GAME_CODE}' AND NOT EXISTS (SELECT 1 FROM questions q WHERE q.game_id = g.id AND JSON_UNQUOTE(JSON_EXTRACT(q.media, '$.celebrity')) = ${sqlString(entry.name)});`
    );
    lines.push("");
  }

  lines.push("-- Confirm the bank landed where it should.");
  lines.push("SELECT g.code, COUNT(q.id) AS question_count");
  lines.push("  FROM `mini_games` g");
  lines.push("  LEFT JOIN `questions` q ON q.game_id = g.id");
  lines.push(` WHERE g.code = '${GAME_CODE}'`);
  lines.push(" GROUP BY g.code;");
  lines.push("");

  return lines.join("\n");
}

function buildAttribution(entries) {
  const lines = [
    "# Celeb Close-Up image credits",
    "",
    "All source portraits were downloaded from Wikipedia / Wikimedia Commons.",
    "The close-up images in this folder are crops of those portraits.",
    "",
    "Licenses are recorded from the Commons API at build time. Many are CC BY-SA",
    "or CC BY. If you redistribute the app, keep this file with it and check each",
    "license before publishing. Publicity / personality rights are separate from",
    "copyright and may still apply to a celebrity's likeness.",
    "",
    "| Celebrity | Source file | Author | License | Source |",
    "|---|---|---|---|---|",
  ];

  for (const entry of entries) {
    const source = entry.source;
    const credit = source.artist.replace(/\|/g, "/").slice(0, 100);
    lines.push(
      `| ${entry.name} | ${source.title.replace(/\|/g, "/")} | ${credit} | ${source.license} | [Commons](${source.pageUrl}) |`
    );
  }

  lines.push("");
  lines.push("_Generated by backend/scripts/build-celeb-images.mjs._");
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// QA contact sheets
// ---------------------------------------------------------------------------

function svgText(text, x, y, size = 15, color = "#f8f7ff", weight = "bold") {
  const safe = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${safe}</text>`;
}

async function buildQaSheets(entries) {
  await mkdir(QA_DIR, { recursive: true });
  const perSheet = 8;
  const rowHeight = 158;
  const labelWidth = 190;
  const sourceW = 112;
  const featureW = 128;
  const revealW = 112;
  const gap = 6;
  const width = labelWidth + sourceW + featureW * 4 + revealW + gap * 8 + 20;

  for (let sheetIndex = 0; sheetIndex * perSheet < entries.length; sheetIndex += 1) {
    const chunk = entries.slice(sheetIndex * perSheet, sheetIndex * perSheet + perSheet);
    const height = chunk.length * (rowHeight + gap) + 20;

    const composite = [];
    const baseSvg = [
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`,
      `<rect width="100%" height="100%" fill="#15112e"/>`,
    ];

    let y = 10;
    for (const entry of chunk) {
      const sourceRect = join(entry.outputDir, "reveal.jpg");
      const thumbs = [
        ["EYES", join(entry.outputDir, "eyes.jpg")],
        ["NOSE", join(entry.outputDir, "nose.jpg")],
        ["LIPS", join(entry.outputDir, "lips.jpg")],
        ["HAIR", join(entry.outputDir, "hair.jpg")],
      ];

      baseSvg.push(svgText(entry.name, 10, y + 26, 16));
      baseSvg.push(svgText(entry.source.license.slice(0, 24), 10, y + 46, 10, "#9d93d6", "normal"));
      baseSvg.push(svgText(`${entry.source.originalWidth}x${entry.source.originalHeight}`, 10, y + 62, 10, "#9d93d6", "normal"));

      let x = labelWidth;
      composite.push({
        input: await sharp(sourceRect).resize(sourceW, rowHeight - 16, { fit: "cover" }).jpeg().toBuffer(),
        left: x,
        top: y,
      });
      x += sourceW + gap;

      for (const [label, file] of thumbs) {
        baseSvg.push(svgText(label, x + 4, y + 14, 10, "#fbbf24", "normal"));
        composite.push({
          input: await sharp(file).resize(featureW, rowHeight - 16, { fit: "cover" }).jpeg().toBuffer(),
          left: x,
          top: y,
        });
        x += featureW + gap;
      }

      baseSvg.push(svgText("REVEAL", x + 4, y + 14, 10, "#fbbf24", "normal"));
      composite.push({
        input: await sharp(sourceRect).resize(revealW, rowHeight - 16, { fit: "cover" }).jpeg().toBuffer(),
        left: x,
        top: y,
      });

      y += rowHeight + gap;
    }

    baseSvg.push("</svg>");
    composite.unshift({ input: Buffer.from(baseSvg.join("")), left: 0, top: 0 });

    const out = join(QA_DIR, `celeb-sheet-${sheetIndex + 1}.jpg`);
    await sharp({ create: { width, height, channels: 3, background: "#15112e" } })
      .composite(composite)
      .jpeg({ quality: 85 })
      .toFile(out);
    console.log(`  QA sheet: ${out}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nCeleb Close-Up image build — ${selectedCelebrities.length} celebrities\n`);

  await mkdir(PUBLIC_DIR, { recursive: true });
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(CANDIDATE_DIR, { recursive: true });
  await mkdir(SOURCE_DIR, { recursive: true });
  await ensureFaceModel();

  const built = [];

  for (let index = 0; index < selectedCelebrities.length; index += 1) {
    const celeb = selectedCelebrities[index];
    const outDir = join(PUBLIC_DIR, celeb.slug);
    const outputFiles = ["eyes.jpg", "nose.jpg", "lips.jpg", "hair.jpg", "reveal.jpg"];
    const alreadyBuilt =
      !force &&
      outputFiles.every((file) => existsSync(join(outDir, file))) &&
      existsSync(join(SOURCE_DIR, `${celeb.slug}.jpg`));

    process.stdout.write(
      `[${String(index + 1).padStart(2, "0")}/${selectedCelebrities.length}] ${celeb.name} ... `
    );

    if (alreadyBuilt) {
      const cachedManifest = existsSync(MANIFEST_PATH)
        ? JSON.parse(await readFile(MANIFEST_PATH, "utf8"))
        : null;
      const previous = cachedManifest?.celebrities?.find((item) => item.slug === celeb.slug);
      if (previous) {
        built.push({ ...previous, outputDir: outDir });
        console.log("cached");
        continue;
      }
    }

    try {
      const best = await pickSource(celeb);
      const sourcePath = join(SOURCE_DIR, `${celeb.slug}.jpg`);
      await copyFile(best.candidate.path, sourcePath);

      const cropResult = await createCrops(sourcePath, outDir, best.detection);
      const relativeDir = `${GAME_PATH}/${celeb.slug}`;

      const entry = {
        slug: celeb.slug,
        name: celeb.name,
        gender: celeb.gender,
        region: celeb.region,
        difficulty: celeb.difficulty,
        images: {
          eyes: `${relativeDir}/eyes.jpg`,
          nose: `${relativeDir}/nose.jpg`,
          lips: `${relativeDir}/lips.jpg`,
          hair: `${relativeDir}/hair.jpg`,
          reveal: `${relativeDir}/reveal.jpg`,
        },
        source: {
          title: best.candidate.title.replace(/^File:/i, ""),
          pageUrl: best.candidate.pageUrl,
          imageUrl: best.candidate.sourceUrl,
          license: best.candidate.license,
          licenseUrl: best.candidate.licenseUrl,
          artist: best.candidate.artist,
          credit: best.candidate.credit,
          description: best.candidate.description,
          date: best.candidate.date,
          originalWidth: best.candidate.originalWidth,
          originalHeight: best.candidate.originalHeight,
        },
        crop: {
          face: best.detection.faces[0].box,
          sourceWidth: cropResult.imageWidth,
          sourceHeight: cropResult.imageHeight,
          score: Math.round(best.score),
        },
        outputDir: outDir,
      };

      built.push(entry);
      console.log(
        `ok (${best.candidate.width}x${best.candidate.height}, face ${Math.round(best.detection.faces[0].box.w)}px)`
      );
    } catch (err) {
      console.log("FAILED");
      console.warn(`  ${celeb.name}: ${err.message}`);
      console.warn("  Drop this slug from celeb-manifest.mjs or add a hand-picked source.");
    }
  }

  // Keep the manifest self-contained: sort by the manifest order, not by
  // whichever entries happened to be rebuilt in this run.
  //
  // A full run starts from scratch (a celebrity that failed must not survive
  // in the manifest). A targeted --only run instead starts from the existing
  // manifest, so rebuilding one bad crop does not drop the other 46 entries.
  const bySlug = new Map();
  if (only && existsSync(MANIFEST_PATH)) {
    try {
      const previous = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
      for (const entry of previous.celebrities ?? []) {
        bySlug.set(entry.slug, { ...entry, outputDir: join(PUBLIC_DIR, entry.slug) });
      }
    } catch {
      console.warn("  ! existing manifest could not be read; starting from this run only");
    }
  }

  for (const entry of built) bySlug.set(entry.slug, entry);

  // A selected celebrity that failed must not be reported as still available.
  if (only) {
    for (const celeb of selectedCelebrities) {
      if (!built.some((entry) => entry.slug === celeb.slug)) bySlug.delete(celeb.slug);
    }
  }

  const finalEntries = CELEBRITIES.filter((celeb) => bySlug.has(celeb.slug)).map((celeb) => {
    const entry = bySlug.get(celeb.slug);
    const { outputDir, ...clean } = entry;
    return { ...clean, outputDir };
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    game: GAME_CODE,
    featureSize: FEATURE_SIZE,
    revealSize: REVEAL_SIZE,
    source: "Wikipedia / Wikimedia Commons",
    celebrities: finalEntries.map(({ outputDir, ...entry }) => entry),
  };

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  await writeFile(ATTRIBUTION_PATH, buildAttribution(finalEntries));

  if (!only) {
    await writeFile(SQL_PATH, buildSql(finalEntries));
    console.log(`\n  manifest:    ${MANIFEST_PATH}`);
    console.log(`  attribution: ${ATTRIBUTION_PATH}`);
    console.log(`  SQL seed:    ${SQL_PATH}`);
  }

  if (!skipQa && finalEntries.length > 0) {
    console.log("\n  building QA contact sheets...");
    await buildQaSheets(finalEntries);
    console.log(`  QA folder:   ${QA_DIR}`);
  }

  const builtCount = selectedCelebrities.filter((celeb) =>
    built.some((entry) => entry.slug === celeb.slug)
  ).length;

  console.log(`\nDone: ${builtCount}/${selectedCelebrities.length} celebrities built.`);

  if (builtCount < selectedCelebrities.length) {
    process.exitCode = 2;
  }
}

await main();
